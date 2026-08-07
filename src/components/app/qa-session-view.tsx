import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { deriveSessionStep, hasCurrentChecklistResult } from "@/lib/qa-workflow";
import { errorMessage } from "@/lib/domain";
import {
  useAnalyzeChecklist,
  useQaAttributeSnapshots,
  useQaChecklistItems,
  useQaChannelExclusions,
  useQaRounds,
  useQaRunEvents,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import {
  useRules,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
} from "@/lib/queries";
import { QaBreadcrumb } from "@/components/app/qa-breadcrumb";
import { QaSessionChecklistPanel } from "@/components/app/qa-session-checklist-panel";
import { QaSessionAnalysisPanel } from "@/components/app/qa-session-analysis-panel";
import { QaSessionResultsPanel } from "@/components/app/qa-session-results-panel";

const STEPS = [
  { n: 1, label: "검증 실행", sub: "택소노미 체크 · 스냅샷" },
  { n: 2, label: "분석", sub: "CSV 대조 · AI 검증" },
  { n: 3, label: "결과", sub: "판정 · 논의 · 처리" },
] as const;

export function QaSessionView({
  wsId,
  projectId,
  stageSlug,
  roundId,
  environmentId,
  session,
}: {
  wsId: string;
  projectId: string;
  stageSlug: string;
  roundId: string;
  environmentId: string;
  session: QaSession;
}) {
  const { data: rounds = [] } = useQaRounds(environmentId);
  const round = rounds.find((r) => r.id === roundId);
  const { data: checklistItems = [], refetch: refetchChecklistItems } = useQaChecklistItems(
    session.id,
  );
  const { data: runEvents = [], refetch: refetchRunEvents } = useQaRunEvents(session.id);
  const { data: snapshots = [], refetch: refetchSnapshots } = useQaAttributeSnapshots(session.id);
  const { data: events = [], refetch: refetchEvents } = useTaxonomyEvents(projectId);
  const { data: eventProperties = [], refetch: refetchEventProperties } =
    useTaxonomyEventProperties(projectId);
  const { data: exclusions, refetch: refetchExclusions } = useQaChannelExclusions(
    events.map((event) => event.id),
    eventProperties.map((property) => property.id),
  );
  const { data: customAttributes = [], refetch: refetchCustomAttributes } =
    useTaxonomyCustomAttributes(projectId);
  const { data: rules = [], refetch: refetchRules } = useRules(projectId);
  const analyze = useAnalyzeChecklist(session.id);
  const executedChecklistItems = checklistItems.filter((item) => item.executed_at);
  const hasResults = executedChecklistItems.some(hasCurrentChecklistResult);
  const currentStep = deriveSessionStep({
    checklistItemCount: checklistItems.length,
    hasRunEvents: runEvents.length > 0,
    hasResults,
  });
  const [viewingStep, setViewingStep] = useState(currentStep);
  const [analysisProgress, setAnalysisProgress] = useState<{ completed: number; total: number }>();
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const cancelAnalysisRef = useRef(false);

  // useState's initializer only runs once, and route params changing doesn't remount this
  // component (same session route, different :sessionId) — so without this effect,
  // switching sessions or a slow first-load query resolving to a higher currentStep would
  // leave viewingStep stuck on a stale value. Follow currentStep forward whenever the
  // session changes, or when currentStep itself advances and the viewer hadn't manually
  // navigated away from it (so intentionally reviewing an earlier completed step doesn't
  // get yanked forward by a background refetch).
  const lastSyncRef = useRef({ sessionId: session.id, currentStep });
  useEffect(() => {
    const last = lastSyncRef.current;
    if (session.id !== last.sessionId) {
      setViewingStep(currentStep);
    } else if (currentStep !== last.currentStep && viewingStep === last.currentStep) {
      setViewingStep(currentStep);
    }
    lastSyncRef.current = { sessionId: session.id, currentStep };
  }, [session.id, currentStep, viewingStep]);

  async function runAnalysis() {
    cancelAnalysisRef.current = false;
    setAnalysisRunning(true);
    try {
      const [
        freshChecklistResult,
        freshRunEventsResult,
        freshSnapshotsResult,
        freshEventsResult,
        freshPropertiesResult,
        freshAttributesResult,
        freshRulesResult,
        freshExclusionsResult,
      ] = await Promise.all([
        refetchChecklistItems(),
        refetchRunEvents(),
        refetchSnapshots(),
        refetchEvents(),
        refetchEventProperties(),
        refetchCustomAttributes(),
        refetchRules(),
        refetchExclusions(),
      ]);
      const freshChecklistItems = freshChecklistResult.data ?? checklistItems;
      if (cancelAnalysisRef.current) {
        toast.info("분석을 멈췄어요");
        return;
      }
      const freshEvents = freshEventsResult.data ?? events;
      const freshProperties = freshPropertiesResult.data ?? eventProperties;
      const freshExclusions = freshExclusionsResult.data ?? exclusions;
      const freshApplicableEvents = session.qa_channel_id
        ? freshEvents.filter(
            (event) => !freshExclusions?.events.has(`${event.id}:${session.qa_channel_id}`),
          )
        : freshEvents;
      const freshApplicableProperties = session.qa_channel_id
        ? freshProperties.filter(
            (property) =>
              !freshExclusions?.properties.has(`${property.id}:${session.qa_channel_id}`),
          )
        : freshProperties;
      const outcome = await analyze.mutateAsync({
        checklistItems: freshChecklistItems.filter((item) => item.executed_at),
        events: freshApplicableEvents,
        eventProperties: freshApplicableProperties,
        customAttributes: freshAttributesResult.data ?? customAttributes,
        rules: freshRulesResult.data ?? rules,
        runEvents: freshRunEventsResult.data ?? runEvents,
        snapshots: freshSnapshotsResult.data ?? snapshots,
        onProgress: (completed, total) => setAnalysisProgress({ completed, total }),
        shouldCancel: () => cancelAnalysisRef.current,
      });
      if (outcome?.cancelled) {
        toast.info(`${outcome.completed}/${outcome.total}개까지 완료하고 분석을 멈췄어요`);
      } else {
        toast.success("판정을 완료했어요");
        setViewingStep(3);
      }
    } catch (error) {
      toast.error(errorMessage(error, "판정에 실패했어요. 다시 시도해주세요."));
    } finally {
      setAnalysisProgress(undefined);
      setAnalysisRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <QaBreadcrumb
        items={[
          {
            label: "개발 QA",
            to: "/w/$wsId/p/$projectId/qa/$stageSlug",
            params: { wsId, projectId, stageSlug },
          },
          {
            label: round?.name?.trim() ? round.name : `${round?.round_number ?? ""}차`,
            to: "/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
            params: { wsId, projectId, stageSlug, roundId },
          },
          { label: session.name },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-bold">{session.name}</h2>
          <p className="mt-1 text-[12.5px] text-[#8b97a8]">
            실행 기록 {checklistItems.filter((item) => item.executed_at).length} · 이벤트 로그{" "}
            {runEvents.length}행
          </p>
        </div>
      </div>

      <div className="my-[18px] grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
        {STEPS.map((step) => {
          const reachable =
            step.n === 1 ||
            (step.n === 2 &&
              (checklistItems.some((item) => item.executed_at) ||
                runEvents.length > 0 ||
                hasResults)) ||
            (step.n === 3 && hasResults);
          const isActive = step.n === viewingStep;
          return (
            <button
              key={step.n}
              type="button"
              disabled={!reachable}
              aria-current={isActive ? "step" : undefined}
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
          onContinue={() => setViewingStep(2)}
        />
      ) : null}
      {viewingStep === 2 ? (
        <QaSessionAnalysisPanel
          projectId={projectId}
          session={session}
          analyzing={analysisRunning}
          analysisProgress={analysisProgress}
          onAnalyze={runAnalysis}
          onCancel={() => {
            cancelAnalysisRef.current = true;
            toast.info("진행 중인 묶음이 끝나면 분석을 멈춥니다");
          }}
        />
      ) : null}
      {viewingStep === 3 ? <QaSessionResultsPanel projectId={projectId} session={session} /> : null}
    </div>
  );
}
