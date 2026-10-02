import { cn } from "@/lib/utils";
import type { ItemStatus, Severity } from "@/lib/domain";
import { ITEM_STATUS_LABEL, SEVERITY_LABEL } from "@/lib/domain";

const base = "status-badge border border-transparent";

export function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    critical: "text-[#D92727] bg-[#FDE8EA]",
    warning: "text-[#C65F00] bg-[#FFF0D9]",
    info: "text-[#1B64DA] bg-[#E8F3FF]",
  };
  return <span className={cn(base, styles[severity])}>{SEVERITY_LABEL[severity]}</span>;
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const styles: Record<ItemStatus, string> = {
    not_started: "bg-draft text-draft-foreground",
    verified: "bg-published text-published-foreground",
    failed: "text-[#D92727] bg-[#FDE8EA]",
    blocked: "bg-deprecated text-deprecated-foreground",
  };
  return <span className={cn(base, styles[status])}>{ITEM_STATUS_LABEL[status]}</span>;
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(base, "border-border bg-surface-strong text-muted-foreground", className)}>
      {children}
    </span>
  );
}
