"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Phone, Mail, Building2, Pencil, CheckCircle2, CalendarClock, PhoneCall } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/utils";
import type { FollowUp, Interaction, Lead as LeadType, Opportunity } from "@/types";
import { LEAD_STAGES, STAGE_LABELS } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Field } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { LeadFormModal } from "@/components/leads/LeadFormModal";

interface LeadDetail extends LeadType {
  interactions: Interaction[];
  followUps: FollowUp[];
  opportunities: Opportunity[];
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState({ type: "CALL", subject: "", scheduledAt: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<LeadDetail>(`/leads/${params.id}`);
      setLead(res);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const moveStage = async (to: string) => {
    await api(`/leads/${lead!.id}`, { method: "PUT", body: { status: to } });
    load();
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await api(`/leads/${lead!.id}/interactions`, { method: "POST", body: { type: "NOTE", notes: note } });
    setNote("");
    load();
  };

  const addFollowUp = async () => {
    if (!followUp.subject || !followUp.scheduledAt) return;
    await api("/tasks/follow-ups", { method: "POST", body: { ...followUp, leadId: lead!.id } });
    setFollowUp({ type: "CALL", subject: "", scheduledAt: "", notes: "" });
    load();
  };

  const convert = async () => {
    if (!confirm("Convert this won lead into a customer?")) return;
    await api(`/leads/${lead!.id}/convert`, { method: "POST" });
    load();
  };

  if (loading && !lead) return <Spinner label="Loading lead..." />;
  if (!lead) return <EmptyState title="Lead not found" />;

  const stageIdx = LEAD_STAGES.indexOf(lead.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/leads" className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-4 w-4" /> Back to pipeline
        </Link>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <Pencil className="h-3.5 w-3.5" /> Edit lead
        </button>
      </div>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{lead.name}</h1>
                <Badge tone={lead.status === "WON" ? "green" : lead.status === "LOST" ? "red" : "blue"}>{STAGE_LABELS[lead.status]}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                {lead.company && <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{lead.company}</span>}
                {lead.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{lead.phone}</span>}
                {lead.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{lead.email}</span>}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Source: {lead.source} · Assigned: {lead.assignedTo?.name ?? "—"} · {lead.branch?.name ?? ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Estimated value</p>
              <p className="text-2xl font-bold text-brand-600">{formatMoney(lead.value)}</p>
            </div>
          </div>

          {/* stage stepper */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Pipeline stage</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {LEAD_STAGES.map((s, i) => (
                <button
                  key={s}
                  onClick={() => moveStage(s)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    i === stageIdx
                      ? "bg-brand-600 text-white"
                      : i < stageIdx
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {s === "WON" ? "✓ " : ""}{STAGE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {lead.status === "WON" && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm text-emerald-800">This deal is won. Convert it to a customer to continue tracking them.</p>
              <Button variant="success" onClick={convert}><CheckCircle2 className="h-4 w-4" /> Convert</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-brand-600" /> Schedule follow-up</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={followUp.type} onChange={(e) => setFollowUp((f) => ({ ...f, type: e.target.value }))}>
                  <option value="CALL">Call</option>
                  <option value="MEETING">Meeting</option>
                  <option value="EMAIL">Email</option>
                  <option value="REMINDER">Reminder</option>
                </Select>
              </Field>
              <Field label="Date & time">
                <Input type="datetime-local" value={followUp.scheduledAt} onChange={(e) => setFollowUp((f) => ({ ...f, scheduledAt: e.target.value }))} />
              </Field>
            </div>
            <Field label="Subject">
              <Input value={followUp.subject} onChange={(e) => setFollowUp((f) => ({ ...f, subject: e.target.value }))} placeholder="e.g. Follow-up call on proposal" />
            </Field>
            <Button onClick={addFollowUp} disabled={!followUp.subject || !followUp.scheduledAt}>
              <PhoneCall className="h-4 w-4" /> Schedule follow-up
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Follow-ups</CardTitle></CardHeader>
          <CardContent className="max-h-80 overflow-y-auto p-2 scrollbar-thin">
            {lead.followUps?.length === 0 && <EmptyState title="No follow-ups scheduled" />}
            <ul className="space-y-2">
              {lead.followUps?.map((f) => (
                <li key={f.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <Badge tone={f.status === "COMPLETED" ? "green" : "blue"}>{f.type}</Badge>
                    <span className="text-xs text-gray-400">{formatDateTime(f.scheduledAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-gray-800">{f.subject}</p>
                  {f.notes && <p className="mt-0.5 text-xs text-gray-500">{f.notes}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Interaction log</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="Log a call, email or note..." className="h-10 flex-1 rounded-lg border border-gray-300 px-3 text-sm" />
            <button onClick={addNote} className="rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Add</button>
          </div>
          {lead.interactions?.length === 0 && <EmptyState title="No interactions yet" />}
          <ul className="space-y-2">
            {lead.interactions?.map((i) => (
              <li key={i.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between">
                  <Badge tone="blue">{i.type}</Badge>
                  <span className="text-xs text-gray-400">{formatDateTime(i.date)}</span>
                </div>
                <p className="mt-1.5 text-sm text-gray-700">{i.notes}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <LeadFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} lead={lead} />
    </div>
  );
}
