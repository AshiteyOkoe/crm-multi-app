"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Store, Users, ScrollText, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { Branch, Paginated, Role, User } from "@/types";
import { ROLE_LABELS } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";

export default function SettingsPage() {
  const { isAdmin } = useApp();
  const [tab, setTab] = useState(isAdmin ? "branches" : "team");

  if (!isAdmin) {
    return (
      <div>
        <PageHeader breadcrumb="Settings" title="Settings" subtitle="Your account" />
        <MyAccount />
      </div>
    );
  }

  return (
    <div>
      <PageHeader breadcrumb="Settings" title="Administration" subtitle="Manage branches, team, preferences, security and audit logs" />
      <Tabs
        tabs={[
          { key: "branches", label: "Branches" },
          { key: "team", label: "Team & roles" },
          { key: "prefs", label: "Business settings" },
          { key: "audit", label: "Audit logs" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="pt-5">
        {tab === "branches" && <BranchesTab />}
        {tab === "team" && <TeamTab />}
        {tab === "prefs" && <PreferencesTab />}
        {tab === "audit" && <AuditTab />}
      </div>
    </div>
  );
}

function PreferencesTab() {
  const [form, setForm] = useState({
    businessName: "",
    currency: "GHS",
    taxRate: "0",
    lowStockAlertEnabled: "true",
    receiptFooter: "",
    receiptChannels: "EMAIL,WHATSAPP",
    loyaltyEnabled: "true",
    creditEnabled: "true",
    smsWebhookUrl: "",
    whatsappWebhookUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Record<string, string>>("/branches/settings").then((s) => {
      setForm((f) => ({
        ...f,
        businessName: s.businessName ?? f.businessName,
        currency: s.currency ?? f.currency,
        taxRate: s.taxRate ?? "0",
        lowStockAlertEnabled: s.lowStockAlertEnabled ?? "true",
        receiptFooter: s.receiptFooter ?? "",
        receiptChannels: s.receiptChannels ?? f.receiptChannels,
        loyaltyEnabled: s.loyaltyEnabled ?? "true",
        creditEnabled: s.creditEnabled ?? "true",
        smsWebhookUrl: s.smsWebhookUrl ?? "",
        whatsappWebhookUrl: s.whatsappWebhookUrl ?? "",
      }));
    });
  }, []);

  const submit = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api("/branches/settings", { method: "PUT", body: { ...form, taxRate: Number(form.taxRate) } });
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-gray-900">Business & money</h3>
        </div>
        <div className="space-y-4">
          <Field label="Business name"><Input value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency code">
              <Select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                <option value="GHS">GHS (₵)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="NGN">NGN (₦)</option>
                <option value="KES">KES (KSh)</option>
                <option value="ZAR">ZAR (R)</option>
              </Select>
            </Field>
            <Field label="Default tax rate (%)">
              <Input type="number" min="0" max="100" step="0.1" value={form.taxRate} onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))} />
            </Field>
          </div>
          <Field label="Receipt footer" hint="Shown at the bottom of every printed/emailed receipt.">
            <Input value={form.receiptFooter} onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))} placeholder="Thank you for shopping with us!" />
          </Field>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Receipt delivery channels (new sales)</p>
            <div className="flex flex-wrap gap-2">
              {(["EMAIL", "SMS", "WHATSAPP"] as const).map((c) => {
                const enabled = form.receiptChannels.split(",").map((s) => s.trim()).filter(Boolean).includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => {
                      const list = form.receiptChannels.split(",").map((s) => s.trim()).filter(Boolean);
                      const next = enabled ? list.filter((x) => x !== c) : [...list, c];
                      setForm((f) => ({ ...f, receiptChannels: next.join(",") }));
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${enabled ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-500"}`}
                  >
                    {enabled ? `✓ ${c}` : c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-gray-900">Features</h3>
        </div>
        <div className="space-y-4">
          <ToggleRow label="Loyalty points" desc="Award points on sales and allow redemption at the POS."
            checked={form.loyaltyEnabled === "true"} onChange={(v) => setForm((f) => ({ ...f, loyaltyEnabled: String(v) }))} />
          <ToggleRow label="Buy on credit" desc="Let customers purchase on credit against their credit limit."
            checked={form.creditEnabled === "true"} onChange={(v) => setForm((f) => ({ ...f, creditEnabled: String(v) }))} />
          <ToggleRow label="Low-stock alerts" desc="Notify the owner when an item hits its reorder threshold."
            checked={form.lowStockAlertEnabled === "true"} onChange={(v) => setForm((f) => ({ ...f, lowStockAlertEnabled: String(v) }))} />
        </div>
        <div className="mt-6 space-y-4 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-600">Outbound messaging webhooks</p>
          <Field label="SMS webhook URL" hint="POSTed { to, body } for SMS receipt/campaign delivery.">
            <Input value={form.smsWebhookUrl} onChange={(e) => setForm((f) => ({ ...f, smsWebhookUrl: e.target.value }))} placeholder="https://provider.example.com/sms" />
          </Field>
          <Field label="WhatsApp webhook URL" hint="POSTed { to, body } for WhatsApp delivery.">
            <Input value={form.whatsappWebhookUrl} onChange={(e) => setForm((f) => ({ ...f, whatsappWebhookUrl: e.target.value }))} placeholder="https://provider.example.com/whatsapp" />
          </Field>
          <p className="text-xs text-gray-400">Leave blank to log messages to the server console (development mode).</p>
        </div>
      </Card>

      <div className="xl:col-span-2">
        {error && <Alert kind="error" className="mb-4">{error}</Alert>}
        {saved && <Alert kind="success" className="mb-4">Business settings saved.</Alert>}
        <div className="flex justify-end">
          <Button onClick={submit} loading={saving}>Save settings</Button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-600" : "bg-gray-200"}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5.5 left-0.5" : "translate-x-0.5 left-0"}`} style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }} />
      </button>
    </div>
  );
}

function BranchesTab() {
  const { branches, refreshBranches } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await api("/branches", { method: "POST", body: form });
      setModalOpen(false);
      setForm({ name: "", code: "", address: "", phone: "" });
      refreshBranches();
    } catch (err: any) {
      setError(err?.message ?? "Could not create branch");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{branches.length} physical branches</p>
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Add branch</Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {branches.map((b) => (
          <Card key={b.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Store className="h-5 w-5" />
              </div>
              <Badge tone={b.isActive ? "green" : "gray"} dot>{b.isActive ? "Active" : "Inactive"}</Badge>
            </div>
            <p className="mt-3 font-semibold text-gray-900">{b.name}</p>
            <p className="text-xs text-gray-400">Code: {b.code}</p>
            {b.address && <p className="mt-1 text-xs text-gray-500">{b.address}</p>}
            {b.phone && <p className="text-xs text-gray-500">{b.phone}</p>}
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add branch"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={submit} loading={saving}>Create branch</Button></>}>
        {error && <Alert kind="error" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <Field label="Branch name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Short code" required><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="B4" /></Field>
          <Field label="Address"><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function MyAccount() {
  const { user, refreshUser } = useApp();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? "");
    setPhone(user?.phone ?? "");
  }, [user]);

  const resendVerification = async () => {
    setVerifyMsg(null);
    try {
      await api("/auth/send-verification", { method: "POST", body: {} });
      setVerifyMsg("Verification email sent. Check your inbox.");
    } catch (err: any) {
      setVerifyMsg(err?.message ?? "Could not send verification email");
    }
  };

  const submit = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api(`/branches/users/${user!.id}`, { method: "PUT", body: { name, phone: phone || undefined } });
      setSaved(true);
      await refreshUser();
    } catch (err: any) {
      setError(err?.message ?? "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg">
      <Card className="p-5">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <div className="flex items-center gap-2 pt-1.5">
                <p className="text-sm text-gray-700">{user?.email}</p>
                {user?.emailVerified ? (
                  <Badge tone="green" dot>Verified</Badge>
                ) : (
                  <Badge tone="amber" dot>Unverified</Badge>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400">Role</p>
              <div className="pt-1"><Badge tone={user?.role === "ADMIN" ? "violet" : user?.role === "AUDITOR" ? "amber" : user?.role === "BRANCH_MANAGER" ? "blue" : "gray"}>{ROLE_LABELS[user?.role as Role] ?? "—"}</Badge></div>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400">Branch</p>
            <p className="pt-1.5 text-sm text-gray-700">{user?.branch?.name ?? "Not assigned"}</p>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <Field label="Full name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Field label="Phone">
            <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {user && !user.emailVerified && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">Email not verified</p>
              <p className="mt-0.5 text-xs text-amber-700">Verify your email to receive receipts, campaigns and system alerts.</p>
              <Button size="sm" variant="outline" onClick={resendVerification} className="mt-2">
                Resend verification email
              </Button>
              {verifyMsg && <p className="mt-2 text-xs">{verifyMsg}</p>}
            </div>
          )}
          {error && <Alert kind="error">{error}</Alert>}
          {saved && <Alert kind="success">Your changes were saved.</Alert>}
          <div className="flex justify-end">
            <Button onClick={submit} loading={saving}>Save changes</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TeamTab() {
  const { branches } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "SALES_STAFF" as Role, branchId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<User>>("/branches/users", { params: { pageSize: 100 } });
      setUsers(res.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await api("/branches/users", { method: "POST", body: { ...form, branchId: form.branchId || null } });
      setModalOpen(false);
      setForm({ name: "", email: "", password: "", role: "SALES_STAFF", branchId: "" });
      load();
    } catch (err: any) {
      setError(err?.message ?? "Could not create user");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: User) => {
    await api(`/branches/users/${u.id}`, { method: "PUT", body: { isActive: !u.isActive } });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{users.length} team members</p>
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> Add member</Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner label="Loading team..." />
        ) : users.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === "ADMIN" ? "violet" : u.role === "BRANCH_MANAGER" ? "blue" : "gray"}>{ROLE_LABELS[u.role]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.branch?.name ?? "—"}</td>
                    <td className="px-4 py-3"><Badge tone={u.isActive ? "green" : "red"} dot>{u.isActive ? "Active" : "Disabled"}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => toggleActive(u)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                        {u.isActive ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add team member"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={submit} loading={saving}>Create member</Button></>}>
        {error && <Alert kind="error" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <Field label="Full name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Password" required><Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
                <option value="SALES_STAFF">Sales Staff</option>
                <option value="BRANCH_MANAGER">Branch Manager</option>
                <option value="ADMIN">Admin</option>
                <option value="AUDITOR">Auditor (read-only)</option>
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">Not assigned</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api<Paginated<any>>("/branches/audit-logs", { params: { pageSize: 100 } });
        setLogs(res.items);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <Card className="overflow-hidden">
      {loading ? (
        <Spinner label="Loading audit logs..." />
      ) : logs.length === 0 ? (
        <EmptyState title="No activity logged yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50/60">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDateTime(l.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-700">{l.userEmail ?? "system"}</td>
                  <td className="px-4 py-3">
                    <Badge tone="gray">{l.action.replace(/_/g, " ").toLowerCase()}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{l.entityType ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
