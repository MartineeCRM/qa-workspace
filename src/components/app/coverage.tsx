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
  const reviewed = verified + failed;
  const ratio = total === 0 ? 0 : verified / total;
  const failRatio = total === 0 ? 0 : failed / total;
  const progressRatio = total === 0 ? 0 : reviewed / total;
  const passRatio = reviewed === 0 ? 0 : verified / reviewed;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="mono-token">
          검증 {reviewed} / {total}
        </span>
        <span className="text-right font-semibold">
          검증 진행률 {formatPercent(progressRatio)} · 통과율 {formatPercent(passRatio)}
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-primary" style={{ width: `${ratio * 100}%` }} />
        <div className="bg-destructive/70" style={{ width: `${failRatio * 100}%` }} />
      </div>
    </div>
  );
}
