"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil, Phone, Mail, Building2, MapPin, StickyNote, Calendar, Award, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney, formatDate, formatDateTime, formatNumber, initials, cn } from "@/lib/utils";
import { TIER_LABELS, TIER_TONES } from "@/lib/loyalty";
import type { Customer, CustomerPayment, Interaction, Sale } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { CustomerFormModal } from "@/components/customers/CustomerFormModal";

interface CustomerDetail extends Customer {
  interactions: Interaction[];
  followUps: any[];
  opportunities: any[];
  sales: Sale[];
}

const SEGMENT_TONES: Record<string, "violet" | "blue" | "gray" | "green"> = {
  VIP: "violet", REGULAR: "blue", NEW: "green", INACTIVE: "gray",
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [note, setNote] = useState("");
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<CustomerDetail>(`/customers/${params.id}`);
      setCustomer(res);
      const p = await api<{ items: CustomerPayment[] }>(`/customers/${params.id}/payments`, { params: { pageSize: 25 } });
      setPayments(p.items);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const recordPayment = async () => {
    setPayError(null);
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return setPayError("Enter a valid amount.");
    setSaving(true);
    try {
      await api(`/customers/${customer!.id}/payments`, { method: "POST", body: { amount, note: payNote || undefined } });
      setPayModalOpen(false);
      setPayAmount("");
      setPayNote("");
      load();
    } catch (err: any) {
      setPayError(err?.message ?? "Could not record payment");
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await api("/customers/" + (customer?.id) + "/interactions", { method: "POST", body: { type: "NOTE", notes: note } });
    setNote("");
    load();
  };

  if (loading && !customer) return <Spinner label="Loading customer..." />;
  if (!customer) return <EmptyState title="Customer not found" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/customers" className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" /> Back to customers
        </Link>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-lg font-bold text-brand-700">
              {initials(customer.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
                <Badge tone={SEGMENT_TONES[customer.segment]}>{customer.segment}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                {customer.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{customer.phone}</span>}
                {customer.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{customer.email}</span>}
                {customer.company && <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{customer.company}</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                {customer.address && <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{customer.address}</span>}
                {customer.birthday && <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />Birthday {formatDate(customer.birthday)}</span>}
                {customer.preferredBranch && <span>Preferred: {customer.preferredBranch.name}</span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-right md:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Lifetime value</p>
              <p className="text-xl font-bold text-gray-900">{formatMoney(customer.lifetimeValue ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Purchases</p>
              <p className="text-xl font-bold text-gray-900">{customer.sales?.length ?? 0}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Loyalty points</p>
              <p className="text-xl font-bold text-brand-600">{formatNumber(customer.points ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Loyalty tier</p>
              <Badge tone={TIER_TONES[customer.tier ?? "BRONZE"]} className="mt-1.5">{TIER_LABELS[customer.tier ?? "BRONZE"]}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {(customer.creditLimit ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-brand-600" /> Credit account</CardTitle>
            <Button size="sm" onClick={() => setPayModalOpen(true)} disabled={(customer.creditBalance ?? 0) <= 0}>
              <Wallet className="h-3.5 w-3.5" /> Record payment
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-2 gap-4 border-b border-gray-100 px-5 py-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Credit limit</p>
                <p className="text-lg font-bold text-gray-900">{formatMoney(customer.creditLimit ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Outstanding</p>
                <p className={cn("text-lg font-bold", (customer.creditBalance ?? 0) > 0 ? "text-red-600" : "text-gray-900")}>{formatMoney(customer.creditBalance ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Available</p>
                <p className="text-lg font-bold text-emerald-600">{formatMoney((customer.creditLimit ?? 0) - (customer.creditBalance ?? 0))}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Usage</p>
                <p className="text-lg font-bold text-gray-900">
                  {customer.creditLimit ? Math.round(((customer.creditBalance ?? 0) / customer.creditLimit) * 100) : 0}%
                </p>
              </div>
            </div>
            {payments.length > 0 && (
              <ul className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{formatMoney(p.amount)}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(p.createdAt)} · {p.branch?.name} · {p.method}</p>
                    </div>
                    {p.note && <p className="text-xs text-gray-400">{p.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {customer.notes && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><StickyNote className="h-4 w-4 text-brand-600" /> Notes</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm text-gray-600">{customer.notes}</p></CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Purchase history</CardTitle>
            <Link href="/sales" className="text-xs font-medium text-brand-600">View sales</Link>
          </CardHeader>
          <CardContent className="p-0">
            {customer.sales?.length === 0 && <EmptyState title="No purchases yet" />}
            <ul className="divide-y divide-gray-50">
              {customer.sales?.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.invoiceNo}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(s.createdAt)} · {s.branch?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatMoney(s.total)}</p>
                    <Badge tone={s.status === "COMPLETED" ? "green" : s.status === "REFUNDED" ? "amber" : "red"}>{s.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Interactions</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addNote()}
                placeholder="Quick note or interaction..."
                className="h-10 flex-1 rounded-lg border border-gray-300 px-3 text-sm"
              />
              <button onClick={addNote} className="rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                Add
              </button>
            </div>
            {customer.interactions?.length === 0 && <EmptyState title="No interactions logged" />}
            <ul className="space-y-3">
              {customer.interactions?.map((i) => (
                <li key={i.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <Badge tone="blue">{i.type}</Badge>
                    <span className="text-xs text-gray-400">{formatDateTime(i.date)}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">{i.notes}</p>
                  {i.user?.name && <p className="mt-1 text-xs text-gray-400">by {i.user.name}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <CustomerFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} customer={customer} />

      <Modal open={payModalOpen} onClose={() => setPayModalOpen(false)} title="Record credit payment"
        footer={<><Button variant="outline" onClick={() => setPayModalOpen(false)}>Cancel</Button><Button onClick={recordPayment} loading={saving}>Record payment</Button></>}>
        <div className="space-y-4">
          {payError && <Alert kind="error">{payError}</Alert>}
          <Field label="Amount" required>
            <Input type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Note" hint="Optional reference, e.g. bank transfer ref">
            <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. MoMo payment 10 Aug" />
          </Field>
          <p className="text-xs text-gray-400">Outstanding balance: {formatMoney(customer.creditBalance ?? 0)}. This payment reduces the customer's outstanding balance.</p>
        </div>
      </Modal>
    </div>
  );
}
