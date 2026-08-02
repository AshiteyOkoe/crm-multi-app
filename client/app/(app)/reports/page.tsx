"use client";

import { useCallback, useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FileDown, FileText } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api, API_URL, getToken } from "@/lib/api";
import { downloadTextFile, formatMoney, formatNumber } from "@/lib/utils";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { AreaTrend, SimpleBars, DonutChart } from "@/components/charts/Charts";

type Period = "day" | "week" | "month" | "year";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
];

export default function ReportsPage() {
  const [tab, setTab] = useState("sales");
  const [period, setPeriod] = useState<Period>("month");
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<any>(null);
  const [leads, setLeads] = useState<any>(null);
  const [customers, setCustomers] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [stockValuation, setStockValuation] = useState<any>(null);
  const [reorder, setReorder] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [recon, setRecon] = useState<any>(null);
  const { isAdmin, branches } = useApp();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q && ["sales", "leads", "customers", "pnl", "stock", "reorder", "forecast", "recon"].includes(q)) setTab(q);
  }, []);

  const branchParams = { period, branchId: branchId || undefined };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "sales") setSales(await api<any>("/reports/sales", { params: branchParams }));
      if (tab === "leads") setLeads(await api<any>("/reports/leads", { params: branchParams }));
      if (tab === "customers") setCustomers(await api<any>("/reports/customers", { params: branchParams }));
      if (tab === "pnl") setPnl(await api<any>("/reports/pnl", { params: branchParams }));
      if (tab === "stock") setStockValuation(await api<any>("/reports/stock-valuation", { params: { branchId: branchId || undefined } }));
      if (tab === "reorder") setReorder(await api<any>("/reports/purchase-suggestions", { params: { branchId: branchId || undefined } }));
      if (tab === "forecast") setForecast(await api<any>("/intelligence/forecast", { params: { branchId: branchId || undefined } }));
      if (tab === "recon") setRecon(await api<any>("/reports/reconciliation", { params: { branchId: branchId || undefined } }));
    } finally {
      setLoading(false);
    }
  }, [tab, period, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = () => {
    const token = getToken();
    const url = `${API_URL}/reports/export/${tab}?period=${period}${branchId ? `&branchId=${branchId}` : ""}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${tab}-report-${period}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`CRM Report — ${tab.toUpperCase()}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Period: ${period}`, 14, 25);

    const rows: string[][] = [];
    const headers: string[] = [];

    if (tab === "sales" && sales) {
      headers.push("Branch", "Revenue", "Transactions");
      sales.byBranch.forEach((b: any) => rows.push([b.name, formatMoney(b.revenue), String(b.count)]));
      autoTable(doc, { startY: 32, head: [headers], body: rows });
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Best selling products", 14, 18);
      autoTable(doc, {
        startY: 24,
        head: [["Product", "Quantity", "Revenue"]],
        body: sales.bestSellers.map((b: any) => [b.name, String(b.quantity), formatMoney(b.revenue)]),
      });
    } else if (tab === "leads" && leads) {
      headers.push("Source", "Leads", "Won");
      leads.bySource.forEach((s: any) => rows.push([s.source, String(s.count), String(s.won)]));
      autoTable(doc, { startY: 32, head: [headers], body: rows });
    } else if (tab === "customers" && customers) {
      headers.push("Month", "New customers");
      customers.monthly.forEach((m: any) => rows.push([m.month, String(m.count)]));
      autoTable(doc, { startY: 32, head: [headers], body: rows });
    }

    doc.save(`crm-${tab}-report-${period}.pdf`);
  };

  const periodSelect = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${period === p.key ? "bg-brand-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {isAdmin && (
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs text-gray-700">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      {["sales", "leads", "customers"].includes(tab) && (
        <>
          <Button variant="outline" size="sm" onClick={exportCsv}><FileDown className="h-3.5 w-3.5" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}><FileText className="h-3.5 w-3.5" /> PDF</Button>
        </>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader breadcrumb="Analytics" title="Reports & Analytics" subtitle="Financial, pipeline and growth insights" actions={periodSelect} />
      <Tabs
        tabs={[
          { key: "sales", label: "Sales & revenue" },
          { key: "leads", label: "Leads & pipeline" },
          { key: "customers", label: "Customer growth" },
          { key: "pnl", label: "Profit & loss" },
          { key: "stock", label: "Stock valuation" },
          { key: "reorder", label: "Reorder list" },
          { key: "forecast", label: "Forecast" },
          { key: "recon", label: "Reconciliation" },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="pt-5">
        {loading && !(sales || leads || customers || pnl || stockValuation || reorder || forecast || recon) ? (
          <Spinner label="Generating report..." />
        ) : (
          <>
            {tab === "sales" && sales && <SalesReport data={sales} />}
            {tab === "leads" && leads && <LeadsReport data={leads} />}
            {tab === "customers" && customers && <CustomersReport data={customers} />}
            {tab === "pnl" && pnl && <PnlReport data={pnl} />}
            {tab === "stock" && stockValuation && <StockValuationReport data={stockValuation} />}
            {tab === "reorder" && reorder && <ReorderReport data={reorder} />}
            {tab === "forecast" && forecast && <ForecastReport data={forecast} />}
            {tab === "recon" && recon && <ReconciliationReport data={recon} />}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ items }: { items: { label: string; value: string; tone?: "green" | "amber" | "red" | "blue" }[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((s) => (
        <Card key={s.label} className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{s.value}</p>
          {s.tone && <Badge tone={s.tone} className="mt-1">{s.tone}</Badge>}
        </Card>
      ))}
    </div>
  );
}

function SalesReport({ data }: { data: any }) {
  const s = data.summary;
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Total revenue", value: formatMoney(s.totalRevenue), tone: "green" },
          { label: "Gross profit", value: formatMoney(s.grossProfit) },
          { label: "Profit margin", value: `${s.profitMargin.toFixed(1)}%`, tone: "blue" },
          { label: "Transactions", value: formatNumber(s.totalTransactions) },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Revenue trend</CardTitle></CardHeader>
          <CardContent><AreaTrend data={data.revenueTrend} xKey="date" yKey="revenue" height={280} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By payment method</CardTitle></CardHeader>
          <CardContent><DonutChart data={data.byPaymentMethod} nameKey="method" valueKey="revenue" /></CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Best selling products</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium">Product</th><th className="px-4 py-2.5 text-right font-medium">Qty</th><th className="px-4 py-2.5 text-right font-medium">Revenue</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.bestSellers.map((b: any) => (
                  <tr key={b.productId}><td className="px-4 py-2.5 text-gray-800">{b.name}</td><td className="px-4 py-2.5 text-right">{formatNumber(b.quantity)}</td><td className="px-4 py-2.5 text-right font-medium">{formatMoney(b.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Staff performance</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium">Staff</th><th className="px-4 py-2.5 text-right font-medium">Sales</th><th className="px-4 py-2.5 text-right font-medium">Revenue</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.staffPerformance.map((b: any) => (
                  <tr key={b.userId}><td className="px-4 py-2.5 text-gray-800">{b.name}</td><td className="px-4 py-2.5 text-right">{b.count}</td><td className="px-4 py-2.5 text-right font-medium">{formatMoney(b.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LeadsReport({ data }: { data: any }) {
  const s = data.summary;
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Total leads", value: formatNumber(s.total) },
          { label: "Won", value: formatNumber(s.won), tone: "green" },
          { label: "Conversion rate", value: `${s.conversionRate.toFixed(1)}%`, tone: "blue" },
          { label: "Pipeline value", value: formatMoney(s.pipelineValue) },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Leads by source</CardTitle></CardHeader>
          <CardContent><SimpleBars data={data.bySource} xKey="source" yKey="count" height={260} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pipeline by stage</CardTitle></CardHeader>
          <CardContent><DonutChart data={data.byStatus} nameKey="status" valueKey="count" /></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Performance by representative</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2.5 font-medium">Rep</th><th className="px-4 py-2.5 text-right font-medium">Leads</th><th className="px-4 py-2.5 text-right font-medium">Won</th><th className="px-4 py-2.5 text-right font-medium">Value</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {data.byAssignee.map((a: any) => (
                <tr key={a.name}><td className="px-4 py-2.5 text-gray-800">{a.name}</td><td className="px-4 py-2.5 text-right">{a.total}</td><td className="px-4 py-2.5 text-right">{a.won}</td><td className="px-4 py-2.5 text-right font-medium">{formatMoney(a.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function CustomersReport({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Total customers", value: formatNumber(data.totalCustomers) },
          { label: "New this period", value: formatNumber(data.newInPeriod), tone: "green" },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New customers per month</CardTitle></CardHeader>
          <CardContent><SimpleBars data={data.monthly} xKey="month" yKey="count" height={260} color="#8b5cf6" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By segment</CardTitle></CardHeader>
          <CardContent><DonutChart data={data.bySegment} nameKey="segment" valueKey="count" /></CardContent>
        </Card>
      </div>
    </div>
  );
}

function PnlReport({ data }: { data: any }) {
  const s = data.summary;
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Revenue", value: formatMoney(s.totalRevenue), tone: "green" },
          { label: "Cost of goods", value: formatMoney(s.totalCogs), tone: "red" },
          { label: "Gross profit", value: formatMoney(s.grossProfit) },
          { label: "Profit margin", value: `${s.profitMargin.toFixed(1)}%`, tone: "blue" },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>P&L summary</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {[
                { label: "Gross profit", value: formatMoney(s.grossProfit) },
                { label: "Operating expenses", value: `-${formatMoney(s.totalExpenses)}` },
                { label: "Pending returns", value: `-${formatMoney(s.pendingReturns)}` },
                { label: "Net profit", value: formatMoney(s.netProfit) },
                { label: "Net margin", value: `${s.netMargin.toFixed(1)}%` },
                { label: "Discounts given", value: `-${formatMoney(s.totalDiscount)}` },
                { label: "Points redeemed", value: `-${formatMoney(s.totalPointsDiscount)}` },
                { label: "Tax collected", value: formatMoney(s.totalTax) },
                { label: "Transactions", value: formatNumber(s.transactions) },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                  <dt className="text-gray-500">{row.label}</dt>
                  <dd className={row.label === "Net profit" ? "font-bold text-gray-900" : "font-semibold text-gray-900"}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Expenses by category</CardTitle></CardHeader>
          <CardContent>
            {data.expensesByCategory.length === 0 ? (
              <p className="text-xs text-gray-400">No expenses recorded this period.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.expensesByCategory.map((c: any) => (
                  <li key={c.category} className="flex items-center justify-between">
                    <span className="text-gray-600">{c.category}</span>
                    <span className="font-medium text-gray-900">{formatMoney(c.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader><CardTitle>Profit by branch</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium">Branch</th><th className="px-4 py-2.5 text-right font-medium">Sales</th><th className="px-4 py-2.5 text-right font-medium">COGS</th><th className="px-4 py-2.5 text-right font-medium">Expenses</th><th className="px-4 py-2.5 text-right font-medium">Profit</th><th className="px-4 py-2.5 text-right font-medium">Margin</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.byBranch.map((b: any) => (
                  <tr key={b.id}><td className="px-4 py-2.5 text-gray-800">{b.name}</td><td className="px-4 py-2.5 text-right">{formatMoney(b.revenue)}</td><td className="px-4 py-2.5 text-right">{formatMoney(b.cost)}</td><td className="px-4 py-2.5 text-right">{formatMoney(b.expenses)}</td><td className="px-4 py-2.5 text-right font-medium">{formatMoney(b.profit)}</td><td className="px-4 py-2.5 text-right">{b.revenue > 0 ? `${((b.profit / b.revenue) * 100).toFixed(1)}%` : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StockValuationReport({ data }: { data: any }) {
  const s = data.summary;
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Value at cost", value: formatMoney(s.totalValueAtCost) },
          { label: "Value at retail", value: formatMoney(s.totalValueAtPrice), tone: "green" },
          { label: "Potential margin", value: formatMoney(s.potentialMargin), tone: "blue" },
          { label: "Units on hand", value: formatNumber(s.totalUnits) },
        ]}
      />
      <Card>
        <CardHeader><CardTitle>Valuation by branch</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2.5 font-medium">Branch</th><th className="px-4 py-2.5 text-right font-medium">SKUs</th><th className="px-4 py-2.5 text-right font-medium">Units</th><th className="px-4 py-2.5 text-right font-medium">Value at cost</th><th className="px-4 py-2.5 text-right font-medium">Value at retail</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {data.byBranch.map((b: any) => (
                <tr key={b.id}><td className="px-4 py-2.5 text-gray-800">{b.name}</td><td className="px-4 py-2.5 text-right">{b.skuCount}</td><td className="px-4 py-2.5 text-right">{formatNumber(b.units)}</td><td className="px-4 py-2.5 text-right font-medium">{formatMoney(b.valueAtCost)}</td><td className="px-4 py-2.5 text-right">{formatMoney(b.valueAtPrice)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Stock by product</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium">Branch</th><th className="px-4 py-2.5 font-medium">Product</th><th className="px-4 py-2.5 text-right font-medium">Qty</th><th className="px-4 py-2.5 text-right font-medium">Unit cost</th><th className="px-4 py-2.5 text-right font-medium">Value at cost</th><th className="px-4 py-2.5 text-right font-medium">Value at retail</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {data.products.map((p: any) => (
                  <tr key={`${p.branchId}-${p.productId}`}><td className="px-4 py-2.5 text-gray-800">{p.branchName}</td><td className="px-4 py-2.5 text-gray-800">{p.name}<p className="text-xs text-gray-400">{p.sku}</p></td><td className="px-4 py-2.5 text-right">{formatNumber(p.quantity)}</td><td className="px-4 py-2.5 text-right">{formatMoney(p.cost)}</td><td className="px-4 py-2.5 text-right font-medium">{formatMoney(p.valueAtCost)}</td><td className="px-4 py-2.5 text-right">{formatMoney(p.valueAtPrice)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReorderReport({ data }: { data: any }) {
  const items = data.suggestions ?? [];
  const outOfStock = items.filter((i: any) => i.status === "OUT_OF_STOCK").length;
  const low = items.length - outOfStock;
  const totalSuggested = items.reduce((s: number, i: any) => s + i.suggestedQty, 0);
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Items to reorder", value: formatNumber(items.length), tone: "amber" },
          { label: "Out of stock", value: formatNumber(outOfStock), tone: "red" },
          { label: "Low stock", value: formatNumber(low), tone: "amber" },
          { label: "Suggested units", value: formatNumber(totalSuggested), tone: "blue" },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Purchase suggestions</CardTitle>
          <p className="text-xs text-gray-500">Suggested order quantity restores each item to 2x its low-stock threshold, informed by 30-day sales velocity.</p>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2.5 font-medium">Branch</th><th className="px-4 py-2.5 font-medium">Product</th><th className="px-4 py-2.5 text-right font-medium">On hand</th><th className="px-4 py-2.5 text-right font-medium">Threshold</th><th className="px-4 py-2.5 text-right font-medium">Sold (30d)</th><th className="px-4 py-2.5 text-right font-medium">Days left</th><th className="px-4 py-2.5 text-right font-medium">Order qty</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((i: any) => (
                <tr key={`${i.branchId}-${i.productId}`}>
                  <td className="px-4 py-2.5 text-gray-800">{i.branchName}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{i.name}</span>
                      <Badge tone={i.status === "OUT_OF_STOCK" ? "red" : "amber"}>{i.status === "OUT_OF_STOCK" ? "Out" : "Low"}</Badge>
                    </div>
                    <p className="text-xs text-gray-400">{i.sku}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{i.currentQty}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{i.lowStockThreshold}</td>
                  <td className="px-4 py-2.5 text-right">{formatNumber(i.soldLast30)}</td>
                  <td className="px-4 py-2.5 text-right">{i.coverDays === null ? "—" : i.coverDays}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-brand-600">{i.suggestedQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ForecastReport({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Forecast (30d)", value: formatMoney(data.totalForecast), tone: "green" },
          { label: "Avg daily forecast", value: formatMoney(data.avgDaily), tone: "blue" },
          { label: "Avg order value", value: formatMoney(data.avgOrderValue) },
          { label: "Actual (90d)", value: formatMoney(data.actualTotal) },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Revenue forecast</CardTitle>
          <p className="text-xs text-gray-500">Projected daily revenue for the next {data.forecastDays} days, extrapolated from the last 90 days of sales via linear regression.</p>
        </CardHeader>
        <CardContent><AreaTrend data={data.series} xKey="date" yKey="forecast" height={300} /></CardContent>
      </Card>
    </div>
  );
}

function ReconciliationReport({ data }: { data: any }) {
  const rows = data.rows ?? [];
  const t = data.totals;
  return (
    <div className="space-y-6">
      <SummaryRow
        items={[
          { label: "Total sales", value: formatMoney(t.total), tone: "green" },
          { label: "Amount paid", value: formatMoney(t.amountPaid), tone: "blue" },
          { label: "On credit", value: formatMoney(t.creditUsed), tone: "amber" },
          { label: "Transactions", value: formatNumber(t.count) },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Payment reconciliation by branch</CardTitle>
          <p className="text-xs text-gray-500">Daily settlement view: what was collected per payment method (cash / card / mobile money / credit).</p>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2.5 font-medium">Branch</th><th className="px-4 py-2.5 font-medium">Method</th><th className="px-4 py-2.5 text-right font-medium">Transactions</th><th className="px-4 py-2.5 text-right font-medium">Amount paid</th><th className="px-4 py-2.5 text-right font-medium">Credit</th><th className="px-4 py-2.5 text-right font-medium">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-gray-400">No completed sales in this period.</td></tr>}
              {rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="px-4 py-2.5 text-gray-800">{r.branch ? `${r.branch.code} — ${r.branch.name}` : "—"}</td>
                  <td className="px-4 py-2.5"><Badge tone={r.method === "CREDIT" ? "amber" : r.method === "CASH" ? "green" : "blue"}>{r.method}</Badge></td>
                  <td className="px-4 py-2.5 text-right">{r.count}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{formatMoney(r.amountPaid)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-600">{formatMoney(r.creditUsed)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{formatMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
