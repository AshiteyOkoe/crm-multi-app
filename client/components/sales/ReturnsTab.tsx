"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Check, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";
import type { Paginated, Return, Sale } from "@/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Textarea, Field } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";

export function ReturnsTab() {
  const { isManager } = useApp();
  const [items, setItems] = useState<Return[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [form, setForm] = useState({ saleId: "", reason: "", amount: "" });
  const [saleSearch, setSaleSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<Return>>("/branches/returns", { params: { page, pageSize: 20, status: status || undefined } });
      setItems(res.items);
      setTotal(res.total);
      setPages(res.pages);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!requestOpen) return;
    const t = setTimeout(async () => {
      try {
        const res = await api<Paginated<Sale>>("/sales", { params: { search: saleSearch || undefined, pageSize: 8, status: "COMPLETED" } });
        setSales(res.items);
      } catch {
        setSales([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [saleSearch, requestOpen]);

  const submitRequest = async () => {
    setError(null);
    if (!form.saleId || !form.reason || !form.amount) return setError("Complete all fields.");
    setSaving(true);
    try {
      await api("/sales/returns", { method: "POST", body: { saleId: form.saleId, reason: form.reason, amount: Number(form.amount) } });
      setRequestOpen(false);
      setForm({ saleId: "", reason: "", amount: "" });
      load();
    } catch (err: any) {
      setError(err?.message ?? "Could not submit return");
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id: string, action: "APPROVED" | "REJECTED") => {
    await api(`/branches/returns/${id}/decide`, { method: "POST", body: { action } });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <span className="text-xs text-gray-500">{total} returns</span>
        <Button onClick={() => { setError(null); setRequestOpen(true); }} className="ml-auto">
          <RotateCcw className="h-4 w-4" /> Request return
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner label="Loading returns..." />
        ) : items.length === 0 ? (
          <EmptyState title="No returns" description="Return requests and their approval status appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {isManager && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{r.sale?.invoiceNo}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(r.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.branch?.name}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-600">{r.reason}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(r.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.user?.name}</td>
                    <td className="px-4 py-3">
                      <Badge tone={r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : "amber"} dot>{r.status}</Badge>
                    </td>
                    {isManager && (
                      <td className="px-4 py-3">
                        {r.status === "PENDING" ? (
                          <div className="flex gap-1.5">
                            <button onClick={() => decide(r.id, "APPROVED")} className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 hover:bg-emerald-100" title="Approve">
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={() => decide(r.id, "REJECTED")} className="rounded-lg bg-red-50 p-1.5 text-red-600 hover:bg-red-100" title="Reject">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">{r.approvedBy?.name}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} onPage={setPage} total={total} />
      </Card>

      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request a return"
        footer={
          <>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button onClick={submitRequest} loading={saving}>Submit request</Button>
          </>
        }
      >
        {error && <Alert kind="error" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <Field label="Find completed sale" required>
            <Input value={saleSearch} onChange={(e) => setSaleSearch(e.target.value)} placeholder="Search invoice or customer..." />
          </Field>
          <Select value={form.saleId} onChange={(e) => setForm((f) => ({ ...f, saleId: e.target.value }))}>
            <option value="">Select a sale...</option>
            {sales.map((s) => (
              <option key={s.id} value={s.id}>{s.invoiceNo} — {s.customer?.name ?? "Walk-in"} · {formatMoney(s.total)}</option>
            ))}
          </Select>
          <Field label="Amount to refund" required>
            <Input type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
          </Field>
          <Field label="Reason" required>
            <Textarea rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why is this being returned?" />
          </Field>
          <p className={cn("text-xs text-gray-400")}>Manager approval is required. Stock is restored automatically once approved.</p>
        </div>
      </Modal>
    </div>
  );
}
