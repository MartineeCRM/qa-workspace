import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/domain";

export function CoverageBar({
  verified,
  total,
  failed = 0,
  className,
}: {
  verified: number;
  total: number;
  failed?: number;
  className?: string;
}) {
  const ratio = total === 0 ? 0 : verified / total;
  const failRatio = total === 0 ? 0 : failed / total;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="mono-token">
          {verified} / {total}
        </span>
        <span className="font-semibold">{formatPercent(ratio)}</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-primary" style={{ width: `${ratio * 100}%` }} />
        <div className="bg-destructive/70" style={{ width: `${failRatio * 100}%` }} />
      </div>
    </div>
  );
}
