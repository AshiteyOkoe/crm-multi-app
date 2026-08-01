import { cn } from "@/lib/utils";

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "relative -mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            active === tab.key ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800"
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]", active === tab.key ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500")}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
