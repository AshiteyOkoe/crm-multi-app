"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MailCheck, MailX } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ emailVerified: boolean }>(`/auth/verify-email?token=${encodeURIComponent(token)}`, { auth: false })
      .then(() => setStatus("success"))
      .catch((err: any) => {
        setError(err?.message ?? "Verification failed");
        setStatus("error");
      });
  }, [token]);

  if (status === "loading") {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Verifying your email...</div>;
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lift">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
          {status === "success" ? <MailCheck className="h-7 w-7" /> : <MailX className="h-7 w-7" />}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {status === "success" ? "Email verified" : "Verification failed"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {status === "success" ? "Your email address is now verified." : "We couldn't verify this link."}
        </p>
      </div>

      {error && <Alert kind="error" className="mb-4">{error}</Alert>}

      <Button className="w-full" onClick={() => router.replace("/login")}>Continue to sign in</Button>
      <p className="mt-4 text-center text-sm text-gray-500">
        Having trouble?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in and resend</Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading...</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
