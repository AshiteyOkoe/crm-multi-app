"use client";

import { useCallback, useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileDown, FileText } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api, API_URL, getToken } from "@/lib/api";
import { downloadTextFile, formatMoney, formatNumber } from "@/lib/utils";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { AreaTrend, SimpleBars, DonutChart } from "@/components/charts/Charts";

type Period = "day" | "week" | "month" | "year";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

export default function ReportsPage() {
  const [tab, setTab] = useState("sales");
  const [period, setPeriod] = useState<Period>("month");
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<any>(null);
  const [leads, setLeads] = useState<any>(null);
  const [customers, setCustomers] = useState<any>(null);
  const { isAdmin, branches } = useApp();

  const branchParams = { period, branchId: branchId || undefined };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "sales") setSales(await api<any>("/reports/sales", { params: branchParams }));
      if (tab === "leads") setLeads(await api<any>("/reports/leads", { params: branchParams }));
      if (tab === "customers") setCustomers(await api<any>("/reports/customers", { params: branchParams }));
    } finally {
      setLoading(false);
    }
  }, [tab, period, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = () => {
    const token = getToken();
    const url = `${API_URL}/reports/export/${tab}?period=${period}${branchId ? `&branchId=${branchId}` : ""}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${tab}-report-${period}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`CRM Report — ${tab.toUpperCase()}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Period: ${period}`, 14, 25);

    const rows: string[][] = [];
    const headers: string[] = [];

    if (tab === "sales" && sales) {
      headers.push("Branch", "Revenue", "Transactions");
      sales.byBranch.forEach((b: any) => rows.push([b.name, formatMoney(b.revenue), String(b.count)]));
      autoTable(doc, { startY: 32, head: [headers], body: rows });
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Best selling products", 14, 18);
      autoTable(doc, {
        startY: 24,
        head: [["Product", "Quantity", "Revenue"]],
        body: sales.bestSellers.map((b: any) => [b.name, String(b.quantity), formatMoney(b.revenue)]),
      });
    } else if (tab === "leads" && leads) {
      headers.push("Source", "Leads", "Won");
      leads.bySource.forEach((s: any) => rows.push([s.source, String(s.count), String(s.won)]));
      autoTable(doc, { startY: 32, head: [headers], body: rows });
    } else if (tab === "customers" && customers) {
      headers.push("Month", "New customers");
      customers.monthly.forEach((m: any) => rows.push([m.month, String(m.count)]));
      autoTable(doc, { startY: 32, head: [headers], body: rows });
    }

    doc.save(`crm-${tab}-report-${period}.pdf`);
  };

  const periodSelect = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${period === p.key ? "bg-brand-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {isAdmin && (
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-700">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <Button variant="outline" size="sm" onClick={exportCsv}><FileDown className="h-3.5 w-3.5" /> CSV</Button>
      <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="h-3.5 w-3.5" /> PDF</Button>
    </div>
  );

  return (
    <div>
      <PageHeader breadcrumb="Analytics" title="Reports & Analytics" subtitle="Financial, pipeline and growth insights" actions={periodSelect} />
      <Tabs
        tabs={[{ key: "sales", label: "Sales & revenue" }, { key: "leads", label: "Leads & pipeline" }, { key: "customers", label: "Customer growth" }]}
        active={tab}
        onChange={setTab}
      />
      <div className="pt-5">
        {loading && !(sales || leads || customers) ? (
          <Spinner label="Generating report..." />
        ) : (
          <>
            {tab === "sales" && sales && <SalesReport data={sales} />}
            {tab === "leads" && leads && <LeadsReport data={leads} />}
            {tab === "customers" && customers && <CustomersReport data={customers} />}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ items }: { items: { label: string; value: string; tone?: "green" | "amber" | "red" | "blue" }[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((s) => (
        <Card key={s.label} className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{s.value}</p>
          {s.tone && <Badge tone={s.tone} className="mt-1">{s.tone}</Badge>}
        </Card>
      ))}
    </div>
  );
}

function SalesReport({ data }: { data: any }) {
  const s = data.summary;
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Total revenue", value: formatMoney(s.totalRevenue), tone: "green" },
          { label: "Gross profit", value: formatMoney(s.grossProfit) },
          { label: "Profit margin", value: `${s.profitMargin.toFixed(1)}%`, tone: "blue" },
          { label: "Transactions", value: formatNumber(s.totalTransactions) },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Revenue trend</CardTitle></CardHeader>
          <CardContent><AreaTrend data={data.revenueTrend} xKey="date" yKey="revenue" height={280} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By payment method</CardTitle></CardHeader>
          <CardContent><DonutChart data={data.byPaymentMethod} nameKey="method" valueKey="revenue" /></CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Best selling products</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium">Product</th><th className="px-4 py-2.5 text-right font-medium">Qty</th><th className="px-4 py-2.5 text-right font-medium">Revenue</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.bestSellers.map((b: any) => (
                  <tr key={b.productId}><td className="px-4 py-2.5 text-gray-800">{b.name}</td><td className="px-4 py-2.5 text-right">{formatNumber(b.quantity)}</td><td className="px-4 py-2.5 text-right font-medium">{formatMoney(b.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Staff performance</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium">Staff</th><th className="px-4 py-2.5 text-right font-medium">Sales</th><th className="px-4 py-2.5 text-right font-medium">Revenue</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.staffPerformance.map((b: any) => (
                  <tr key={b.userId}><td className="px-4 py-2.5 text-gray-800">{b.name}</td><td className="px-4 py-2.5 text-right">{b.count}</td><td className="px-4 py-2.5 text-right font-medium">{formatMoney(b.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LeadsReport({ data }: { data: any }) {
  const s = data.summary;
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Total leads", value: formatNumber(s.total) },
          { label: "Won", value: formatNumber(s.won), tone: "green" },
          { label: "Conversion rate", value: `${s.conversionRate.toFixed(1)}%`, tone: "blue" },
          { label: "Pipeline value", value: formatMoney(s.pipelineValue) },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Leads by source</CardTitle></CardHeader>
          <CardContent><SimpleBars data={data.bySource} xKey="source" yKey="count" height={260} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pipeline by stage</CardTitle></CardHeader>
          <CardContent><DonutChart data={data.byStatus} nameKey="status" valueKey="count" /></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Performance by representative</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2.5 font-medium">Rep</th><th className="px-4 py-2.5 text-right font-medium">Leads</th><th className="px-4 py-2.5 text-right font-medium">Won</th><th className="px-4 py-2.5 text-right font-medium">Value</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {data.byAssignee.map((a: any) => (
                <tr key={a.name}><td className="px-4 py-2.5 text-gray-800">{a.name}</td><td className="px-4 py-2.5 text-right">{a.total}</td><td className="px-4 py-2.5 text-right">{a.won}</td><td className="px-4 py-2.5 text-right font-medium">{formatMoney(a.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function CustomersReport({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Total customers", value: formatNumber(data.totalCustomers) },
          { label: "New this period", value: formatNumber(data.newInPeriod), tone: "green" },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New customers per month</CardTitle></CardHeader>
          <CardContent><SimpleBars data={data.monthly} xKey="month" yKey="count" height={260} color="#8b5cf6" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By segment</CardTitle></CardHeader>
          <CardContent><DonutChart data={data.bySegment} nameKey="segment" valueKey="count" /></CardContent>
        </Card>
      </div>
    </div>
  );
}
