import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-surface to-brand-100/60 p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
