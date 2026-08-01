import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatCard({ label, value, icon, accent = "blue", sub, onClick }: { label: string; value: ReactNode; icon: ReactNode; accent?: "blue" | "green" | "amber" | "red" | "violet" | "cyan"; sub?: ReactNode; onClick?: () => void }) {
  const accents: Record<string, string> = {
    blue: "bg-brand-50 text-brand-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    violet: "bg-violet-50 text-violet-600",
    cyan: "bg-cyan-50 text-cyan-600",
  };

  return (
    <div
      onClick={onClick}
      className={cn("rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-shadow", onClick && "cursor-pointer hover:shadow-lift")}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
        </div>
        <div className={cn("rounded-lg p-2.5", accents[accent])}>{icon}</div>
      </div>
    </div>
  );
}
