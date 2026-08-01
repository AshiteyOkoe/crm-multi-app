"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Eye } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { cn, formatDateTime, formatMoney, formatNumber } from "@/lib/utils";
import type { Paginated, Sale } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";

const METHOD_TONES: Record<string, "green" | "blue" | "violet"> = { CASH: "green", CARD: "blue", MOBILE_MONEY: "violet" };

export function SalesHistory() {
  const { isAdmin, isManager, branches } = useApp();
  const [items, setItems] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Sale | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<Sale> & { revenue: number }>("/sales", {
        params: { page, pageSize: 20, search: search || undefined, branchId: branchId || undefined, from: from || undefined, to: to || undefined },
      });
      setItems(res.items);
      setTotal(res.total);
      setPages(res.pages);
      setRevenue(res.revenue ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, search, branchId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: string) => {
    const sale = await api<Sale>(`/sales/${id}`);
    setSelected(sale);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 lg:flex-row lg:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search invoice or customer..." className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm" />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {isAdmin && (
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-700" />
          <span className="text-sm text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-700" />
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner label="Loading sales..." />
        ) : items.length === 0 ? (
          <EmptyState title="No sales found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Cashier</th>
                  <th className="px-4 py-3 text-right font-medium">Items</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{s.invoiceNo}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(s.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.customer?.name ?? "Walk-in"}</td>
                    <td className="px-4 py-3 text-gray-600">{s.branch?.code}</td>
                    <td className="px-4 py-3"><Badge tone={METHOD_TONES[s.paymentMethod]}>{s.paymentMethod.replace("_", " ")}</Badge></td>
                    <td className="px-4 py-3 text-gray-600">{s.user?.name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatNumber(s.items.reduce((x, i) => x + i.quantity, 0))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(s.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone={s.status === "COMPLETED" ? "green" : s.status === "REFUNDED" ? "amber" : "red"}>{s.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openDetail(s.id)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-brand-600">
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-2">
          {isManager && (
            <p className="text-xs text-gray-500">Filtered revenue: <span className="font-semibold text-gray-900">{formatMoney(revenue)}</span></p>
          )}
          <Pagination page={page} pages={pages} onPage={setPage} total={total} />
        </div>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Invoice ${selected?.invoiceNo ?? ""}`} wide>
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-gray-400">Date</p><p className="font-medium">{formatDateTime(selected.createdAt)}</p></div>
              <div><p className="text-xs text-gray-400">Customer</p><p className="font-medium">{selected.customer?.name ?? "Walk-in"}</p></div>
              <div><p className="text-xs text-gray-400">Cashier</p><p className="font-medium">{selected.user?.name}</p></div>
              <div><p className="text-xs text-gray-400">Status</p><Badge tone={selected.status === "COMPLETED" ? "green" : "amber"}>{selected.status}</Badge></div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Unit price</th>
                  <th className="py-2 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {selected.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2">{item.productName}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">{formatMoney(item.unitPrice)}</td>
                    <td className="py-2 text-right font-medium">{formatMoney(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end space-y-1 text-sm">
              <div className="w-48 space-y-1">
                <p className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatMoney(selected.subtotal)}</span></p>
                <p className="flex justify-between text-gray-500"><span>Discount</span><span>-{formatMoney(selected.discount)}</span></p>
                <p className="flex justify-between border-t border-gray-100 pt-1 font-bold"><span>Total</span><span>{formatMoney(selected.total)}</span></p>
              </div>
            </div>
            <p className={cn("text-xs", selected.returns?.some((r) => r.status === "PENDING") ? "text-amber-600" : "text-gray-400")}>
              {selected.returns?.some((r) => r.status === "PENDING") ? "A return is pending approval." : ""}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
