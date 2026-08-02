"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

export function PnlSummary() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api<any>("/reports/pnl", { params: { period: "month" } })
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return <Spinner label="Loading P&L..." />;
  const s = data.summary;
  const items = [
    { label: "Revenue", value: s.totalRevenue, tone: "text-gray-900", icon: <TrendingUp className="h-4 w-4 text-green-500" /> },
    { label: "Cost of goods", value: s.totalCogs, tone: "text-red-600", icon: <TrendingDown className="h-4 w-4 text-red-500" /> },
    { label: "Expenses", value: s.totalExpenses, tone: "text-amber-600", icon: <Wallet className="h-4 w-4 text-amber-500" /> },
    { label: "Net profit", value: s.netProfit, tone: s.netProfit >= 0 ? "text-green-600" : "text-red-600", icon: <TrendingUp className="h-4 w-4 text-brand-500" /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((it) => (
        <Link key={it.label} href="/reports?tab=pnl">
          <Card className="p-4 transition-shadow hover:shadow-lift">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{it.label}</p>
              {it.icon}
            </div>
            <p className={`mt-1.5 text-lg font-bold ${it.tone}`}>{formatMoney(it.value)}</p>
            <p className="mt-0.5 text-[10px] text-gray-400">Net margin: {s.netMargin.toFixed(1)}%</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
