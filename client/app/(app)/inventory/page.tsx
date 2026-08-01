"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ArrowLeftRight, PackagePlus, AlertTriangle, Check, X, Truck } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { cn, formatDateTime, formatMoney, formatNumber } from "@/lib/utils";
import type { Paginated, Product, StockTransfer } from "@/types";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader, SearchInput } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input, Select, Field } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";

export default function InventoryPage() {
  const { user, isAdmin, isManager } = useApp();
  const [tab, setTab] = useState("stock");

  return (
    <div>
      <PageHeader
        breadcrumb="Operations"
        title="Inventory"
        subtitle="Multi-location stock control, transfers and alerts"
      />
      <Tabs tabs={[{ key: "stock", label: "Stock levels" }, { key: "transfers", label: "Transfers" }]} active={tab} onChange={setTab} />
      <div className="pt-5">{tab === "stock" ? <StockTab /> : <TransfersTab />}</div>
    </div>
  );
}

function StockTab() {
  const { user, branches, isAdmin, isManager } = useApp();
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [productModal, setProductModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>("/inventory", { params: { branchId: branchId || undefined } });
      setData(res);
      if (!branchId) setBranchId(res.branch?.id ?? "");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <Spinner label="Loading inventory..." />;
  if (!data) return <EmptyState title="No inventory data" />;

  const products = data.products as (Product & { quantity: number })[];
  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q);
  });

  const lowStock = data.lowStock as { branch: any; product: Product; quantity: number }[];
  const outOfStock = data.outOfStock as { branch: any; product: Product }[];

  const adjustStock = async () => {
    await api("/inventory/stock/adjust", { method: "POST", body: { branchId, productId: adjustProduct!.id, quantity: adjustQty } });
    setAdjustOpen(false);
    load();
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">SKUs tracked</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{formatNumber(data.totalSku)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total units in stock</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{formatNumber(data.totalUnits)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Stock value</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{formatMoney(data.stockValue)}</p>
        </Card>
      </div>

      {lowStock.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800">{lowStock.length} products at or below their low-stock threshold</p>
                <p className="text-xs text-amber-700">{outOfStock.length} out of stock across branches</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {outOfStock.slice(0, 4).map((o) => (
                <Badge key={o.product.id + o.branch.code} tone="red">{o.product.name} @ {o.branch.code}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search products..." className="sm:w-80" />
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
          {(isAdmin ? branches : branches.filter((b) => b.id === user?.branchId)).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        {isManager && (
          <Button variant="outline" onClick={() => setProductModal(true)} className="ml-auto">
            <PackagePlus className="h-4 w-4" /> New product
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Cost</th>
                <th className="px-4 py-3 text-right font-medium">In stock</th>
                <th className="px-4 py-3 text-right font-medium">Threshold</th>
                <th className="px-4 py-3 text-right font-medium">Status</th>
                {isManager && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p) => {
                const low = p.quantity <= p.lowStockThreshold;
                return (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.category ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatMoney(p.price)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatMoney(p.cost)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn("font-bold", low ? "text-red-600" : "text-gray-900")}>{formatNumber(p.quantity)}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{p.lowStockThreshold}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone={p.quantity <= 0 ? "red" : low ? "amber" : "green"} dot>
                        {p.quantity <= 0 ? "Out of stock" : low ? "Low" : "In stock"}
                      </Badge>
                    </td>
                    {isManager && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setAdjustProduct(p); setAdjustQty(p.quantity); setAdjustOpen(true); }}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                        >
                          Adjust
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState title="No products match" />}
      </Card>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title={`Adjust stock — ${adjustProduct?.name ?? ""}`}
        footer={<><Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button><Button onClick={adjustStock}>Save</Button></>}>
        <Field label="New quantity in this branch">
          <Input type="number" min="0" value={adjustQty} onChange={(e) => setAdjustQty(Number(e.target.value) || 0)} />
        </Field>
        <p className="mt-2 text-xs text-gray-400">Set the exact quantity in the selected branch.</p>
      </Modal>

      <ProductModal open={productModal} onClose={() => setProductModal(false)} onSaved={load} />
    </div>
  );
}

function ProductModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", sku: "", category: "", price: "", cost: "", lowStockThreshold: "5" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (!form.name || !form.sku) return setError("Name and SKU are required.");
    setSaving(true);
    try {
      await api("/inventory/products", {
        method: "POST",
        body: { ...form, price: Number(form.price || 0), cost: Number(form.cost || 0), lowStockThreshold: Number(form.lowStockThreshold || 0) },
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Could not create product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New product"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Create product</Button></>}>
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}
      <div className="space-y-4">
        <Field label="Product name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU" required><Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} /></Field>
          <Field label="Category"><Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Selling price"><Input type="number" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></Field>
          <Field label="Cost price"><Input type="number" min="0" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} /></Field>
          <Field label="Low stock at"><Input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function TransfersTab() {
  const { branches, user, isAdmin } = useApp();
  const [items, setItems] = useState<StockTransfer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ productId: "", fromBranchId: "", toBranchId: "", quantity: "", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<StockTransfer>>("/inventory/transfers", { params: { page, pageSize: 20, status: status || undefined } });
      setItems(res.items);
      setTotal(res.total);
      setPages(res.pages);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const openModal = async () => {
    const res = await api<any>("/inventory/products", { params: { pageSize: 100 } });
    setProducts(res.items);
    setModalOpen(true);
  };

  const submit = async () => {
    setError(null);
    if (!form.productId || !form.fromBranchId || !form.toBranchId || !form.quantity) return setError("Complete all required fields.");
    setSaving(true);
    try {
      await api("/inventory/transfers", { method: "POST", body: { ...form, quantity: Number(form.quantity) } });
      setModalOpen(false);
      setForm({ productId: "", fromBranchId: "", toBranchId: "", quantity: "", note: "" });
      load();
    } catch (err: any) {
      setError(err?.message ?? "Could not request transfer");
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id: string, action: string) => {
    await api(`/inventory/transfers/${id}/decide`, { method: "POST", body: { action } });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <span className="text-xs text-gray-500">{total} transfers</span>
        <Button onClick={openModal} className="ml-auto"><ArrowLeftRight className="h-4 w-4" /> Request transfer</Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <Spinner label="Loading transfers..." />
        ) : items.length === 0 ? (
          <EmptyState title="No transfers" description="Request stock movements between branches." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">From</th>
                  <th className="px-4 py-3 font-medium">To</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{t.product?.name}</p>
                      <p className="text-xs text-gray-400">{t.product?.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.fromBranch?.code}</td>
                    <td className="px-4 py-3 text-gray-600">{t.toBranch?.code}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{t.quantity}</td>
                    <td className="px-4 py-3"><Badge tone={t.status === "COMPLETED" ? "green" : t.status === "PENDING" ? "amber" : t.status === "APPROVED" ? "blue" : "red"} dot>{t.status}</Badge></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDateTime(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      {t.status === "PENDING" && isAdmin && (
                        <div className="flex gap-1.5">
                          <button onClick={() => decide(t.id, "APPROVED")} className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 hover:bg-emerald-100" title="Approve"><Check className="h-4 w-4" /></button>
                          <button onClick={() => decide(t.id, "REJECTED")} className="rounded-lg bg-red-50 p-1.5 text-red-600 hover:bg-red-100" title="Reject"><X className="h-4 w-4" /></button>
                        </div>
                      )}
                      {t.status === "APPROVED" && (t.toBranchId === user?.branchId || isAdmin) && (
                        <Button size="sm" variant="outline" onClick={() => decide(t.id, "COMPLETED")}>
                          <Truck className="h-3.5 w-3.5" /> Receive stock
                        </Button>
                      )}
                      {t.status === "APPROVED" && t.toBranchId !== user?.branchId && !isAdmin && (
                        <span className="text-xs text-gray-400">Awaiting receiving</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} onPage={setPage} total={total} />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Request stock transfer"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={submit} loading={saving}>Submit request</Button></>}>
        {error && <Alert kind="error" className="mb-4">{error}</Alert>}
        <div className="space-y-4">
          <Field label="Product" required>
            <Select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}>
              <option value="">Select product...</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From branch" required>
              <Select value={form.fromBranchId} onChange={(e) => setForm((f) => ({ ...f, fromBranchId: e.target.value }))}>
                <option value="">Select...</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="To branch" required>
              <Select value={form.toBranchId} onChange={(e) => setForm((f) => ({ ...f, toBranchId: e.target.value }))}>
                <option value="">Select...</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Quantity" required>
            <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          </Field>
          <Field label="Note (optional)">
            <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
