"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight, Trash2, CheckCircle2, XCircle, LayoutGrid, List } from "lucide-react";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { cn, formatMoney } from "@/lib/utils";
import type { Lead, LeadStatus, Paginated } from "@/types";
import { LEAD_STAGES, STAGE_LABELS } from "@/types";
import { PageHeader, SearchInput } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { LeadFormModal } from "@/components/leads/LeadFormModal";

const STAGE_TONES: Record<LeadStatus, "gray" | "blue" | "violet" | "amber" | "cyan" | "green" | "red"> = {
  NEW: "gray", CONTACTED: "blue", QUALIFIED: "violet", PROPOSAL_SENT: "amber", NEGOTIATION: "cyan", WON: "green", LOST: "red",
};

const SCORE_TONES: Record<string, "red" | "amber" | "gray" | "green"> = {
  HOT: "red", WARM: "amber", COLD: "gray",
};

function ScoreBadge({ score, label }: { score: number; label: string }) {
  if (!label) return null;
  return <Badge tone={SCORE_TONES[label] ?? "gray"}>{label} · {score}</Badge>;
}

export default function LeadsPage() {
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 350);
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<LeadStatus>("NEW");
  const [dragId, setDragId] = useState<string | null>(null);
  const [scoreMap, setScoreMap] = useState<Record<string, { score: number; scoreLabel: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<Lead>>("/leads", {
        params: { page: 1, pageSize: 100, search: debouncedSearch || undefined, status: view === "list" ? statusFilter || undefined : undefined },
      });
      setItems(res.items);
      setTotal(res.total);
      setPages(res.pages);
      const scored = await api<{ items: { id: string; score: number; scoreLabel: string }[] }>("/intelligence/lead-scores", { params: { pageSize: 500 } });
      setScoreMap(Object.fromEntries(scored.items.map((s) => [s.id, { score: s.score, scoreLabel: s.scoreLabel }])));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, view]);

  useEffect(() => {
    load();
  }, [load]);

  const pipeline = useMemo(() => {
    const groups = new Map<LeadStatus, Lead[]>();
    for (const stage of LEAD_STAGES) groups.set(stage, []);
    for (const lead of items) {
      const list = groups.get(lead.status) ?? [];
      list.push(lead);
      groups.set(lead.status, list);
    }
    return groups;
  }, [items]);

  const moveStage = async (id: string, to: LeadStatus) => {
    setItems((prev) => prev.map((l) => (l.id === id ? { ...l, status: to } : l)));
    try {
      await api(`/leads/${id}`, { method: "PUT", body: { status: to } });
    } catch {
      load();
    }
  };

  const convert = async (id: string) => {
    if (!confirm("Convert this won lead into a customer?")) return;
    await api(`/leads/${id}/convert`, { method: "POST" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this lead?")) return;
    await api(`/leads/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <PageHeader
        breadcrumb="CRM"
        title="Leads & Sales Pipeline"
        subtitle="Track opportunities from new lead to closed deal"
        actions={
          <Button onClick={() => { setEditing(null); setDefaultStatus("NEW"); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> Add lead
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search leads..." className="sm:w-80" />
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          <button onClick={() => setView("pipeline")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium", view === "pipeline" ? "bg-brand-50 text-brand-700" : "text-gray-500")}>
            <LayoutGrid className="h-3.5 w-3.5" /> Pipeline
          </button>
          <button onClick={() => setView("list")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium", view === "list" ? "bg-brand-50 text-brand-700" : "text-gray-500")}>
            <List className="h-3.5 w-3.5" /> List
          </button>
        </div>
        {view === "list" && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
            <option value="">All statuses</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs text-gray-500">{total} leads</span>
      </div>

      {loading && !items.length ? (
        <Spinner label="Loading leads..." />
      ) : view === "pipeline" ? (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {LEAD_STAGES.map((stage) => {
            const leads = pipeline.get(stage) ?? [];
            return (
              <div key={stage} className="w-72 shrink-0 rounded-xl bg-gray-100/70 p-2">
                <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={STAGE_TONES[stage]} dot>{STAGE_LABELS[stage]}</Badge>
                  </div>
                  <span className="text-xs font-semibold text-gray-500">{leads.length}</span>
                </div>
                <div className="min-h-[120px] space-y-2">
                  {leads.length === 0 && (
                    <button
                      onClick={() => { setEditing(null); setDefaultStatus(stage); setModalOpen(true); }}
                      className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 py-3 text-xs text-gray-400 hover:border-brand-300 hover:text-brand-500"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add lead
                    </button>
                  )}
                  {leads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => setDragId(null)}
                      className="group cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-card active:cursor-grabbing"
                    >
                      <Link href={`/leads/${lead.id}`} className="block">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                          <Badge tone="gray" className="text-[10px]">{lead.source}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">{lead.company ?? lead.email ?? lead.phone ?? "—"}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-brand-600">{formatMoney(lead.value)}</span>
                          <span className="flex items-center gap-1.5">
                            {scoreMap[lead.id] && <ScoreBadge score={scoreMap[lead.id].score} label={scoreMap[lead.id].scoreLabel} />}
                            {lead.assignedTo && <span className="text-[10px] text-gray-400">{lead.assignedTo.name}</span>}
                          </span>
                        </div>
                      </Link>
                      <div className="mt-2 flex items-center gap-1 border-t border-gray-50 pt-2">
                        {stage !== "LOST" && (
                          <button
                            onClick={() => moveStage(lead.id, stage === "WON" ? "WON" : LEAD_STAGES[Math.min(LEAD_STAGES.indexOf(stage) + 1, LEAD_STAGES.length - 1)])}
                            className="flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-50"
                          >
                            {stage === "WON" ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <ArrowRight className="h-3 w-3" />}
                            {stage === "WON" ? "Convert" : "Advance"}
                          </button>
                        )}
                        {stage === "WON" && (
                          <button onClick={() => convert(lead.id)} className="flex flex-1 items-center justify-center rounded-md bg-emerald-50 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Convert to customer
                          </button>
                        )}
                        {stage !== "WON" && (
                          <>
                            <button onClick={() => moveStage(lead.id, "LOST")} className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500" title="Mark lost">
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => remove(lead.id)} className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {dragId && (
                  <div className="mt-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/50 py-2 text-center text-[10px] text-brand-500">
                    Drop to move here
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : items.length === 0 ? (
        <Card><EmptyState title="No leads found" /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Assigned</th>
                  <th className="px-4 py-3 text-right font-medium">Value</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="font-semibold text-gray-900 hover:text-brand-600">{lead.name}</Link>
                      <p className="text-xs text-gray-500">{lead.company}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{lead.phone ?? "—"}</p>
                      <p className="text-xs text-gray-400">{lead.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STAGE_TONES[lead.status]}>{STAGE_LABELS[lead.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {scoreMap[lead.id] ? <ScoreBadge score={scoreMap[lead.id].score} label={scoreMap[lead.id].scoreLabel} /> : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{lead.assignedTo?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(lead.value)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setEditing(lead); setModalOpen(true); }} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={pages} onPage={setPage} total={total} />
        </Card>
      )}

      <LeadFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} lead={editing} defaultStatus={defaultStatus} />
    </div>
  );
}
