import { useState } from "react";
import { Check } from "lucide-react";
import { deriveSessionStep } from "@/lib/qa-workflow";
import { useQaChecklistItems, useQaRunEvents, type QaSession } from "@/lib/qa-rounds-queries";
import { QaSessionChecklistPanel } from "@/components/app/qa-session-checklist-panel";
import { QaSessionCollectionPanel } from "@/components/app/qa-session-collection-panel";
import { QaSessionAnalysisPanel } from "@/components/app/qa-session-analysis-panel";
import { QaSessionResultsPanel } from "@/components/app/qa-session-results-panel";

const STEPS = [
  { n: 1, label: "체크리스트", sub: "무엇을 검증할지 확정" },
  { n: 2, label: "수집", sub: "스냅샷 + 이벤트 CSV" },
  { n: 3, label: "분석", sub: "시간순 병합 · AI 검증" },
  { n: 4, label: "결과", sub: "판단 · 논의 · 처리" },
] as const;

export function QaSessionView({
  projectId,
  environmentId,
  session,
}: {
  projectId: string;
  environmentId: string;
  session: QaSession;
}) {
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const hasResults = checklistItems.some((i) => i.qa_checklist_item_results.length > 0);
  const currentStep = deriveSessionStep({
    checklistItemCount: checklistItems.length,
    endedAt: session.ended_at,
    hasResults,
  });
  const [viewingStep, setViewingStep] = useState(currentStep);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[21px] font-bold">{session.name}</h2>
        <p className="mt-1 text-[12.5px] text-[#8b97a8]">
          체크리스트 {checklistItems.length} · 이벤트 {runEvents.length}행
        </p>
      </div>

      <div className="my-[18px] grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
        {STEPS.map((step) => {
          const reachable = step.n <= currentStep;
          const isActive = step.n === viewingStep;
          return (
            <button
              key={step.n}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && setViewingStep(step.n)}
              className={`rounded-xl border bg-white p-3.5 text-left ${
                isActive ? "border-[#1c2431]" : "border-[#e3e8ef]"
              } ${!reachable ? "cursor-not-allowed opacity-45" : ""}`}
            >
              <span
                className="inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor:
                    step.n < currentStep
                      ? "#e8f5ec"
                      : step.n === currentStep
                        ? "#1c2431"
                        : "#eef1f5",
                  color:
                    step.n < currentStep ? "#16a34a" : step.n === currentStep ? "#fff" : "#94a3b8",
                }}
              >
                {step.n < currentStep ? <Check className="size-3" /> : step.n}
              </span>
              <p className="mt-1.5 text-[13.5px] font-semibold">{step.label}</p>
              <p className="text-[11.5px] text-[#8b97a8]">{step.sub}</p>
            </button>
          );
        })}
      </div>

      {viewingStep === 1 ? (
        <QaSessionChecklistPanel
          projectId={projectId}
          environmentId={environmentId}
          session={session}
        />
      ) : null}
      {viewingStep === 2 ? (
        <QaSessionCollectionPanel projectId={projectId} session={session} />
      ) : null}
      {viewingStep === 3 ? <QaSessionAnalysisPanel session={session} /> : null}
      {viewingStep === 4 ? (
        <QaSessionResultsPanel
          projectId={projectId}
          environmentId={environmentId}
          session={session}
        />
      ) : null}
    </div>
  );
}
