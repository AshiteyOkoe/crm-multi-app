import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";

type Kind = "success" | "error" | "info" | "warning";

const config: Record<Kind, { icon: typeof Info; classes: string }> = {
  success: { icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  error: { icon: XCircle, classes: "bg-red-50 text-red-700 border-red-200" },
  info: { icon: Info, classes: "bg-blue-50 text-blue-700 border-blue-200" },
  warning: { icon: AlertCircle, classes: "bg-amber-50 text-amber-800 border-amber-200" },
};

export function Alert({ kind = "info", title, children, className }: { kind?: Kind; title?: string; children?: React.ReactNode; className?: string }) {
  const { icon: Icon, classes } = config[kind];
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3 text-sm", classes, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}
