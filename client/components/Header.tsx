"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, Bell, CheckCheck, Building2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import type { Notification } from "@/types";

const NOTIFICATION_TONES: Record<string, string> = {
  FOLLOW_UP: "bg-blue-50 text-blue-600",
  LEAD_ASSIGNED: "bg-violet-50 text-violet-600",
  DEAL_STATUS: "bg-emerald-50 text-emerald-600",
  TASK_OVERDUE: "bg-amber-50 text-amber-600",
  LOW_STOCK: "bg-red-50 text-red-600",
  RETURN: "bg-orange-50 text-orange-600",
  TRANSFER: "bg-cyan-50 text-cyan-600",
  SALES: "bg-emerald-50 text-emerald-600",
};

export function Header({ onMenu }: { onMenu: () => void }) {
  const { user, isAdmin, branches, unreadCount, refreshNotifications, logout } = useApp();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) setBranchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadNotifications = async () => {
    setNotifLoading(true);
    try {
      const res = await api<{ items: Notification[] }>("/branches/notifications", { params: { pageSize: 15 } });
      setNotifications(res.items);
    } finally {
      setNotifLoading(false);
    }
  };

  const toggleNotif = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) await loadNotifications();
  };

  const markAllRead = async () => {
    await api("/branches/notifications/read", { method: "PUT", body: { all: true } });
    setNotifications((n) => n.map((x) => ({ ...x, isRead: true })));
    await refreshNotifications();
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="relative" ref={branchRef}>
          <button
            onClick={() => setBranchOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Building2 className="h-4 w-4 text-brand-600" />
            {isAdmin ? (branches.length ? `${branches.length} branches` : "All branches") : user?.branch?.name ?? "My branch"}
          </button>
          {branchOpen && (
            <div className="absolute left-0 top-12 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-lift">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Switch view</p>
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBranchOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className={cn("h-2 w-2 rounded-full", b.isActive ? "bg-emerald-500" : "bg-gray-300")} />
                  <span className="font-medium">{b.name}</span>
                  <span className="ml-auto text-xs text-gray-400">{b.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button
            onClick={toggleNotif}
            className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lift sm:w-96">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">Notifications</p>
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifLoading && notifications.length === 0 && <p className="p-6 text-center text-xs text-gray-400">Loading...</p>}
                {!notifLoading && notifications.length === 0 && <p className="p-6 text-center text-xs text-gray-400">No notifications yet</p>}
                {notifications.map((n) => (
                  <a key={n.id} href={n.link ?? "#"} className="block border-b border-gray-50 px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-start gap-2.5">
                      <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", n.isRead ? "bg-gray-300" : "bg-brand-500")} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-900">{n.title}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{n.message}</p>
                        <p className="mt-1 text-[10px] text-gray-400">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <button onClick={logout} className="hidden rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 sm:block">
          Sign out
        </button>
      </div>
    </header>
  );
}
