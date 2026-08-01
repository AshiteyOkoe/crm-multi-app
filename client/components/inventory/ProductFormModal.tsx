"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import type { Product } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export function ProductFormModal({
  open,
  onClose,
  onSaved,
  product,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  product?: Product | null;
}) {
  const { branches, isAdmin } = useApp();
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    description: "",
    price: "",
    cost: "",
    lowStockThreshold: "5",
  });
  const [stock, setStock] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      category: product?.category ?? "",
      description: product?.description ?? "",
      price: product ? String(product.price) : "",
      cost: product ? String(product.cost) : "",
      lowStockThreshold: String(product?.lowStockThreshold ?? 5),
    });
    const initial: Record<string, string> = {};
    branches.forEach((b) => {
      initial[b.id] = product?.branchStock?.find((s) => s.branchId === b.id)?.quantity?.toString() ?? "";
    });
    setStock(initial);
    setError(null);
  }, [open, product, branches]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    setError(null);
    if (!form.name.trim() || !form.sku.trim()) return setError("Name and SKU are required.");
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        category: form.category.trim() || undefined,
        description: form.description.trim() || undefined,
        price: Number(form.price || 0),
        cost: Number(form.cost || 0),
        lowStockThreshold: Number(form.lowStockThreshold || 0),
      };
      if (isAdmin && !product) {
        payload.stock = Object.entries(stock)
          .map(([branchId, qty]) => ({ branchId, quantity: Number(qty || 0) }))
          .filter((s) => s.quantity > 0);
      }
      await api(product ? `/inventory/products/${product.id}` : "/inventory/products", { method: product ? "PUT" : "POST", body: payload });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Could not save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={product ? "Edit product" : "New product"} wide
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>{product ? "Save changes" : "Create product"}</Button></>}>
      {error && <Alert kind="error" className="mb-4">{error}</Alert>}
      <div className="space-y-4">
        <Field label="Product name" required>
          <Input value={form.name} onChange={set("name")} placeholder='e.g. Samsung 55" TV' />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="SKU" required>
            <Input value={form.sku} onChange={set("sku")} placeholder="e.g. TV-55-SAMS" />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={set("category")} placeholder="e.g. Electronics" />
          </Field>
        </div>
        <Field label="Description">
          <Textarea rows={2} value={form.description} onChange={set("description")} placeholder="Short description of the product..." />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Selling price" required>
            <Input type="number" min="0" step="0.01" value={form.price} onChange={set("price")} placeholder="0.00" />
          </Field>
          <Field label="Cost price" required>
            <Input type="number" min="0" step="0.01" value={form.cost} onChange={set("cost")} placeholder="0.00" />
          </Field>
          <Field label="Low stock alert at" hint="Notified when stock drops to this level">
            <Input type="number" min="0" value={form.lowStockThreshold} onChange={set("lowStockThreshold")} />
          </Field>
        </div>
        {isAdmin && !product && branches.length > 0 && (
          <div>
            <p className="mb-1.5 block text-xs font-medium text-gray-600">Initial stock per branch</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                  <span className="text-sm text-gray-700">{b.name}</span>
                  <input
                    type="number"
                    min="0"
                    value={stock[b.id] ?? ""}
                    onChange={(e) => setStock((s) => ({ ...s, [b.id]: e.target.value }))}
                    placeholder="0"
                    className="h-9 w-20 rounded-lg border border-gray-300 px-2 text-right text-sm"
                  />
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">Leave at 0 to add the product without any stock in that branch.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
