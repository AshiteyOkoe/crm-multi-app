"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password }, auth: false });
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? "Could not reset password");
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
        <h1 className="text-2xl font-bold text-gray-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-gray-500">Set a new password for your account</p>
      </div>

      {error && <Alert kind="error" title="Could not reset" className="mb-4">{error}</Alert>}
      {done && (
        <>
          <Alert kind="success" className="mb-4">Password updated. You can now sign in with your new password.</Alert>
          <Button className="w-full" onClick={() => router.replace("/login")}>Back to sign in</Button>
        </>
      )}

      {!done && (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="New password" required>
            <div className="relative">
              <Input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" required className="pr-10" />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Toggle password">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Confirm password" required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" required />
          </Field>
          <Button type="submit" className="w-full" loading={submitting}>Reset password</Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Back to sign in</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
