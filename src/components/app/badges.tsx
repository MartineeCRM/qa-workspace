import { cn } from "@/lib/utils";
import type { ItemStatus, Severity } from "@/lib/domain";
import { ITEM_STATUS_LABEL, SEVERITY_LABEL } from "@/lib/domain";

const base =
  "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    critical: "border-destructive/30 text-destructive bg-destructive/10",
    warning: "border-warning/30 text-warning bg-warning/10",
    info: "border-primary/30 text-primary bg-primary/10",
  };
  return <span className={cn(base, styles[severity])}>{SEVERITY_LABEL[severity]}</span>;
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const styles: Record<ItemStatus, string> = {
    not_started: "bg-draft text-draft-foreground border-draft-foreground/25",
    verified: "bg-published text-published-foreground border-published-foreground/25",
    failed: "border-destructive/30 text-destructive bg-destructive/10",
    blocked: "bg-deprecated text-deprecated-foreground border-deprecated-foreground/25",
  };
  return <span className={cn(base, styles[status])}>{ITEM_STATUS_LABEL[status]}</span>;
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn(base, "border-border bg-surface-strong text-muted-foreground")}>
      {children}
    </span>
  );
}
