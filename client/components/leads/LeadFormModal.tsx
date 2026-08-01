"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Lead, LeadSource, LeadStatus } from "@/types";
import { STAGE_LABELS } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export function LeadFormModal({
  open,
  onClose,
  onSaved,
  lead,
  defaultStatus,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  lead?: Lead | null;
  defaultStatus?: LeadStatus;
}) {
  const { user, branches, isManager } = useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: lead?.name ?? "",
    company: lead?.company ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    source: (lead?.source ?? "WALK_IN") as LeadSource,
    status: (lead?.status ?? defaultStatus ?? "NEW") as LeadStatus,
    value: lead?.value ? String(lead.value) : "",
    notes: lead?.notes ?? "",
    assignedToId: lead?.assignedToId ?? user?.id ?? "",
    branchId: lead?.branchId ?? user?.branchId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && isManager) {
      api<{ items: any[] }>("/branches/users").then((d) => setUsers(d?.items ?? [])).catch(() => {});
    }
  }, [open, isManager]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = { ...form, value: Number(form.value || 0), assignedToId: form.assignedToId || null, branchId: form.branchId || null };
      if (lead) {
        await api(`/leads/${lead.id}`, { method: "PUT", body: payload });
      } else {
        await api("/leads", { method: "POST", body: payload });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Could not save lead");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lead ? "Edit lead" : "Add lead"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="lead-form" loading={saving}>{lead ? "Save changes" : "Add lead"}</Button>
        </>
      }
    >
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}
      <form id="lead-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Lead name" required>
          <Input value={form.name} onChange={set("name")} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Company">
            <Input value={form.company} onChange={set("company")} />
          </Field>
          <Field label="Estimated value (GHS)">
            <Input type="number" min="0" value={form.value} onChange={set("value")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <Select value={form.source} onChange={set("source")}>
              <option value="REFERRAL">Referral</option>
              <option value="WEBSITE">Website</option>
              <option value="SOCIAL_MEDIA">Social media</option>
              <option value="WALK_IN">Walk-in</option>
              <option value="CALL">Call</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={set("status")}>
              {Object.entries(STAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {isManager && (
            <Field label="Assigned to">
              <Select value={form.assignedToId} onChange={set("assignedToId")}>
                <option value="">Unassigned</option>
                {users.filter((u: any) => u.isActive).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </Select>
            </Field>
          )}
          <div className={cn(!isManager && "col-span-2")}>
            <Field label="Branch">
              <Select value={form.branchId} onChange={set("branchId")}>
                <option value="">Not set</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <Field label="Notes">
          <Textarea rows={3} value={form.notes} onChange={set("notes")} />
        </Field>
      </form>
    </Modal>
  );
}
