import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useCarryOverItems, useQaChecklistItems, type QaSession } from "@/lib/qa-rounds-queries";
import { useTaxonomyCustomAttributes, useTaxonomyEvents } from "@/lib/queries";

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

function dispositionBadge(disposition: string) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    unresolved: { label: "미처리", bg: "#f1f4f8", fg: "#64748b" },
    passed_override: { label: "통과 처리", bg: "#f2faf5", fg: "#16a34a" },
    carried_over: { label: "다음 차수 이월", bg: "#eef0fb", fg: "#5b5fc7" },
    discussing: { label: "논의 중", bg: "#fdf9f1", fg: "#b45309" },
  };
  const style = map[disposition] ?? map.unresolved;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  );
}

export function QaSessionResultsPanel({
  projectId,
  environmentId,
  session,
}: {
  projectId: string;
  environmentId: string;
  session: QaSession;
}) {
  const { user } = useAuth();
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const carryOver = useCarryOverItems(environmentId);

  function itemLabel(targetType: "event" | "custom_attribute", targetId: string): string {
    const label =
      targetType === "event"
        ? events.find((e) => e.id === targetId)?.technical_name
        : customAttributes.find((a) => a.id === targetId)?.technical_name;
    return label ?? targetId;
  }

  const unresolvedFailures = checklistItems.filter((item) => {
    const finalStatus = item.qa_checklist_item_results[0]?.final_status ?? "not_collected";
    return item.disposition === "unresolved" && finalStatus !== "passed";
  });

  return (
    <Panel
      title="판정 결과"
      description="항목을 누르면 로그 페이지로 이동해 논의·처리할 수 있어요"
      actions={
        unresolvedFailures.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!user || carryOver.isPending}
            onClick={() =>
              user &&
              carryOver.mutate(
                {
                  items: unresolvedFailures.map((i) => ({
                    id: i.id,
                  })),
                  assigneeId: null,
                },
                { onSuccess: () => toast.success("다음 차수로 이월했어요") },
              )
            }
          >
            미해결 {unresolvedFailures.length}건 다음 차수로 이월
          </Button>
        ) : null
      }
    >
      {checklistItems.map((item) => {
        const result = item.qa_checklist_item_results[0];
        const finalStatus = result?.final_status ?? "not_collected";
        return (
          <Link
            key={item.id}
            from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId"
            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
            params={(prev) => ({ ...prev, itemId: item.id })}
            className="grid grid-cols-[minmax(0,1fr)_150px_96px_120px_20px] items-center gap-3 border-b border-[#f1f4f8] px-[18px] py-3 hover:bg-[#f7f9fc]"
          >
            <span className="mono-token truncate text-[13px]">
              {itemLabel(item.target_type, item.target_id)}
            </span>
            <span className="truncate text-xs text-[#64748b]">{result?.ai_reasoning ?? "—"}</span>
            {verdictBadge(finalStatus)}
            {dispositionBadge(item.disposition)}
            <span className="text-[#c3ccd8]">›</span>
          </Link>
        );
      })}
    </Panel>
  );
}
