"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, PhoneCall, CheckCircle2, XCircle, CalendarClock } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import type { FollowUp, Paginated, Task } from "@/types";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Textarea, Field } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";

const PRIORITY_TONES: Record<string, "red" | "amber" | "gray"> = { HIGH: "red", MEDIUM: "amber", LOW: "gray" };

export default function TasksPage() {
  const [tab, setTab] = useState("tasks");
  return (
    <div>
      <PageHeader breadcrumb="CRM" title="Tasks & Follow-ups" subtitle="Stay on top of reminders, calls and assignments" />
      <Tabs tabs={[{ key: "tasks", label: "Tasks" }, { key: "followups", label: "Follow-ups" }]} active={tab} onChange={setTab} />
      <div className="pt-5">{tab === "tasks" ? <TasksTab /> : <FollowUpsTab />}</div>
    </div>
  );
}

function TasksTab() {
  const { isAdmin, isManager } = useApp();
  const [items, setItems] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [scope, setScope] = useState(isAdmin ? "all" : "mine");
  const [modalOpen, setModalOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<Task>>("/tasks", { params: { pageSize: 100, status: status || undefined, scope } });
      setItems(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [status, scope]);

  useEffect(() => {
    load();
  }, [load]);

  const updateTaskStatus = async (id: string, s: Task["status"]) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, status: s } : t)));
    await api(`/tasks/${id}`, { method: "PUT", body: { status: s } });
  };

  const openModal = async () => {
    if (isManager) {
      try {
        setUsers((await api<{ items: any[] }>("/branches/users")).items);
      } catch {}
    }
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
          <option value="mine">My tasks</option>
          {isAdmin && <option value="all">All tasks</option>}
        </select>
        <span className="text-xs text-gray-500">{total} tasks</span>
        <Button onClick={openModal} className="ml-auto"><Plus className="h-4 w-4" /> New task</Button>
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading tasks..." />
        ) : items.length === 0 ? (
          <EmptyState title="No tasks" description="Create or assign tasks to stay on track." />
        ) : (
          <ul className="divide-y divide-gray-50">
            {items.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-4">
                <button
                  onClick={() => updateTaskStatus(t.id, t.status === "COMPLETED" ? "PENDING" : "COMPLETED")}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    t.status === "COMPLETED" ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 text-transparent hover:border-emerald-400"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium text-gray-900", t.status === "COMPLETED" && "text-gray-400 line-through")}>{t.title}</p>
                  <p className="truncate text-xs text-gray-500">
                    {t.assignee?.name ?? "Unassigned"}
                    {t.dueDate && ` · due ${formatDateTime(t.dueDate)}`}
                  </p>
                </div>
                <Badge tone={PRIORITY_TONES[t.priority]}>{t.priority}</Badge>
                <Badge tone={t.status === "COMPLETED" ? "green" : t.status === "IN_PROGRESS" ? "blue" : "gray"}>{t.status.replace("_", " ")}</Badge>
                {t.status !== "COMPLETED" && (
                  <Button size="sm" variant="outline" onClick={() => updateTaskStatus(t.id, "IN_PROGRESS")}>Start</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TaskModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} users={users} />
    </div>
  );
}

function TaskModal({ open, onClose, onSaved, users }: { open: boolean; onClose: () => void; onSaved: () => void; users: any[] }) {
  const { isManager } = useApp();
  const [form, setForm] = useState({ title: "", description: "", priority: "MEDIUM", dueDate: "", assigneeId: "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api("/tasks", { method: "POST", body: { ...form, dueDate: form.dueDate || null, assigneeId: form.assigneeId || null } });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New task"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Create task</Button></>}>
      <div className="space-y-4">
        <Field label="Title" required><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Call customer, send proposal..." /></Field>
        <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
          </Field>
          <Field label="Due date"><Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></Field>
        </div>
        {isManager && (
          <Field label="Assign to">
            <Select value={form.assigneeId} onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}>
              <option value="">Unassigned</option>
              {users.filter((u: any) => u.isActive).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function FollowUpsTab() {
  const { isAdmin } = useApp();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState(isAdmin ? "all" : "mine");
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<FollowUp>>("/tasks/follow-ups", { params: { pageSize: 100, scope, upcoming: "true" } });
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const complete = async (id: string) => {
    await api(`/tasks/follow-ups/${id}`, { method: "PUT", body: { status: "COMPLETED" } });
    load();
  };
  const cancel = async (id: string) => {
    await api(`/tasks/follow-ups/${id}`, { method: "PUT", body: { status: "CANCELLED" } });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
          <option value="mine">My follow-ups</option>
          {isAdmin && <option value="all">All follow-ups</option>}
        </select>
        <span className="text-xs text-gray-500">Upcoming</span>
        <Button onClick={() => setModalOpen(true)} className="ml-auto"><Plus className="h-4 w-4" /> Schedule</Button>
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading follow-ups..." />
        ) : items.length === 0 ? (
          <EmptyState title="No upcoming follow-ups" description="Schedule calls and meetings to keep deals moving." />
        ) : (
          <ul className="divide-y divide-gray-50">
            {items.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  {f.type === "MEETING" ? <CalendarClock className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{f.subject}</p>
                  <p className="text-xs text-gray-500">
                    {f.lead?.name ?? f.customer?.name ?? "General"} · {f.assignee?.name ?? "Unassigned"}
                  </p>
                </div>
                <Badge tone={f.type === "MEETING" ? "violet" : "blue"}>{f.type}</Badge>
                <span className="text-xs font-medium text-gray-600">{formatDateTime(f.scheduledAt)}</span>
                <button onClick={() => complete(f.id)} className="rounded-lg bg-emerald-50 p-2 text-emerald-600 hover:bg-emerald-100" title="Complete">
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                <button onClick={() => cancel(f.id)} className="rounded-lg bg-gray-50 p-2 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Cancel">
                  <XCircle className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FollowUpModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} />
    </div>
  );
}

function FollowUpModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ type: "CALL", subject: "", scheduledAt: "", notes: "", assigneeId: "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api("/tasks/follow-ups", { method: "POST", body: { ...form, assigneeId: form.assigneeId || null } });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Schedule follow-up"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Schedule</Button></>}>
      <div className="space-y-4">
        <Field label="Type">
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option value="CALL">Call</option>
            <option value="MEETING">Meeting</option>
            <option value="EMAIL">Email</option>
            <option value="REMINDER">Reminder</option>
          </Select>
        </Field>
        <Field label="Subject" required><Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} /></Field>
        <Field label="Date & time" required><Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} /></Field>
        <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
      </div>
    </Modal>
  );
}
