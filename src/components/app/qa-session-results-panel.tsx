import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Panel } from "@/components/app/layout-parts";
import { cn } from "@/lib/utils";
import { useQaChecklistItems, type QaSession } from "@/lib/qa-rounds-queries";
import { useTaxonomyCustomAttributes, useTaxonomyEvents } from "@/lib/queries";
import { compactVerdictReason, hasCurrentChecklistResult } from "@/lib/qa-workflow";

type ResultFilter = "all" | "failed" | "not_collected" | "passed";

function verdictBadge(finalStatus: "passed" | "failed" | "not_collected") {
  const map = {
    passed: { label: "통과", bg: "#f2faf5", fg: "#16a34a", border: "#cfe8d8" },
    failed: { label: "오류", bg: "#fdf5f5", fg: "#dc2626", border: "#f4d0d0" },
    not_collected: { label: "미발생", bg: "#fdf9f1", fg: "#b45309", border: "#f0dfc0" },
  } as const;
  const style = map[finalStatus];
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: style.bg, color: style.fg, borderColor: style.border }}
    >
      {style.label}
    </span>
  );
}

export function QaSessionResultsPanel({
  projectId,
  session,
}: {
  projectId: string;
  session: QaSession;
}) {
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const [filter, setFilter] = useState<ResultFilter>("all");

  const rows = checklistItems.filter(hasCurrentChecklistResult).map((item) => ({
    item,
    result: item.qa_checklist_item_results[0],
    finalStatus: item.qa_checklist_item_results[0]?.final_status ?? "not_collected",
  }));
  const filters: Array<{ key: ResultFilter; label: string; count: number }> = [
    { key: "all", label: "전체", count: rows.length },
    {
      key: "failed",
      label: "오류",
      count: rows.filter((row) => row.finalStatus === "failed").length,
    },
    {
      key: "not_collected",
      label: "미발생",
      count: rows.filter((row) => row.finalStatus === "not_collected").length,
    },
    {
      key: "passed",
      label: "통과",
      count: rows.filter((row) => row.finalStatus === "passed").length,
    },
  ];
  const shownRows = filter === "all" ? rows : rows.filter((row) => row.finalStatus === filter);

  function itemLabel(targetType: "event" | "custom_attribute", targetId: string): string {
    const label =
      targetType === "event"
        ? events.find((e) => e.id === targetId)?.technical_name
        : customAttributes.find((a) => a.id === targetId)?.technical_name;
    return label ?? targetId;
  }

  return (
    <Panel
      title="판정 결과"
      description="항목을 눌러 검증 근거를 확인하고 필요한 대상을 이슈로 등록하세요. 상태 변경과 다음 차수 검증은 이슈 모아보기에서 관리합니다."
      actions={
        <div className="flex flex-wrap gap-1 rounded-lg bg-[#f1f4f8] p-[3px]">
          {filters.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs",
                filter === option.key
                  ? "bg-white font-semibold text-[#1c2431] shadow-sm"
                  : "text-[#8b97a8]",
              )}
            >
              {option.label} {option.count}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(240px,360px)_minmax(320px,1fr)_96px_20px] items-center gap-3 border-y border-[#e3e8ef] bg-[#f8fafc] px-[18px] py-2 text-[11.5px] font-semibold text-[#64748b]">
        <span>대상</span>
        <span>판정 요약</span>
        <span className="text-center">결과</span>
        <span />
      </div>
      {shownRows.map(({ item, result, finalStatus }) => {
        const summary =
          result?.ai_reasoning ??
          (finalStatus === "passed"
            ? "택소노미와 검증 규칙에 어긋나는 항목을 찾지 못했어요."
            : "판단 이유가 없어요.");
        const compactSummary = compactVerdictReason(summary);
        return (
          <Link
            key={item.id}
            from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId"
            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
            params={(prev) => ({ ...prev, itemId: item.id })}
            className="grid grid-cols-[minmax(240px,360px)_minmax(320px,1fr)_96px_20px] items-center gap-3 border-b border-[#f1f4f8] px-[18px] py-3 hover:bg-[#f7f9fc]"
          >
            <span className="mono-token truncate text-[13px]">
              {itemLabel(item.target_type, item.target_id)}
            </span>
            <span title={summary} className="line-clamp-2 text-xs leading-[1.55] text-[#475569]">
              {compactSummary}
            </span>
            {verdictBadge(finalStatus)}
            <span className="text-[#c3ccd8]">›</span>
          </Link>
        );
      })}
      {shownRows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          해당 판정 결과가 없어요.
        </p>
      ) : null}
    </Panel>
  );
}
