import { useState } from "react";
import { Copy } from "lucide-react";
import { Panel } from "@/components/app/layout-parts";
import { cn } from "@/lib/utils";
import { formatMergedTimelineTime } from "@/lib/domain";
import { resolveEvidenceHighlightTone, type MergedTimelineRow } from "@/lib/qa-workflow";

type EvidenceHighlight = { propertyNames: Set<string>; tone: "pass" | "issue" } | null;

type ItemEvidencePanelProps = {
  evidenceRows: MergedTimelineRow[];
  evidenceIsLong: boolean;
  onCopy: () => void;
  hoveredIssueProperty: string | null;
  evidenceHighlight: EvidenceHighlight;
};

export function ItemEvidencePanel({
  evidenceRows,
  evidenceIsLong,
  onCopy,
  hoveredIssueProperty,
  evidenceHighlight,
}: ItemEvidencePanelProps) {
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  function renderRawJson(row: MergedTimelineRow) {
    const entries = Object.entries(row.raw ?? {});
    if (entries.length === 0) return null;
    return (
      <div className="pl-4">
        <div>{"{"}</div>
        {entries.map(([k, v], i) => {
          const issueHovered = hoveredIssueProperty === k;
          const selected = evidenceHighlight?.propertyNames.has(k) ?? false;
          const highlightTone = resolveEvidenceHighlightTone({
            issueHovered,
            selected,
            selectedTone: evidenceHighlight?.tone,
          });
          return (
            <div key={k} className="pl-4">
              <span
                className={cn(
                  highlightTone === "hover" && "rounded-sm bg-red-400/20 px-0.5",
                  highlightTone === "pass" && "rounded-sm bg-emerald-400/20 px-0.5",
                  highlightTone === "issue" && "rounded-sm bg-amber-300/20 px-0.5",
                )}
              >
                {JSON.stringify(k)}: {JSON.stringify(v)}
              </span>
              {i < entries.length - 1 ? "," : ""}
            </div>
          );
        })}
        <div>{"}"}</div>
      </div>
    );
  }

  function renderSnapshotChange(row: MergedTimelineRow) {
    const highlightTone = resolveEvidenceHighlightTone({
      issueHovered: hoveredIssueProperty === row.name,
      selected: evidenceHighlight?.propertyNames.has(row.name) ?? false,
      selectedTone: evidenceHighlight?.tone,
    });
    return (
      <span
        className={cn(
          "whitespace-pre-wrap",
          highlightTone === "hover" && "rounded-sm bg-red-400/20 px-0.5",
          highlightTone === "pass" && "rounded-sm bg-emerald-400/20 px-0.5",
          highlightTone === "issue" && "rounded-sm bg-amber-300/20 px-0.5",
        )}
      >
        {row.change.replace(/,\s*/g, ",\n")}
      </span>
    );
  }

  return (
    <Panel
      title="근거 로그"
      description="이 항목과 연결된 검증 규칙의 이벤트·어트리뷰트 로그"
      actions={
        <button
          type="button"
          onClick={onCopy}
          disabled={evidenceRows.length === 0}
          className="flex items-center gap-1.5 rounded-md border border-[#dbe2ea] px-2.5 py-1.5 text-xs text-[#64748b] hover:border-[#2b6a9c] hover:text-[#2b6a9c] disabled:opacity-40"
        >
          <Copy className="size-3.5" />
          복사
        </button>
      }
    >
      <div className="relative bg-[#0d1117]">
        <div
          className={cn(evidenceIsLong && !evidenceExpanded ? "max-h-[360px] overflow-hidden" : "")}
        >
          <div className="space-y-1 overflow-x-auto p-4 font-mono text-[12px] leading-[1.7]">
            {evidenceRows.length === 0 ? (
              <p className="text-[#6e7681]">관련된 로그가 없어요.</p>
            ) : (
              evidenceRows.map((row) => (
                <div key={row.key} className="text-[#c9d1d9]">
                  <div className="whitespace-pre">
                    <span>{row.name}</span>
                    <span className="text-[#6e7681]"> | </span>
                    <span className="text-[#7ee787]">
                      {row.source === "snapshot" ? "어트리뷰트" : "이벤트"}
                    </span>
                    <span className="text-[#6e7681]"> | </span>
                    <span className="text-[#6e7681]">
                      {formatMergedTimelineTime(row.source, row.occurredAt)}
                    </span>
                    {row.source === "snapshot" ? (
                      <>
                        <span> </span>
                        {renderSnapshotChange(row)}
                      </>
                    ) : null}
                  </div>
                  {row.source === "event" ? renderRawJson(row) : null}
                </div>
              ))
            )}
          </div>
        </div>
        {evidenceIsLong && !evidenceExpanded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-[#0d1117]" />
        ) : null}
      </div>
      {evidenceIsLong ? (
        <button
          type="button"
          onClick={() => setEvidenceExpanded((e) => !e)}
          className="w-full border-t border-[#202938] bg-[#111821] px-4 py-2 text-center text-xs font-semibold text-[#9fb2c8] hover:text-white"
        >
          {evidenceExpanded
            ? "근거 로그 접기 ↑"
            : `전체 근거 로그 펼치기 (${evidenceRows.length}건) ↓`}
        </button>
      ) : null}
    </Panel>
  );
}
