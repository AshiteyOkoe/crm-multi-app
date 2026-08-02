"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Minus, Trash2, ShoppingCart, User, Banknote, Receipt, PackagePlus, Award, Barcode, CreditCard, Smartphone, Mail, MessageSquare, WifiOff, CloudUpload } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import { REDEMPTION_POINTS, REDEMPTION_VALUE, TIER_LABELS, TIER_TONES, maxRedeemablePoints, pointsForAmount, redemptionValue, tierFor } from "@/lib/loyalty";
import { cacheCustomers, cacheProducts, enqueueSale, getCachedCustomers, getCachedProducts, getPendingSales, isOnline, removePendingSales } from "@/lib/offline";
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
  const [pointsRedeemed, setPointsRedeemed] = useState(0);
  const [branchId, setBranchId] = useState(user?.branchId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [receiptChannels, setReceiptChannels] = useState<string[]>([]);
  const [currency, setCurrency] = useState("GHS");
  const [offline, setOffline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const syncPending = useCallback(async () => {
    const pending = await getPendingSales();
    setQueuedCount(pending.length);
    if (!pending.length || !isOnline()) return;
    let synced = 0;
    let failed = 0;
    for (const p of pending) {
      try {
        await api("/sales", { method: "POST", body: p.payload });
        await removePendingSales([p.id]);
        synced += 1;
      } catch {
        failed += 1;
      }
    }
    const remaining = await getPendingSales();
    setQueuedCount(remaining.length);
    if (synced > 0) setSuccess(`${synced} queued sale${synced === 1 ? "" : "s"} synced.`);
    if (failed > 0) setError(`${failed} queued sale${failed === 1 ? "" : "s"} could not be synced. Check your connection.`);
  }, []);

  useEffect(() => {
    setOffline(!isOnline());
    syncPending();
    const onOnline = () => { setOffline(false); syncPending(); };
    const onOffline = () => { setOffline(true); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncPending]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>("/inventory", { params: { branchId: branchId || undefined } });
      setProducts(res.products);
      const targetBranch = branchId || res.branch?.id;
      if (targetBranch) cacheProducts(targetBranch, res.products);
      if (!branchId) setBranchId(res.branch?.id ?? "");
      const settings = await api<Record<string, string>>("/branches/settings");
      setCurrency(settings.currency ?? "GHS");
      setReceiptChannels((settings.receiptChannels ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    } catch {
      // Offline: fall back to the last cached stock for this branch.
      const cached = await getCachedProducts(branchId);
      if (cached.length) {
        setProducts(cached);
        setOffline(true);
        setError(null);
      } else {
        setError("You are offline and no cached stock is available for this branch.");
      }
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
      try {
        const res = await api<{ items: Customer[] }>("/customers", { params: { search: customerQuery, pageSize: 8 } });
        setCustomers(res.items);
        cacheCustomers(res.items);
      } catch {
        const cached = await getCachedCustomers(customerQuery);
        setCustomers(cached);
      }
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

  const lookupBarcode = async (value: string) => {
    const sku = value.trim();
    if (!sku) return;
    try {
      const product = await api<Product | null>(`/inventory/products/lookup/${encodeURIComponent(sku)}`);
      if (!product) return setError(`No product found for barcode ${sku}`);
      setError(null);
      addToCart(product);
    } catch (err: any) {
      setError(err?.message ?? "Could not look up barcode");
    } finally {
      setBarcode("");
      barcodeRef.current?.focus();
    }
  };

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
  const pointsAvailable = customer?.points ?? 0;
  const usablePoints = Math.min(pointsRedeemed, Math.min(pointsAvailable, maxRedeemablePoints(Math.max(subtotal - discount, 0))));
  const pointsOff = redemptionValue(usablePoints);
  const total = Math.max(subtotal - discount - pointsOff, 0);
  const willEarn = customer ? pointsForAmount(total) : 0;
  const creditAvailable = Math.max((customer?.creditLimit ?? 0) - (customer?.creditBalance ?? 0), 0);
  const payAmount = paymentMethod === "CASH" ? total : (amountPaid ?? total);
  const change = paymentMethod === "CASH" ? Math.max(payAmount - total, 0) : 0;
  const creditUsed = paymentMethod === "CREDIT" ? Math.max(total - payAmount, 0) : 0;

  const completeSale = async () => {
    setError(null);
    if (cart.length === 0) return setError("Add at least one item to the cart.");
    if (paymentMethod === "CREDIT" && !customer) return setError("Select a customer to buy on credit.");
    if (paymentMethod === "CREDIT" && creditAvailable < total - (amountPaid ?? 0)) return setError("This customer does not have enough credit for this purchase.");
    setSubmitting(true);
    const payload = {
      branchId: branchId || undefined,
      customerId: customer?.id ?? null,
      paymentMethod,
      amountPaid: paymentMethod === "CASH" ? undefined : Math.min(Math.max(payAmount, 0), total),
      discount,
      pointsRedeemed: usablePoints || undefined,
      deliverReceipt: receiptChannels.length ? receiptChannels : undefined,
      items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    };
    try {
      if (offline) {
        await enqueueSale(payload);
        const localSale: Sale = {
          id: `pending-${Date.now()}`,
          invoiceNo: `OFF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`,
          branchId,
          branch: { id: branchId, name: "Offline", code: "OFF" },
          user: user ? { id: user.id, name: user.name } : undefined,
          customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
          paymentMethod,
          subtotal,
          discount,
          tax: 0,
          total,
          pointsEarned: 0,
          pointsRedeemed: usablePoints || 0,
          pointsDiscount: pointsOff,
          status: "COMPLETED",
          pending: true,
          items: cart.map((l, i) => ({
            id: `pending-${i}`,
            productId: l.productId,
            productName: l.name,
            quantity: l.quantity,
            unitPrice: l.price,
            lineTotal: l.price * l.quantity,
          })),
          createdAt: new Date().toISOString(),
        };
        setQueuedCount((await getPendingSales()).length);
        setReceipt(localSale);
      } else {
        const sale = await api<Sale>("/sales", { method: "POST", body: payload });
        setReceipt(sale);
      }
      setCart([]);
      setCustomer(null);
      setCustomerQuery("");
      setDiscount(0);
      setPointsRedeemed(0);
      setAmountPaid(null);
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
        {success && <Alert kind="success" className="mb-4">{success}</Alert>}
        {(offline || queuedCount > 0) && (
          <Alert kind={offline ? "warning" : "success"} className="mb-4">
            <div className="flex items-center gap-2">
              {offline ? <WifiOff className="h-4 w-4" /> : <CloudUpload className="h-4 w-4" />}
              {offline
                ? queuedCount > 0
                  ? `Offline mode — ${queuedCount} sale${queuedCount === 1 ? "" : "s"} queued. They will sync automatically when you reconnect.`
                  : "Offline mode — showing cached stock. Sales will be queued and synced automatically."
                : queuedCount > 0
                  ? `${queuedCount} queued sale${queuedCount === 1 ? "" : "s"} pending sync.`
                  : null}
            </div>
          </Alert>
        )}
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
          <div className="relative w-52">
            <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              ref={barcodeRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupBarcode(barcode); } }}
              placeholder="Scan barcode..."
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
                <span className="flex items-center gap-1.5">
                  <Badge tone={TIER_TONES[tierFor(customer.totalPointsEarned ?? 0)]}>
                    <Award className="h-3 w-3" /> {TIER_LABELS[tierFor(customer.totalPointsEarned ?? 0)]}
                  </Badge>
                  <Badge tone="blue">{customer.points ?? 0} pts</Badge>
                  {(customer.creditAvailable ?? 0) > 0 && (
                    <Badge tone="amber">{formatMoney(customer.creditAvailable ?? 0, currency)} credit</Badge>
                  )}
                </span>
              )}
              {customer && (
                <span onClick={(e) => { e.stopPropagation(); setCustomer(null); setCustomerQuery(""); setPointsRedeemed(0); }} className="rounded p-1 text-gray-400 hover:text-red-500">
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
                      onClick={() => { setCustomer(c); setPointsRedeemed(0); setShowCustomerSearch(false); }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-800">{c.name}</span>
                      <span className="flex items-center gap-2">
                        {(c.points ?? 0) > 0 && <Badge tone="blue">{c.points} pts</Badge>}
                        <span className="text-xs text-gray-400">{c.phone ?? c.email}</span>
                      </span>
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
          <div className="grid grid-cols-4 gap-2">
            {(["CASH", "CARD", "MOBILE_MONEY", "CREDIT"] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => { setPaymentMethod(m); setAmountPaid(null); }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[10px] font-medium transition-colors",
                  paymentMethod === m ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                )}
              >
                {m === "CASH" ? <Banknote className="h-4 w-4" /> : m === "CARD" ? <CreditCard className="h-4 w-4" /> : m === "MOBILE_MONEY" ? <Smartphone className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                {m === "MOBILE_MONEY" ? "Mobile Money" : m.charAt(0) + m.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          {paymentMethod !== "CASH" && (
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Amount paid now</span>
                <span className="text-xs text-gray-400">{paymentMethod === "CREDIT" ? `Credit limit: ${formatMoney(creditAvailable, currency)} available` : "Partial payment allowed"}</span>
              </div>
              <input
                type="number"
                min="0"
                max={total}
                step="0.01"
                value={payAmount}
                onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
                className="mt-2 h-9 w-full rounded-lg border border-gray-200 px-3 text-right text-sm"
              />
              {paymentMethod === "CREDIT" && (
                <p className="mt-1.5 text-xs text-gray-500">Remaining balance of {formatMoney(creditUsed, currency)} goes on {customer?.name ?? "the customer's"} account.</p>
              )}
            </div>
          )}
          {customer && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="flex items-center gap-1.5">Send receipt via</span>
              <span className="flex items-center gap-1">
                {(["EMAIL", "SMS", "WHATSAPP"] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setReceiptChannels((prev) => (prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch]))}
                    title={ch}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
                      receiptChannels.includes(ch) ? "border-brand-500 bg-brand-50 text-brand-600" : "border-gray-200 text-gray-400 hover:bg-gray-50"
                    )}
                  >
                    {ch === "EMAIL" ? <Mail className="h-3.5 w-3.5" /> : ch === "SMS" ? <MessageSquare className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </span>
            </div>
          )}
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
          {customer && pointsAvailable >= REDEMPTION_POINTS && (
            <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-gray-600">
                  <Award className="h-4 w-4 text-brand-600" />
                  Redeem points
                </span>
                <span className="text-xs text-gray-500">{pointsAvailable.toLocaleString()} available</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step={REDEMPTION_POINTS}
                  max={pointsAvailable}
                  value={usablePoints}
                  onChange={(e) => setPointsRedeemed(Number(e.target.value) || 0)}
                  className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-right text-sm"
                />
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setPointsRedeemed(Math.min(pointsAvailable, maxRedeemablePoints(Math.max(subtotal - discount, 0))))}>
                  Use max
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                {REDEMPTION_POINTS} pts = {formatMoney(REDEMPTION_VALUE)} &middot; {pointsOff > 0 ? `deducts ${formatMoney(pointsOff)}` : "0 deducted"}
              </p>
            </div>
          )}
          {customer && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Loyalty reward on this purchase</span>
              <span className="font-medium text-brand-600">+{willEarn.toLocaleString()} pts</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-dashed border-gray-200 pt-3">
            <span className="text-sm font-medium text-gray-600">Total</span>
            <span className="text-xl font-bold text-gray-900">{formatMoney(total, currency)}</span>
          </div>
          {change > 0 && (
            <div className="flex items-center justify-between text-sm text-emerald-600">
              <span>Change due</span>
              <span className="font-semibold">{formatMoney(change, currency)}</span>
            </div>
          )}
          <Button onClick={completeSale} loading={submitting} className="w-full" size="lg">
            <Receipt className="h-5 w-5" /> Complete sale · {formatMoney(total, currency)}
          </Button>
        </div>
      </div>

      {/* Receipt modal */}
      <Modal open={!!receipt} onClose={() => setReceipt(null)} title={receipt?.pending ? "Sale saved offline" : "Receipt generated"} wide>
        {receipt && (
          <div>
            {receipt.pending && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <WifiOff className="h-4 w-4" />
                <span>Saved offline. This sale will sync to the server automatically once you're back online.</span>
              </div>
            )}
            <div className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-white p-6 font-mono text-sm">
              <div className="mb-4 text-center">
                <p className="text-lg font-bold text-gray-900">{receipt.branch?.name}</p>
                <p className="text-xs text-gray-500">Invoice #{receipt.invoiceNo}</p>
                <p className="text-xs text-gray-500">{new Date(receipt.createdAt).toLocaleString()}</p>
              </div>
              <div className="mb-3 border-t border-dashed border-gray-300 pt-3 text-xs text-gray-600">
                <p>Cashier: {receipt.user?.name}</p>
                <p>Customer: {receipt.customer?.name ?? "Walk-in"}{receipt.customer?.points ? ` (${receipt.customer.points} pts)` : ""}</p>
                <p>Payment: {receipt.paymentMethod}{receipt.paymentStatus ? ` · ${receipt.paymentStatus}` : ""}</p>
                {(receipt.amountPaid ?? receipt.total) < receipt.total && (
                  <p>Balance due: {formatMoney((receipt.total - (receipt.amountPaid ?? 0)), receipt.currency ?? currency)}</p>
                )}
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
                {(receipt.pointsRedeemed ?? 0) > 0 && (
                  <p className="flex justify-between"><span>Points ({receipt.pointsRedeemed})</span><span>-{formatMoney(receipt.pointsDiscount ?? 0)}</span></p>
                )}
                <p className="flex justify-between text-sm font-bold"><span>Total</span><span>{formatMoney(receipt.total)}</span></p>
                {(receipt.pointsEarned ?? 0) > 0 && (
                  <p className="flex justify-between pt-1 text-brand-600"><span>Award</span><span>+{receipt.pointsEarned} pts</span></p>
                )}
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
