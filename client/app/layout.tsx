import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProvider } from "@/context/AppContext";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM — Multi-Branch Operations",
  description: "Customer relationship & operations management for retail businesses with multiple branches",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BranchCRM",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e46f5",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <AppProvider>{children}</AppProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
