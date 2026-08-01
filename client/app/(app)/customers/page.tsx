"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { formatMoney, formatNumber } from "@/lib/utils";
import type { Customer, Paginated } from "@/types";
import { PageHeader, SearchInput } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { CustomerFormModal } from "@/components/customers/CustomerFormModal";

const SEGMENT_TONES: Record<string, "violet" | "blue" | "gray" | "green"> = {
  VIP: "violet",
  REGULAR: "blue",
  NEW: "green",
  INACTIVE: "gray",
};

export default function CustomersPage() {
  const { isAdmin, branches } = useApp();
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 350);
  const [segment, setSegment] = useState("");
  const [branchId, setBranchId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<Paginated<Customer>>("/customers", {
        params: { page, pageSize: 20, search: debouncedSearch || undefined, segment: segment || undefined, branchId: branchId || undefined },
      });
      setItems(res.items);
      setTotal(res.total);
      setPages(res.pages);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, segment, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleted = async (id: string) => {
    if (!confirm("Delete this customer? Their purchase history will be removed.")) return;
    await api(`/customers/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <PageHeader
        breadcrumb="CRM"
        title="Customers"
        subtitle="Unified profiles across all branches"
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> Add customer
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, email..." className="sm:w-80" />
          <select value={segment} onChange={(e) => { setSegment(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
            <option value="">All segments</option>
            <option value="VIP">VIP</option>
            <option value="REGULAR">Regular</option>
            <option value="NEW">New</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          {isAdmin && (
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700">
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <span className="ml-auto text-xs text-gray-500">{formatNumber(total)} customers</span>
        </div>

        {loading ? (
          <Spinner label="Loading customers..." />
        ) : items.length === 0 ? (
          <EmptyState title="No customers found" description="Try adjusting your search, or add a new customer." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Segment</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 text-right font-medium">Lifetime value</th>
                  <th className="px-4 py-3 text-right font-medium">Purchases</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="font-semibold text-gray-900 hover:text-brand-600">{c.name}</Link>
                      {c.company && <p className="text-xs text-gray-500">{c.company}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <p>{c.phone ?? "—"}</p>
                      <p className="text-xs text-gray-400">{c.email ?? ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={SEGMENT_TONES[c.segment] ?? "gray"}>{c.segment}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.preferredBranch?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(c.lifetimeValue ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatNumber(c.purchaseCount ?? 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => { setEditing(c); setModalOpen(true); }}
                          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleted(c.id)}
                          className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} onPage={setPage} total={total} />
      </Card>

      <CustomerFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        customer={editing}
      />
    </div>
  );
}
