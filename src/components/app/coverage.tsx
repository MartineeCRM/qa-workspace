import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPercent } from "@/lib/domain";
import { cn } from "@/lib/utils";

const coverageGrid =
  "md:grid md:grid-cols-[150px_minmax(180px,1fr)_86px_86px] md:items-center md:gap-4";

export function CoverageLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <LegendItem className="bg-primary">통과</LegendItem>
      <LegendItem className="bg-destructive">이슈 있음</LegendItem>
      <LegendItem className="bg-deprecated">미검증</LegendItem>
    </div>
  );
}

function LegendItem({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn("size-2 rounded-[2px]", className)} />
      {children}
    </span>
  );
}

export function CoverageTableHeader() {
  return (
    <div
      className={cn(
        coverageGrid,
        "hidden border-b bg-surface-strong px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase md:grid",
      )}
      role="row"
    >
      <span role="columnheader">환경</span>
      <span role="columnheader">검증 결과 분포</span>
      <span className="text-right" role="columnheader">
        진행률
      </span>
      <span className="text-right" role="columnheader">
        통과율
      </span>
    </div>
  );
}

export function CoverageRow({
  label,
  verified,
  failed,
  total,
  aggregate = false,
}: {
  label: ReactNode;
  verified: number;
  failed: number;
  total: number;
  aggregate?: boolean;
}) {
  const reviewed = verified + failed;
  const notReviewed = Math.max(0, total - reviewed);
  const passRatio = total === 0 ? 0 : verified / total;
  const issueRatio = total === 0 ? 0 : failed / total;
  const progressRatio = total === 0 ? 0 : reviewed / total;
  const muted = reviewed === 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          coverageGrid,
          "space-y-3 border-b px-4 py-3 last:border-b-0 md:space-y-0",
          aggregate && "bg-surface",
        )}
        role="row"
      >
        <div
          className={cn(
            "flex min-w-0 items-baseline gap-2",
            !aggregate && "md:pl-3.5",
            aggregate ? "font-semibold" : "font-medium",
          )}
          role="cell"
        >
          <span
            className={cn(
              "min-w-0 truncate text-sm",
              muted && !aggregate && "text-muted-foreground",
            )}
          >
            {label}
          </span>
          <span className="mono-token shrink-0 text-muted-foreground">{total}</span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex w-full overflow-hidden rounded-sm bg-deprecated",
                aggregate ? "h-2.5" : "h-2",
              )}
              aria-label={`통과 ${verified}, 이슈 ${failed}, 미검증 ${notReviewed}`}
              role="img"
            >
              <span className="bg-primary" style={{ width: `${passRatio * 100}%` }} />
              <span className="bg-destructive" style={{ width: `${issueRatio * 100}%` }} />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            통과 {verified} · 이슈 {failed} · 미검증 {notReviewed}
          </TooltipContent>
        </Tooltip>

        <Metric
          label="진행률"
          value={formatPercent(progressRatio)}
          tooltip={`검증 ${reviewed} / 전체 ${total}`}
          muted={muted}
          aggregate={aggregate}
        />
        <Metric
          label="통과율"
          value={formatPercent(passRatio)}
          tooltip={`통과 ${verified} / 전체 ${total}`}
          muted={muted}
          aggregate={aggregate}
          primary
        />
      </div>
    </TooltipProvider>
  );
}

function Metric({
  label,
  value,
  tooltip,
  muted,
  aggregate,
  primary = false,
}: {
  label: string;
  value: string;
  tooltip: string;
  muted: boolean;
  aggregate: boolean;
  primary?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-baseline justify-between gap-3 tabular-nums md:block md:text-right",
            aggregate ? "text-base font-bold" : "text-sm font-semibold",
            muted ? "text-muted-foreground" : primary && "text-primary",
          )}
          role="cell"
        >
          <span className="text-xs font-medium text-muted-foreground md:hidden">{label}</span>
          <span>{value}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
