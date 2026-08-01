"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export default function RegisterPage() {
  const { register, branches } = useApp();
  const router = useRouter();

  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", phone: "", branchId: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    if (!form.branchId) return setError("Please select a branch.");

    setSubmitting(true);
    try {
      const user = await register({ name: form.name, email: form.email, password: form.password, phone: form.phone, branchId: form.branchId });
      router.replace(user.role === "ADMIN" ? "/dashboard" : "/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lift">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
          <Store className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
        <p className="mt-1 text-sm text-gray-500">Join the multi-branch workspace</p>
      </div>

      {error && <Alert kind="error" title="Registration failed" className="mb-4">{error}</Alert>}

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name" required>
          <Input value={form.name} onChange={set("name")} placeholder="Jane Doe" required />
        </Field>
        <Field label="Work email" required>
          <Input type="email" value={form.email} onChange={set("email")} placeholder="you@company.com" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password" required>
            <Input type="password" value={form.password} onChange={set("password")} placeholder="Min 8 characters" required />
          </Field>
          <Field label="Confirm password" required>
            <Input type="password" value={form.confirm} onChange={set("confirm")} placeholder="Repeat password" required />
          </Field>
        </div>
        <Field label="Phone (optional)">
          <Input value={form.phone} onChange={set("phone")} placeholder="+233 ..." />
        </Field>
        <Field label="Assigned branch" required>
          <select className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm" value={form.branchId} onChange={set("branchId")} required>
            <option value="">Select a branch...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </select>
        </Field>
        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
