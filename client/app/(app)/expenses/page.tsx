"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Wallet, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/utils";
import type { Expense, ExpenseCategory, Paginated } from "@/types";
import { EXPENSE_CATEGORY_LABELS } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PnlSummary } from "@/components/reports/PnlSummary";

const CATEGORY_TONES: Record<ExpenseCategory, "gray" | "blue" | "amber" | "red" | "green" | "violet"> = {
  RENT: "violet",
  SALARIES: "blue",
  UTILITIES: "amber",
  SUPPLIES: "green",
  MARKETING: "red",
  MAINTENANCE: "gray",
  TRANSPORT: "blue",
  OTHER: "gray",
};

export default function ExpensesPage() {
  const { isAdmin, isManager, branches, user } = useApp();
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ branchId: "", category: "RENT" as ExpenseCategory, description: "", amount: "", expenseDate: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ totalAmount: number; byCategory: { category: string; amount: number; count: number }[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<Expense>>("/expenses", { params: { pageSize: 100, branchId: branchFilter || undefined } });
      setItems(res.items);
      const s = await api<any>("/expenses/summary", { params: { branchId: branchFilter || undefined } });
      setSummary(s);
    } finally {
      setLoading(false);
    }
  }, [branchFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await api("/expenses", {
        method: "POST",
        body: {
          branchId: form.branchId || user?.branchId || undefined,
          category: form.category,
          description: form.description,
          amount: Number(form.amount),
          expenseDate: form.expenseDate || undefined,
        },
      });
      setModalOpen(false);
      setForm({ branchId: "", category: "RENT", description: "", amount: "", expenseDate: "" });
      load();
    } catch (err: any) {
      setError(err?.message ?? "Could not record expense");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    await api(`/expenses/${id}`, { method: "DELETE" });
    load();
  };

  const totalThisPage = items.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader breadcrumb="Operations" title="Expenses & P&L" subtitle="Track operating costs and see your true profit"
        actions={<Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Record expense</Button>} />

      <PnlSummary />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">Expenses</h3>
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm">
                    <option value="">All branches</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                <Badge tone="amber">{formatMoney(totalThisPage)}</Badge>
              </div>
            </div>
            {loading ? (
              <Spinner label="Loading expenses..." />
            ) : items.length === 0 ? (
              <EmptyState title="No expenses recorded" description="Record your first operating cost to unlock a full P&L." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Description</th>
                      <th className="px-5 py-3 font-medium">Category</th>
                      <th className="px-5 py-3 font-medium">Branch</th>
                      <th className="px-5 py-3 text-right font-medium">Amount</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50/60">
                        <td className="whitespace-nowrap px-5 py-3 text-gray-500">{formatDate(e.expenseDate)}</td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900">{e.description}</p>
                          <p className="text-xs text-gray-400">{e.createdBy?.name ?? ""}</p>
                        </td>
                        <td className="px-5 py-3"><Badge tone={CATEGORY_TONES[e.category]}>{EXPENSE_CATEGORY_LABELS[e.category]}</Badge></td>
                        <td className="px-5 py-3 text-gray-600">{e.branch?.code ?? "—"}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">{formatMoney(e.amount)}</td>
                        <td className="px-5 py-3 text-right">
                          {(isAdmin || isManager) && (
                            <button onClick={() => remove(e.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card className="h-fit p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-gray-900">Expense summary</h3>
          </div>
          {!summary ? (
            <Spinner label="Loading..." />
          ) : (
            <div className="space-y-3">
              {summary.byCategory.length === 0 && <p className="text-xs text-gray-400">No expenses for the selected scope.</p>}
              {summary.byCategory.map((c) => (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{EXPENSE_CATEGORY_LABELS[c.category as ExpenseCategory] ?? c.category}</span>
                    <span className="font-semibold text-gray-900">{formatMoney(c.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                    <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${summary.totalAmount > 0 ? (c.amount / summary.totalAmount) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
                <span className="font-medium text-gray-600">Total</span>
                <span className="text-base font-bold text-gray-900">{formatMoney(summary.totalAmount)}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record expense"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={submit} loading={saving}>Save expense</Button></>}>
        {error && <Alert kind="error" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" required>
              <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Amount" required>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </Field>
          </div>
          <Field label="Description" required>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. August shop rent" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {(isAdmin || !user?.branchId) && (
              <Field label="Branch">
                <Select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                  <option value="">{user?.branchId ? "My branch" : "Select branch"}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Expense date">
              <Input type="date" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
