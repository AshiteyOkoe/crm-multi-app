"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Minus, Trash2, ShoppingCart, User, Banknote, Receipt, PackagePlus } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import type { Customer, PaymentMethod, Product, Sale } from "@/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductFormModal } from "@/components/inventory/ProductFormModal";

interface CartLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  available: number;
}

export function Pos() {
  const { user, isAdmin, isManager, branches } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [discount, setDiscount] = useState(0);
  const [branchId, setBranchId] = useState(user?.branchId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>("/inventory", { params: { branchId: branchId || undefined } });
      setProducts(res.products);
      if (!branchId) setBranchId(res.branch?.id ?? "");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!customerQuery.trim()) {
      setCustomers([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await api<{ items: Customer[] }>("/customers", { params: { search: customerQuery, pageSize: 8 } });
      setCustomers(res.items);
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target as Node)) setShowCustomerSearch(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q));
  }, [products, search]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        if (existing.quantity >= (product.quantity ?? 0)) return prev;
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if ((product.quantity ?? 0) < 1) return prev;
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1, available: product.quantity ?? 0 }];
    });
  };

  const setQty = (productId: string, quantity: number) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const q = Math.min(Math.max(quantity, 0), l.available);
        return { ...l, quantity: q };
      })
    );
  };

  const removeLine = (productId: string) => setCart((prev) => prev.filter((l) => l.productId !== productId));

  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const total = Math.max(subtotal - discount, 0);

  const completeSale = async () => {
    setError(null);
    if (cart.length === 0) return setError("Add at least one item to the cart.");
    setSubmitting(true);
    try {
      const sale = await api<Sale>("/sales", {
        method: "POST",
        body: {
          branchId: branchId || undefined,
          customerId: customer?.id ?? null,
          paymentMethod,
          discount,
          items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        },
      });
      setReceipt(sale);
      setCart([]);
      setCustomer(null);
      setCustomerQuery("");
      setDiscount(0);
      load();
    } catch (err: any) {
      setError(err?.message ?? "Could not complete sale");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Product grid */}
      <div className="lg:col-span-2">
        {error && <Alert kind="error" className="mb-4">{error}</Alert>}
        <div className="mb-4 flex gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name, SKU or category..."
              className="h-11 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          {isAdmin && (
            <>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <Button variant="outline" onClick={() => setProductModalOpen(true)} className="h-11 shrink-0">
                <PackagePlus className="h-4 w-4" /> New product
              </Button>
            </>
          )}
        </div>

        {loading ? (
          <Spinner label="Loading stock..." />
        ) : filtered.length === 0 ? (
          <EmptyState title="No products found" description="Check the inventory page or adjust your search." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => {
              const out = (p.quantity ?? 0) <= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={out}
                  className={cn(
                    "group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-card transition-all hover:border-brand-300 hover:shadow-lift",
                    out && "opacity-50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{p.category ?? "General"}</span>
                    <Badge tone={out ? "red" : p.quantity! <= p.lowStockThreshold ? "amber" : "green"}>
                      {out ? "Out" : `${p.quantity} in stock`}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900">{p.name}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-base font-bold text-brand-600">{formatMoney(p.price)}</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-50 text-gray-400 group-hover:bg-brand-50 group-hover:text-brand-600">
                      <Plus className="h-4 w-4" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <ShoppingCart className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-gray-900">Current sale</h3>
          <Badge tone="blue">{cart.reduce((s, l) => s + l.quantity, 0)} items</Badge>
        </div>

        {/* Customer picker */}
        <div className="border-b border-gray-100 p-4">
          <div className="relative" ref={customerSearchRef}>
            <button
              onClick={() => setShowCustomerSearch((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm"
            >
              <User className="h-4 w-4 text-gray-400" />
              <span className={cn("flex-1", !customer && "text-gray-400")}>
                {customer ? customer.name : "Walk-in customer (optional)"}
              </span>
              {customer && (
                <span onClick={(e) => { e.stopPropagation(); setCustomer(null); setCustomerQuery(""); }} className="rounded p-1 text-gray-400 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              )}
            </button>
            {showCustomerSearch && (
              <div className="absolute left-0 right-0 top-12 z-10 rounded-xl border border-gray-200 bg-white p-2 shadow-lift">
                <input
                  autoFocus
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Search by phone or name..."
                  className="mb-2 h-9 w-full rounded-lg border border-gray-200 px-3 text-sm"
                />
                <div className="max-h-52 overflow-y-auto">
                  {customers.length === 0 && <p className="p-3 text-center text-xs text-gray-400">No matches</p>}
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setCustomer(c); setShowCustomerSearch(false); }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-800">{c.name}</span>
                      <span className="text-xs text-gray-400">{c.phone ?? c.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cart lines */}
        <div className="max-h-72 min-h-24 overflow-y-auto p-4 scrollbar-thin">
          {cart.length === 0 && <p className="pt-6 text-center text-xs text-gray-400">Cart is empty. Tap a product to add it.</p>}
          <ul className="space-y-3">
            {cart.map((line) => (
              <li key={line.productId} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex-1 text-sm font-medium text-gray-900">{line.name}</p>
                  <button onClick={() => removeLine(line.productId)} className="text-gray-300 hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 rounded-lg border border-gray-200">
                    <button onClick={() => setQty(line.productId, line.quantity - 1)} className="px-2 py-1 text-gray-500 hover:bg-gray-50">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{line.quantity}</span>
                    <button onClick={() => setQty(line.productId, line.quantity + 1)} className="px-2 py-1 text-gray-500 hover:bg-gray-50">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{formatMoney(line.price * line.quantity)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Payment */}
        <div className="space-y-3 border-t border-gray-100 p-4">
          <div className="grid grid-cols-3 gap-2">
            {(["CASH", "CARD", "MOBILE_MONEY"] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-medium transition-colors",
                  paymentMethod === m ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                )}
              >
                <Banknote className="h-4 w-4" />
                {m === "MOBILE_MONEY" ? "Mobile Money" : m.charAt(0) + m.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          {isManager && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Discount</span>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                className="w-28 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm"
              />
            </div>
          )}
          <div className="flex items-center justify-between border-t border-dashed border-gray-200 pt-3">
            <span className="text-sm font-medium text-gray-600">Total</span>
            <span className="text-xl font-bold text-gray-900">{formatMoney(total)}</span>
          </div>
          <Button onClick={completeSale} loading={submitting} className="w-full" size="lg">
            <Receipt className="h-5 w-5" /> Complete sale · {formatMoney(total)}
          </Button>
        </div>
      </div>

      {/* Receipt modal */}
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Receipt generated" wide>
        {receipt && (
          <div>
            <div className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-white p-6 font-mono text-sm">
              <div className="mb-4 text-center">
                <p className="text-lg font-bold text-gray-900">{receipt.branch?.name}</p>
                <p className="text-xs text-gray-500">Invoice #{receipt.invoiceNo}</p>
                <p className="text-xs text-gray-500">{new Date(receipt.createdAt).toLocaleString()}</p>
              </div>
              <div className="mb-3 border-t border-dashed border-gray-300 pt-3 text-xs text-gray-600">
                <p>Cashier: {receipt.user?.name}</p>
                <p>Customer: {receipt.customer?.name ?? "Walk-in"}</p>
                <p>Payment: {receipt.paymentMethod}</p>
              </div>
              <table className="w-full border-t border-dashed border-gray-300 text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="py-1 text-left">Item</th>
                    <th className="py-1 text-right">Qty</th>
                    <th className="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1">{item.productName}</td>
                      <td className="py-1 text-right">{item.quantity}</td>
                      <td className="py-1 text-right">{formatMoney(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 space-y-1 border-t border-dashed border-gray-300 pt-3 text-xs">
                <p className="flex justify-between"><span>Subtotal</span><span>{formatMoney(receipt.subtotal)}</span></p>
                <p className="flex justify-between"><span>Discount</span><span>-{formatMoney(receipt.discount)}</span></p>
                <p className="flex justify-between text-sm font-bold"><span>Total</span><span>{formatMoney(receipt.total)}</span></p>
              </div>
              <p className="mt-4 text-center text-[10px] text-gray-400">Thank you for shopping with us!</p>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="outline" onClick={() => window.print()}>Print</Button>
              <Button onClick={() => setReceipt(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      <ProductFormModal open={productModalOpen} onClose={() => setProductModalOpen(false)} onSaved={load} />
    </div>
  );
}
