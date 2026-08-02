"use client";

import { useState, type FormEvent } from "react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import type { Customer } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export function CustomerFormModal({
  open,
  onClose,
  onSaved,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  customer?: Customer | null;
}) {
  const { branches } = useApp();
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    company: customer?.company ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
    segment: customer?.segment ?? "REGULAR",
    birthday: customer?.birthday ? customer.birthday.slice(0, 10) : "",
    preferredBranchId: customer?.preferredBranchId ?? "",
    creditLimit: customer?.creditLimit ? String(customer.creditLimit) : "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarning(null);
    setSaving(true);
    try {
      const payload = { ...form, preferredBranchId: form.preferredBranchId || null, birthday: form.birthday || null, creditLimit: Number(form.creditLimit) || 0 };
      if (customer) {
        await api(`/customers/${customer.id}`, { method: "PUT", body: payload });
      } else {
        const res = await api<{ duplicate?: boolean; message?: string }>("/customers", { method: "POST", body: payload });
        if (res?.duplicate) setWarning(res.message ?? "Duplicate detected");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Could not save customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? "Edit customer" : "Add customer"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="customer-form" loading={saving}>{customer ? "Save changes" : "Add customer"}</Button>
        </>
      }
    >
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}
      {warning && <Alert kind="warning" className="mb-4">{warning}</Alert>}
      <form id="customer-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name" required>
          <Input value={form.name} onChange={set("name")} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input value={form.phone} onChange={set("phone")} placeholder="+233 ..." />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <Input value={form.company} onChange={set("company")} />
          </Field>
          <Field label="Segment">
            <Select value={form.segment} onChange={set("segment")}>
              <option value="NEW">New</option>
              <option value="REGULAR">Regular</option>
              <option value="VIP">VIP</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Birthday">
            <Input type="date" value={form.birthday} onChange={set("birthday")} />
          </Field>
          <Field label="Credit limit (₵)">
            <Input type="number" min="0" step="0.01" value={form.creditLimit} onChange={set("creditLimit")} placeholder="0.00" />
          </Field>
        </div>
        <Field label="Preferred branch">
          <Select value={form.preferredBranchId} onChange={set("preferredBranchId")}>
            <option value="">Not set</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Address">
          <Input value={form.address} onChange={set("address")} />
        </Field>
        <Field label="Notes">
          <Textarea rows={3} value={form.notes} onChange={set("notes")} />
        </Field>
      </form>
    </Modal>
  );
}
