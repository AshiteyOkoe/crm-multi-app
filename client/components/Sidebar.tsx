"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Megaphone, ShoppingCart, Boxes, ClipboardList, BarChart3, Settings, LogOut, Store, Wallet, MessageSquare, Clock } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { cn, initials } from "@/lib/utils";
import { ROLE_LABELS } from "@/types";

const navSections = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/leads", label: "Leads & Pipeline", icon: Megaphone },
      { href: "/tasks", label: "Tasks & Follow-ups", icon: ClipboardList },
      { href: "/marketing", label: "Marketing", icon: MessageSquare },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/sales", label: "Sales & POS", icon: ShoppingCart },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/expenses", label: "Expenses & P&L", icon: Wallet },
      { href: "/shifts", label: "Shifts", icon: Clock },
      { href: "/reports", label: "Analytics & Reports", icon: BarChart3 },
    ],
  },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useApp();

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-gray-900/40 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-white border-r border-gray-200 transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">BranchCRM</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Multi-branch suite</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navSections.map((section) => (
            <div key={section.label} className="mb-5">
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{section.label}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                          active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-100 p-3">
          {user && (
            <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-gray-50 px-2.5 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-900">{user.name}</p>
                <p className="truncate text-[10px] text-gray-500">
                  {ROLE_LABELS[user.role]}{user.branch ? ` · ${user.branch.name}` : ""}
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1">
            <Link href="/settings" onClick={onClose} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
              <Settings className="h-3.5 w-3.5" /> Settings
            </Link>
            <button onClick={logout} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
