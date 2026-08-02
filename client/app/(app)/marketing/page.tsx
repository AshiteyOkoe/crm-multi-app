"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Send, Trash2, Gift, CalendarHeart, UsersRound } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { Campaign, CampaignType } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Field, Textarea } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";

const TYPE_LABELS: Record<CampaignType, string> = {
  BIRTHDAY: "Birthday",
  ANNIVERSARY: "Anniversary",
  INACTIVE: "Re-engage inactive",
  CUSTOM: "Custom",
};

export default function MarketingPage() {
  const { isManager } = useApp();
  const [tab, setTab] = useState("segments");
  const [segments, setSegments] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; type: CampaignType; channel: string; message: string; audience: { birthdays: boolean; anniversaries: boolean; inactive: boolean; customerIds: string[] } }>({
    name: "",
    type: "CUSTOM",
    channel: "SMS",
    message: "",
    audience: { birthdays: false, anniversaries: false, inactive: false, customerIds: [] },
  });
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSegments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>("/marketing/segments");
      setSegments(res);
      const c = await api<{ items: Campaign[] }>("/marketing/campaigns", { params: { pageSize: 50 } });
      setCampaigns(c.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!form.name || !form.message) return setError("Campaign name and message are required.");
    setSaving(true);
    try {
      await api("/marketing/campaigns", { method: "POST", body: { ...form, audience: form.audience } });
      setModalOpen(false);
      setSuccess("Campaign created. Review it in the campaigns tab, then send when ready.");
      setForm({ name: "", type: "CUSTOM", channel: "SMS", message: "", audience: { birthdays: false, anniversaries: false, inactive: false, customerIds: [] } });
      loadSegments();
    } catch (err: any) {
      setError(err?.message ?? "Could not create campaign");
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async (id: string) => {
    if (!confirm("Send this campaign now? Messages will be dispatched to all recipients.")) return;
    setSendingId(id);
    setError(null);
    setSuccess(null);
    try {
      const res = await api<{ sent: number; total: number }>(`/marketing/campaigns/${id}/send`, { method: "POST", body: {} });
      setSuccess(`Campaign sent to ${res.sent}/${res.total} recipients.`);
      loadSegments();
    } catch (err: any) {
      setError(err?.message ?? "Could not send campaign");
    } finally {
      setSendingId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this draft campaign?")) return;
    await api(`/marketing/campaigns/${id}`, { method: "DELETE" });
    loadSegments();
  };

  return (
    <div className="space-y-6">
      <PageHeader breadcrumb="CRM" title="Marketing" subtitle="Birthday, anniversary and win-back campaigns for your customers"
        actions={isManager ? <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New campaign</Button> : undefined} />

      {error && <Alert kind="error">{error}</Alert>}
      {success && <Alert kind="success">{success}</Alert>}

      <Tabs
        tabs={[
          { key: "segments", label: "Audiences" },
          { key: "campaigns", label: "Campaigns" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="pt-5">
        {loading ? (
          <Spinner label="Loading marketing data..." />
        ) : tab === "segments" ? (
          segments && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SegmentCard
                  icon={<Gift className="h-5 w-5 text-pink-500" />}
                  title="Upcoming birthdays"
                  subtitle={`Next 14 days`}
                  count={segments.birthdays.length}
                  people={segments.birthdays}
                  highlight
                />
                <SegmentCard
                  icon={<CalendarHeart className="h-5 w-5 text-violet-500" />}
                  title="Upcoming anniversaries"
                  subtitle={`Next 14 days`}
                  count={segments.anniversaries.length}
                  people={segments.anniversaries}
                  highlight
                />
                <SegmentCard
                  icon={<UsersRound className="h-5 w-5 text-amber-500" />}
                  title="Inactive customers"
                  subtitle={`No purchase in 90 days`}
                  count={segments.inactive.length}
                  people={segments.inactive}
                />
              </div>
            </div>
          )
        ) : (
          <Card className="overflow-hidden">
            {campaigns.length === 0 ? (
              <EmptyState title="No campaigns yet" description="Create a campaign from an audience segment and send it." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-5 py-3 font-medium">Campaign</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Channel</th>
                      <th className="px-5 py-3 text-right font-medium">Recipients</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Created</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {campaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50/60">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-gray-900">{c.name}</p>
                          <p className="max-w-xs truncate text-xs text-gray-400">{c.message}</p>
                        </td>
                        <td className="px-5 py-3"><Badge tone={c.type === "BIRTHDAY" ? "red" : c.type === "ANNIVERSARY" ? "violet" : c.type === "INACTIVE" ? "amber" : "gray"}>{TYPE_LABELS[c.type]}</Badge></td>
                        <td className="px-5 py-3 text-gray-600">{c.channel}</td>
                        <td className="px-5 py-3 text-right">{c._count?.recipients ?? 0}</td>
                        <td className="px-5 py-3"><Badge tone={c.status === "SENT" ? "green" : c.status === "SCHEDULED" ? "blue" : "gray"} dot>{c.status}</Badge></td>
                        <td className="px-5 py-3 text-gray-500">{c.sentAt ? `Sent ${formatDate(c.sentAt)}` : formatDate(c.createdAt)}</td>
                        <td className="px-5 py-3 text-right">
                          {c.status !== "SENT" && (
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => sendNow(c.id)} loading={sendingId === c.id}><Send className="h-3.5 w-3.5" /> Send</Button>
                              <button onClick={() => remove(c.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New campaign" wide
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={submit} loading={saving}>Create campaign</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Campaign name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. August birthday special" /></Field>
            <Field label="Channel">
              <Select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </Select>
            </Field>
          </div>
          <Field label="Message" required>
            <Textarea rows={4} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder={'Hi {{name}}, enjoy a special offer this week...'} />
          </Field>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Audience</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                ["birthdays", "Upcoming birthdays"],
                ["anniversaries", "Upcoming anniversaries"],
                ["inactive", "Inactive (90 days)"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={form.audience[key]}
                    onChange={(e) => setForm((f) => ({ ...f, audience: { ...f.audience, [key]: e.target.checked } }))}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-gray-700">{label}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">Use {"{{name}}"} in the message to personalize with each customer's name.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SegmentCard({ icon, title, subtitle, count, people, highlight }: { icon: React.ReactNode; title: string; subtitle: string; count: number; people: any[]; highlight?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50">{icon}</div>
        <Badge tone={count > 0 ? (highlight ? "red" : "blue") : "gray"}>{count}</Badge>
      </div>
      <p className="mt-3 font-semibold text-gray-900">{title}</p>
      <p className="text-xs text-gray-400">{subtitle}</p>
      <div className="mt-3">
        {people.length === 0 ? (
          <p className="text-xs text-gray-400">No customers match this segment.</p>
        ) : (
          <ul className="space-y-1.5">
            {people.slice(0, 4).map((c) => (
              <li key={c.id} className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700">{c.name}</span>
                <span className="text-gray-400">{c.phone ?? c.email}</span>
              </li>
            ))}
            {people.length > 4 && <li className="text-xs text-gray-400">+{people.length - 4} more</li>}
          </ul>
        )}
      </div>
    </Card>
  );
}
