"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pos } from "@/components/sales/Pos";
import { SalesHistory } from "@/components/sales/History";
import { ReturnsTab } from "@/components/sales/ReturnsTab";

export default function SalesPage() {
  const { isManager } = useApp();
  const [tab, setTab] = useState("pos");

  const tabs = [
    { key: "pos", label: "New sale" },
    { key: "history", label: "Sales history" },
    { key: "returns", label: "Returns" },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb="Operations"
        title="Sales & POS"
        subtitle="Log transactions, manage refunds, and track receipts"
        actions={<ShoppingCart className="hidden text-brand-500 sm:block" />}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="pt-5">
        {tab === "pos" && <Pos />}
        {tab === "history" && <SalesHistory />}
        {tab === "returns" && <ReturnsTab />}
      </div>
    </div>
  );
}
