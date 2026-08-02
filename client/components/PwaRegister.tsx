"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("Service worker registration failed", err);
    });
  }, []);

  return null;
}
