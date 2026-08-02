"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, LogIn, LogOut, Timer } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/utils";
import type { Shift } from "@/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";

export default function ShiftsPage() {
  const { user } = useApp();
  const [tab, setTab] = useState("my");
  const [active, setActive] = useState<Shift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [clockInModal, setClockInModal] = useState(false);
  const [clockOutModal, setClockOutModal] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const a = await api<Shift | null>("/shifts/my-active");
      setActive(a);
      const res = await api<{ items: Shift[] }>("/shifts", { params: { pageSize: 50, userId: tab === "my" ? user?.id : undefined } });
      setShifts(res.items);
    } finally {
      setLoading(false);
    }
  }, [tab, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const startShift = async () => {
    setError(null);
    setSaving(true);
    try {
      await api("/shifts/open", { method: "POST", body: { openingCash: Number(openingCash) || 0 } });
      setClockInModal(false);
      setSuccess("Shift started.");
      load();
    } catch (err: any) {
      setError(err?.message ?? "Could not start shift");
    } finally {
      setSaving(false);
    }
  };

  const endShift = async () => {
    if (!active) return;
    setError(null);
    setSaving(true);
    try {
      await api(`/shifts/${active.id}/close`, { method: "POST", body: { closingCash: Number(closingCash) || 0 } });
      setClockOutModal(false);
      setSuccess("Shift closed. Check your variance.");
      load();
    } catch (err: any) {
      setError(err?.message ?? "Could not close shift");
    } finally {
      setSaving(false);
    }
  };

  const elapsed = active ? Math.max(Math.floor((now - new Date(active.clockIn).getTime()) / 1000), 0) : 0;
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="space-y-6">
      <PageHeader breadcrumb="Operations" title="Shifts" subtitle="Clock in, reconcile your cash drawer and review staff hours" />

      {error && <Alert kind="error">{error}</Alert>}
      {success && <Alert kind="success">{success}</Alert>}

      <Card className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <Timer className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-white/70">{active ? `Shift open · ${active.branch?.name ?? ""}` : "No active shift"}</p>
              {active ? (
                <p className="font-mono text-3xl font-bold tabular-nums">{hh}:{mm}:{ss}</p>
              ) : (
                <p className="text-lg font-semibold">You are not clocked in</p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            {active ? (
              <Button onClick={() => { setClosingCash(""); setClockOutModal(true); }} className="bg-white text-brand-700 hover:bg-white/90"><LogOut className="h-4 w-4" /> End shift</Button>
            ) : (
              <Button onClick={() => setClockInModal(true)} className="bg-white text-brand-700 hover:bg-white/90"><LogIn className="h-4 w-4" /> Start shift</Button>
            )}
          </div>
        </div>
      </Card>

      <Tabs
        tabs={[
          { key: "my", label: "My shifts" },
          ...(user?.role === "ADMIN" || user?.role === "BRANCH_MANAGER" ? [{ key: "all", label: "All shifts" }] : []),
        ]}
        active={tab}
        onChange={setTab}
      />

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner label="Loading shifts..." />
        ) : shifts.length === 0 ? (
          <EmptyState title="No shifts" description="Start a shift to begin tracking hours and cash." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-3 font-medium">Staff</th>
                  <th className="px-5 py-3 font-medium">Branch</th>
                  <th className="px-5 py-3 font-medium">Clock in</th>
                  <th className="px-5 py-3 font-medium">Clock out</th>
                  <th className="px-5 py-3 text-right font-medium">Opening cash</th>
                  <th className="px-5 py-3 text-right font-medium">Expected</th>
                  <th className="px-5 py-3 text-right font-medium">Closed with</th>
                  <th className="px-5 py-3 text-right font-medium">Variance</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shifts.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900">{s.user?.name}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{s.branch?.code ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-600">{formatDateTime(s.clockIn)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-600">{s.clockOut ? formatDateTime(s.clockOut) : "—"}</td>
                    <td className="px-5 py-3 text-right">{formatMoney(s.openingCash)}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{s.expectedCash != null ? formatMoney(s.expectedCash) : "—"}</td>
                    <td className="px-5 py-3 text-right">{s.closingCash != null ? formatMoney(s.closingCash) : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {s.variance != null ? (
                        <span className={Math.abs(s.variance) > 0.01 ? "font-semibold text-red-600" : "text-green-600"}>{s.variance > 0 ? "+" : ""}{formatMoney(s.variance)}</span>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-3"><Badge tone={s.status === "OPEN" ? "green" : "gray"} dot>{s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={clockInModal} onClose={() => setClockInModal(false)} title="Start shift"
        footer={<><Button variant="outline" onClick={() => setClockInModal(false)}>Cancel</Button><Button onClick={startShift} loading={saving}>Start shift</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Enter the opening cash float for this shift.</p>
          <Field label="Opening cash">
            <Input type="number" min="0" step="0.01" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal open={clockOutModal} onClose={() => setClockOutModal(false)} title="End shift"
        footer={<><Button variant="outline" onClick={() => setClockOutModal(false)}>Cancel</Button><Button onClick={endShift} loading={saving}>Close shift</Button></>}>
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-gray-600"><Clock className="h-4 w-4" /> Enter the cash counted in the drawer when closing.</p>
          <Field label="Closing cash" required>
            <Input type="number" min="0" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="0.00" />
          </Field>
          <p className="text-xs text-gray-400">The system compares this to opening cash + cash sales to calculate the drawer variance.</p>
        </div>
      </Modal>
    </div>
  );
}
