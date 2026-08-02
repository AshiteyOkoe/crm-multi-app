"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email }, auth: false });
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Could not send reset link");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lift">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
          <KeyRound className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
        <p className="mt-1 text-sm text-gray-500">Enter your email and we'll send you a reset link</p>
      </div>

      {error && <Alert kind="error" title="Something went wrong" className="mb-4">{error}</Alert>}
      {sent && (
        <Alert kind="success" className="mb-4">
          If an account exists for <b>{email}</b>, a password reset link has been sent. Check your inbox.
        </Alert>
      )}

      {!sent && (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
          </Field>
          <Button type="submit" className="w-full" loading={submitting}>Send reset link</Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Back to sign in</Link>
      </p>
    </div>
  );
}
