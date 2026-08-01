"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DollarSign, Receipt, TrendingUp, Users, AlertTriangle, Trophy, ArrowRight,
  Phone, CalendarClock, Activity,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { formatMoney, formatNumber, timeAgo } from "@/lib/utils";
import type { DashboardData } from "@/types";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { AreaTrend } from "@/components/charts/Charts";

export default function DashboardPage() {
  const { user, isAdmin } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<DashboardData>("/reports/dashboard", { params: { branchId: branchFilter || undefined } });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [branchFilter]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <Spinner label="Loading dashboard..." />;
  if (!data) return <EmptyState title="Could not load dashboard" />;

  const { kpis, branchComparison, lowStock, revenueTrend, recentSales, activityFeed, upcomingFollowUps, topBranch } = data;

  const visibleBranches = isAdmin ? branchComparison : branchComparison.filter((b) => b.id === user?.branchId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Good day, {user?.name?.split(" ")[0] ?? "there"} 👋</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? "Live snapshot across all branches" : `Live snapshot — ${user?.branch?.name ?? "your branch"}`}
          </p>
        </div>
        {isAdmin && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="h-10 w-56 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
          >
            <option value="">All branches</option>
            {branchComparison.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </select>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's revenue" value={formatMoney(kpis.todayRevenue)} icon={<DollarSign className="h-5 w-5" />} accent="blue" sub={`${formatNumber(kpis.todayTransactions)} transactions today`} />
        <StatCard label="Monthly revenue" value={formatMoney(kpis.monthRevenue)} icon={<TrendingUp className="h-5 w-5" />} accent="green" sub={`${formatNumber(kpis.monthCount)} sales this month`} />
        <StatCard label="Total customers" value={formatNumber(kpis.totalCustomers)} icon={<Users className="h-5 w-5" />} accent="violet" sub="Unified across all branches" />
        <StatCard label="Open leads" value={formatNumber(kpis.openLeads)} icon={<Phone className="h-5 w-5" />} accent="amber" sub={`${formatNumber(kpis.wonLeads)} won · ${formatNumber(kpis.lostLeads)} lost`} />
      </div>

      {topBranch && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5">
          <Trophy className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{topBranch.name}</span> is the top-performing branch this month.
          </p>
        </div>
      )}

      {/* Branch comparison (owner) */}
      {isAdmin && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Branch comparison</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {visibleBranches.map((b) => (
              <Card key={b.id} className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{b.name}</p>
                    <p className="text-xs text-gray-400">{b.code}</p>
                  </div>
                  <Badge tone={b.lowStockCount > 0 ? "red" : "green"} dot>
                    {b.lowStockCount > 0 ? `${b.lowStockCount} low stock` : "Healthy stock"}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Today</p>
                    <p className="text-lg font-bold text-gray-900">{formatMoney(b.todayRevenue)}</p>
                    <p className="text-xs text-gray-500">{formatNumber(b.todayTransactions)} txns</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">This month</p>
                    <p className="text-lg font-bold text-gray-900">{formatMoney(b.monthRevenue)}</p>
                    <p className="text-xs text-gray-500">{formatNumber(b.monthTransactions)} txns</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Revenue trend + low stock */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Revenue trend — last 7 days</CardTitle>
            <Badge tone="blue">GHS</Badge>
          </CardHeader>
          <CardContent>
            <AreaTrend data={revenueTrend} xKey="date" yKey="revenue" height={260} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Low stock alerts</CardTitle>
            <Badge tone={lowStock.length ? "red" : "green"}>{lowStock.length ? `${lowStock.length} alerts` : "All clear"}</Badge>
          </CardHeader>
          <CardContent className="max-h-[320px] overflow-y-auto p-2 scrollbar-thin">
            {lowStock.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <AlertTriangle className="mb-2 h-6 w-6" />
                <p className="text-xs">No stock alerts</p>
              </div>
            )}
            <ul className="space-y-1">
              {lowStock.map((s) => (
                <li key={`${s.branchId}-${s.product.id}`} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{s.product.name}</p>
                    <p className="text-xs text-gray-500">{s.branch.name}</p>
                  </div>
                  <Badge tone={s.status === "OUT_OF_STOCK" ? "red" : "amber"}>
                    {s.status === "OUT_OF_STOCK" ? "Out" : `${s.quantity} left`}
                  </Badge>
                </li>
              ))}
            </ul>
            <Link href="/inventory" className="mt-2 flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-brand-600 hover:bg-brand-50">
              Manage inventory <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent sales + activity */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <Link href="/sales" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentSales.length === 0 && <EmptyState title="No sales yet" description="Sales logged at any branch will appear here." />}
            <ul className="divide-y divide-gray-50">
              {recentSales.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{s.invoiceNo}</p>
                    <p className="truncate text-xs text-gray-500">
                      {s.branch?.name} · {s.customer?.name ?? "Walk-in"} · {s.user?.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatMoney(s.total)}</p>
                    <p className="text-[10px] text-gray-400">{timeAgo(s.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-brand-600" /> Upcoming follow-ups
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {upcomingFollowUps.length === 0 && <p className="px-3 py-6 text-center text-xs text-gray-400">Nothing scheduled</p>}
              <ul className="space-y-1">
                {upcomingFollowUps.map((f) => (
                  <li key={f.id} className="rounded-lg px-3 py-2.5 hover:bg-gray-50">
                    <p className="text-sm font-medium text-gray-900">{f.subject}</p>
                    <p className="text-xs text-gray-500">
                      {f.lead?.name ?? f.customer?.name ?? "General"} · {f.assignee?.name}
                    </p>
                    <p className="text-[11px] text-brand-600">{timeAgo(f.scheduledAt)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-600" /> Activity feed
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[240px] overflow-y-auto p-2 scrollbar-thin">
              <ul className="space-y-1">
                {activityFeed.map((a) => (
                  <li key={a.id} className="rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                    <span className="font-medium text-gray-900">{a.userEmail ?? "system"}</span> {a.action.toLowerCase().replace(/_/g, " ")}
                    <span className="block text-[10px] text-gray-400">{timeAgo(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
