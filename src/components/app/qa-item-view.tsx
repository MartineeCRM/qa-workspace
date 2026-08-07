import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Copy, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { QaItemSpecDiffTable, SpecHierarchyLabel } from "@/components/app/qa-item-spec-diff";
import { QaIssueDeleteButton } from "@/components/app/qa-issue-delete-button";
import { TaxonomyAttributeDialog } from "@/components/app/taxonomy-tab";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { errorMessage, formatDateTime, formatMergedTimelineTime } from "@/lib/domain";
import { normalizeFlatAttributeArrays } from "@/lib/checklist-judge";
import {
  aiFailedTaxonomyPropertyIds,
  buildEventSpecDiffRows,
  buildMergedTimeline,
  compressRoundHistory,
  hasCurrentChecklistResult,
  nextChecklistItemId,
  previousChecklistItemId,
  relatedRuleEvidenceTargets,
  resolveEvidenceHighlightTone,
  type MergedTimelineRow,
} from "@/lib/qa-workflow";
import {
  useAddDiscussionComment,
  useAnalyzeChecklist,
  useChecklistItemRoundHistory,
  useCreateQaIssue,
  useDeleteQaIssue,
  useQaAttributeSnapshots,
  useQaChannelExclusions,
  useQaChannels,
  useQaChecklistItems,
  useQaDiscussions,
  useQaRunEvents,
  useUpdateDiscussionComment,
  type QaChecklistItemWithDisposition,
  type QaChecklistItemResult,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import {
  useRules,
  useProject,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
  type TaxonomyCustomAttribute,
  type TaxonomyEventProperty,
} from "@/lib/queries";

const VERDICT_STYLE = {
  passed: { border: "#cfe8d8", bg: "#f2faf5", fg: "#16a34a" },
  failed: { border: "#f4d0d0", bg: "#fdf5f5", fg: "#dc2626" },
  not_collected: { border: "#f0dfc0", bg: "#fdf9f1", fg: "#b45309" },
} as const;

type RuleCounts = {
  required: number;
  undefined: number;
  type: number;
  format: number;
  aiPending: number;
  passed: number;
};

function extractAiSummary(evidence: unknown): string | null {
  if (
    evidence &&
    typeof evidence === "object" &&
    !Array.isArray(evidence) &&
    typeof (evidence as { qualitative_error?: unknown }).qualitative_error === "string"
  ) {
    return (evidence as { qualitative_error: string }).qualitative_error;
  }
  const historicalWarnings =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? (evidence as { historical_warnings?: unknown }).historical_warnings
      : null;
  const warningLines = Array.isArray(historicalWarnings)
    ? historicalWarnings
        .map((warning) =>
          warning && typeof warning === "object"
            ? (warning as { message?: unknown }).message
            : null,
        )
        .filter((message): message is string => typeof message === "string")
    : [];
  const nested =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? (evidence as { qualitative?: unknown }).qualitative
      : evidence;
  if (!Array.isArray(nested)) return warningLines.length > 0 ? warningLines.join(" ") : null;
  const lines = nested
    .filter(
      (entry): entry is { verdict: string; reasoning: string } =>
        Boolean(entry) &&
        typeof entry === "object" &&
        (entry as { verdict?: unknown }).verdict === "failed" &&
        typeof (entry as { reasoning?: unknown }).reasoning === "string",
    )
    .map((entry) => entry.reasoning.trim())
    .filter(Boolean);
  const summaries = [...lines, ...warningLines];
  return summaries.length > 0 ? summaries.join(" ") : null;
}

function extractAiRawResponse(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const record = evidence as { raw_response?: unknown; qualitative?: unknown };
  if (typeof record.raw_response === "string") return record.raw_response;
  return extractAiRawResponse(record.qualitative);
}

function AiSummaryText({ text }: { text: string }) {
  const sentences = text.split(/(?<=\.)\s+/).filter(Boolean);
  return (
    <div className="mt-3 space-y-1 text-pretty text-[13px] leading-[1.7] text-[#3c4757]">
      {sentences.map((sentence, sentenceIndex) => (
        <p key={sentenceIndex}>
          {sentence.split(/(`[^`]+`)/g).map((part, partIndex) =>
            part.startsWith("`") && part.endsWith("`") ? (
              <code key={partIndex} className="font-mono text-[12.5px]">
                {part.slice(1, -1)}
              </code>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </div>
  );
}

function formatAttributeExample(value: unknown, dataType: string): string {
  if (Array.isArray(value)) return JSON.stringify(value, null, 2);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!dataType.startsWith("array")) return text;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return JSON.stringify(parsed, null, 2);
  } catch {
    // Comma-separated taxonomy examples are valid even when they are not JSON.
  }
  return text.replace(/,\s*/g, ",\n");
}

export function QaItemView({
  projectId,
  session,
  item,
  result,
}: {
  projectId: string;
  environmentId: string;
  session: QaSession;
  item: QaChecklistItemWithDisposition;
  result: QaChecklistItemResult | undefined;
}) {
  const { data: project } = useProject(projectId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [], refetch: refetchCustomAttributes } =
    useTaxonomyCustomAttributes(projectId);
  const { data: eventProperties = [], refetch: refetchEventProperties } =
    useTaxonomyEventProperties(projectId);
  const { data: channels = [] } = useQaChannels(projectId);
  const { data: exclusions } = useQaChannelExclusions(
    events.map((event) => event.id),
    eventProperties.map((property) => property.id),
  );
  const { data: rules = [] } = useRules(projectId);
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const { data: snapshots = [] } = useQaAttributeSnapshots(session.id);
  const { data: history = [] } = useChecklistItemRoundHistory(item.id);
  const { data: discussions = [] } = useQaDiscussions(result?.id ?? "");
  const createIssue = useCreateQaIssue(result?.id ?? "", user?.id);
  const deleteIssue = useDeleteQaIssue(projectId, result?.id);
  const addComment = useAddDiscussionComment(result?.id ?? "");
  const updateComment = useUpdateDiscussionComment();
  const analyze = useAnalyzeChecklist(session.id);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [openRounds, setOpenRounds] = useState<Record<number, boolean>>({});
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [evidenceHighlight, setEvidenceHighlight] = useState<{
    propertyNames: Set<string>;
    tone: "pass" | "issue";
  } | null>(null);
  const [hoveredIssueProperty, setHoveredIssueProperty] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<{ id: string; body: string } | null>(null);
  const [taxonomyDialog, setTaxonomyDialog] = useState<{
    attribute: TaxonomyEventProperty | TaxonomyCustomAttribute;
    eventId: string | null;
  } | null>(null);

  // "이전/다음 항목" links only change the :itemId path param, so this component
  // doesn't remount between items.
  useEffect(() => {
    setEvidenceExpanded(false);
    setSelectedIssueId(null);
    setCommentBody("");
    setEvidenceHighlight(null);
    setHoveredIssueProperty(null);
    setEditingComment(null);
    setTaxonomyDialog(null);
  }, [item.id]);

  const label =
    item.target_type === "event"
      ? events.find((e) => e.id === item.target_id)?.technical_name
      : customAttributes.find((a) => a.id === item.target_id)?.technical_name;
  const currentAttribute =
    item.target_type === "custom_attribute"
      ? customAttributes.find((attribute) => attribute.id === item.target_id)
      : undefined;
  const finalStatus = result?.final_status ?? "not_collected";
  const verdictStyle = VERDICT_STYLE[finalStatus];
  const verdictLabel =
    finalStatus === "passed" ? "통과" : finalStatus === "failed" ? "오류" : "미발생";
  const selectedIssue =
    discussions.find((discussion) => discussion.id === selectedIssueId) ?? discussions[0] ?? null;

  function discussionDisplayLabel(discussion: (typeof discussions)[number]) {
    if (discussion.target_type === "custom_attribute") return discussion.target_label;
    if (discussion.target_type === "event") return `${label} · 이벤트 전체`;
    return `${label}.${discussion.target_label}`;
  }

  const normalizedSnapshots = normalizeFlatAttributeArrays(snapshots, customAttributes);
  const timeline = buildMergedTimeline(runEvents, normalizedSnapshots);
  const latestAttributeValue = currentAttribute
    ? [...normalizedSnapshots]
        .filter(
          (snapshot) =>
            snapshot.status === "captured" &&
            snapshot.captured_at &&
            currentAttribute.technical_name in (snapshot.payload ?? {}),
        )
        .sort((a, b) => (b.captured_at ?? "").localeCompare(a.captured_at ?? ""))[0]?.payload?.[
        currentAttribute.technical_name
      ]
    : undefined;
  const evidenceTargets = relatedRuleEvidenceTargets({
    itemTargetType: item.target_type,
    itemTargetId: item.target_id,
    eventProperties,
    rules,
  });
  const relevantEventIds = new Set(
    evidenceTargets
      .filter((target) => target.targetType === "event")
      .map((target) => target.targetId),
  );
  const relevantAttributeNames = new Set(
    evidenceTargets
      .filter((target) => target.targetType === "custom_attribute")
      .map(
        (target) =>
          customAttributes.find((attribute) => attribute.id === target.targetId)?.technical_name,
      )
      .filter((name): name is string => Boolean(name)),
  );
  const relevantKeys = new Set([
    ...runEvents
      .filter((event) => event.event_id && relevantEventIds.has(event.event_id))
      .map((event) => `event:${event.id}`),
    ...timeline
      .filter((row) => row.source === "snapshot" && relevantAttributeNames.has(row.name))
      .map((row) => row.key),
  ]);
  const evidenceRows = timeline.filter((row) => relevantKeys.has(row.key)).reverse();
  const aiFailedPropertyIds = aiFailedTaxonomyPropertyIds(result?.ai_evidence);
  const aiAnalysisIncomplete = Boolean(
    (result?.ai_evidence &&
      typeof result.ai_evidence === "object" &&
      !Array.isArray(result.ai_evidence) &&
      (result.ai_evidence as { qualitative_error?: unknown }).qualitative_error) ||
    (result?.judged_by === "ai" && result.final_status === "not_collected" && result.ai_reasoning),
  );
  const attributeAiPending = Boolean(
    currentAttribute &&
    latestAttributeValue !== undefined &&
    aiAnalysisIncomplete &&
    (currentAttribute.description?.trim() || currentAttribute.example_value != null),
  );
  const displayedVerdictLabel = attributeAiPending ? "AI 확인 필요" : verdictLabel;
  const displayedVerdictStyle = attributeAiPending
    ? { border: "#c9ddee", bg: "#e8f1f8", fg: "#2b6a9c" }
    : verdictStyle;
  const evidenceIsLong =
    evidenceRows.length > 6 ||
    evidenceRows.reduce(
      (length, row) => length + JSON.stringify(row.raw ?? row.change ?? "").length,
      0,
    ) > 3_000;
  const thisEventProperties =
    item.target_type === "event"
      ? eventProperties.filter(
          (property) =>
            property.event_id === item.target_id &&
            (!session.qa_channel_id ||
              !exclusions?.properties.has(`${property.id}:${session.qa_channel_id}`)),
        )
      : [];
  const aiPendingPropertyIds = aiAnalysisIncomplete
    ? new Set(
        thisEventProperties
          .filter(
            (property) => Boolean(property.description?.trim()) || property.example_value != null,
          )
          .map((property) => property.id),
      )
    : undefined;
  // Newest-first: buildEventSpecDiffRows uses this as the representative sample
  // value shown per property, and the most recent occurrence is the most
  // relevant one to show.
  const matchedRawPropertiesList =
    item.target_type === "event"
      ? [...runEvents]
          .filter((e) => e.event_id === item.target_id)
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
          .map((e) => e.raw_properties)
      : [];
  const summaryDiffRows =
    item.target_type === "event"
      ? buildEventSpecDiffRows({
          properties: thisEventProperties.map((property) => ({
            id: property.id,
            technical_name: property.technical_name,
            data_type: property.data_type,
            is_required: property.is_required,
            allowed_values: Array.isArray(property.allowed_values)
              ? (property.allowed_values as string[])
              : null,
            example_value: property.example_value,
          })),
          rawPropertiesList: matchedRawPropertiesList,
          aiFailedPropertyIds,
          aiPendingPropertyIds,
        })
      : [];
  const ruleCounts: RuleCounts = {
    required: summaryDiffRows.filter((row) => row.verdict === "missing_required").length,
    undefined: summaryDiffRows.filter((row) => row.verdict === "undefined_property").length,
    type: summaryDiffRows.filter((row) => row.verdict === "type_mismatch").length,
    format: summaryDiffRows.filter(
      (row) => row.verdict === "value_mismatch" || row.verdict === "semantic_mismatch",
    ).length,
    aiPending: summaryDiffRows.filter((row) => row.verdict === "ai_pending").length,
    passed:
      item.target_type === "event"
        ? summaryDiffRows.filter((row) => row.verdict === "pass").length
        : finalStatus === "passed"
          ? 1
          : 0,
  };
  if (item.target_type === "custom_attribute" && finalStatus === "failed") {
    const structural =
      result?.ai_evidence &&
      typeof result.ai_evidence === "object" &&
      !Array.isArray(result.ai_evidence)
        ? (result.ai_evidence as { structural?: unknown }).structural
        : null;
    const reasons = Array.isArray(structural)
      ? structural
          .map((entry) =>
            entry && typeof entry === "object" ? (entry as { reason?: unknown }).reason : null,
          )
          .filter((reason): reason is string => typeof reason === "string")
      : [];
    ruleCounts.type = reasons.filter((reason) => reason.startsWith("타입이 ")).length;
    ruleCounts.format = Math.max(0, reasons.length - ruleCounts.type);
  }
  const aiSummary =
    extractAiSummary(result?.ai_evidence) ??
    (result?.judged_by === "ai" && result.ai_evidence == null ? result.ai_reasoning : null);
  const aiRawResponse = extractAiRawResponse(result?.ai_evidence);
  const compressedHistory = compressRoundHistory(
    history,
    new Map(eventProperties.map((property) => [property.id, property.technical_name])),
  );

  const resultItems = checklistItems.filter(hasCurrentChecklistResult);
  const orderedIds = resultItems.map((i) => i.id);

  function checklistItemLabel(checklistItem: (typeof resultItems)[number]): string {
    return (
      (checklistItem.target_type === "event"
        ? events.find((event) => event.id === checklistItem.target_id)?.technical_name
        : customAttributes.find((attribute) => attribute.id === checklistItem.target_id)
            ?.technical_name) ?? checklistItem.target_id
    );
  }

  function copyEvidenceLog() {
    const text = evidenceRows
      .map((row) => {
        const header = `${row.name} | ${row.source === "snapshot" ? "어트리뷰트" : "이벤트"} | ${formatMergedTimelineTime(row.source, row.occurredAt)}`;
        if (row.source === "event") return `${header}\n${JSON.stringify(row.raw ?? {}, null, 2)}`;
        return `${header} ${row.change}`;
      })
      .join("\n\n");
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("근거 로그를 클립보드에 복사했어요"))
      .catch(() => toast.error("복사에 실패했어요"));
  }

  // Renders raw_properties as literal JSON (quotes intact) rather than a flattened
  // "key=value" summary — collapsing everything through String() would make a
  // JSON string "true" and a JSON boolean true look identical, hiding exactly the
  // kind of type mismatch this log exists to surface.
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

  async function reanalyzeAfterTaxonomyChange() {
    const refreshed = await refetchEventProperties();
    const refreshedProperties = refreshed.data ?? eventProperties;
    await analyze.mutateAsync({
      checklistItems,
      events: session.qa_channel_id
        ? events.filter((event) => !exclusions?.events.has(`${event.id}:${session.qa_channel_id}`))
        : events,
      eventProperties: session.qa_channel_id
        ? refreshedProperties.filter(
            (property) => !exclusions?.properties.has(`${property.id}:${session.qa_channel_id}`),
          )
        : refreshedProperties,
      customAttributes,
      rules,
      runEvents,
      snapshots: normalizedSnapshots,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mono-token text-xl font-bold">{label ?? item.target_id}</h2>
          <p className="mt-1 text-[12.5px] text-[#8b97a8]">
            {item.target_type === "event" ? "이벤트" : "어트리뷰트"} · 마지막 판정{" "}
            {result ? formatDateTime(result.updated_at) : "없음"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="판정 결과 항목 선택"
            value={item.id}
            onChange={(event) =>
              navigate({
                to: "/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId",
                params: (prev) => ({ ...prev, itemId: event.target.value }),
              })
            }
            className="h-9 max-w-[280px] rounded-md border border-[#dfe5ec] bg-white px-3 text-sm outline-none focus:border-[#2b6a9c] focus:ring-2 focus:ring-[#2b6a9c]/15"
          >
            {resultItems.map((resultItem) => (
              <option key={resultItem.id} value={resultItem.id}>
                {checklistItemLabel(resultItem)} ·{" "}
                {resultItem.target_type === "event" ? "이벤트" : "어트리뷰트"}
              </option>
            ))}
          </select>
          <Link
            from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
            params={(prev) => ({
              ...prev,
              itemId: previousChecklistItemId(orderedIds, item.id),
            })}
            className="rounded-md border px-3 py-1.5 text-center text-sm hover:border-[#2b6a9c]"
          >
            ← 이전 항목
          </Link>
          <Link
            from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
            params={(prev) => ({ ...prev, itemId: nextChecklistItemId(orderedIds, item.id) })}
            className="rounded-md border px-3 py-1.5 text-center text-sm hover:border-[#2b6a9c]"
          >
            다음 항목 →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_660px] space-y-4">
          <Panel
            className="overflow-hidden"
            title={
              <span className="flex items-center gap-2.5">
                <span>판정 요약</span>
                <span
                  className="rounded-full px-2.5 py-[3px] text-[11px] font-bold"
                  style={{
                    color: displayedVerdictStyle.fg,
                    backgroundColor: displayedVerdictStyle.bg,
                  }}
                >
                  {displayedVerdictLabel}
                </span>
              </span>
            }
          >
            <div className="@container grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))]">
              <div className="border-b px-5 pb-[18px] pt-4 @[720px]:border-b-0 @[720px]:border-r">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-[2px] bg-[#8b97a8]" />
                  <h4 className="text-[12.5px] font-bold">Rule based 분석</h4>
                </div>
                <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    { label: "필수 누락", value: ruleCounts.required, color: "#dc2626" },
                    { label: "미정의", value: ruleCounts.undefined, color: "#b45309" },
                    { label: "타입", value: ruleCounts.type, color: "#dc2626" },
                    { label: "값 형식", value: ruleCounts.format, color: "#dc2626" },
                    { label: "AI 확인 필요", value: ruleCounts.aiPending, color: "#2b6a9c" },
                    { label: "통과", value: ruleCounts.passed, color: "#16a34a" },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <p className="whitespace-nowrap text-[11.5px] text-[#8b97a8]">{stat.label}</p>
                      <p
                        className="mt-0.5 text-[21px] font-bold tabular-nums"
                        style={{ color: stat.value === 0 ? "#c3ccd8" : stat.color }}
                      >
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-5 pb-[18px] pt-4">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#b45309]" />
                  <h4 className="text-[12.5px] font-bold">AI 분석</h4>
                </div>
                {aiSummary ? (
                  <>
                    <AiSummaryText text={aiSummary} />
                    {aiRawResponse ? (
                      <details className="mt-3 rounded-lg border border-[#dbe2ea] bg-[#f8fafc]">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[#64748b]">
                          AI 원문 보기
                        </summary>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all border-t border-[#dbe2ea] p-3 text-[11.5px] leading-5 text-[#475569]">
                          {aiRawResponse}
                        </pre>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-3 text-[13px] leading-[1.7] text-[#a3adbb]">추가 분석 없음</p>
                )}
              </div>
            </div>
          </Panel>

          <Panel
            title="근거 로그"
            description="이 항목과 연결된 검증 규칙의 이벤트·어트리뷰트 로그"
            actions={
              <button
                type="button"
                onClick={copyEvidenceLog}
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
                className={cn(
                  evidenceIsLong && !evidenceExpanded ? "max-h-[360px] overflow-hidden" : "",
                )}
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
                onClick={() => setEvidenceExpanded((expanded) => !expanded)}
                className="w-full border-t border-[#202938] bg-[#111821] px-4 py-2 text-center text-xs font-semibold text-[#9fb2c8] hover:text-white"
              >
                {evidenceExpanded
                  ? "근거 로그 접기 ↑"
                  : `전체 근거 로그 펼치기 (${evidenceRows.length}건) ↓`}
              </button>
            ) : null}
          </Panel>

          {item.target_type === "event" ? (
            <QaItemSpecDiffTable
              projectId={projectId}
              eventId={item.target_id}
              eventName={label ?? item.target_id}
              eventDescription={
                events.find((event) => event.id === item.target_id)?.description ?? null
              }
              eventVerdict={finalStatus}
              properties={thisEventProperties}
              rawPropertiesList={matchedRawPropertiesList}
              aiFailedPropertyIds={aiFailedPropertyIds}
              aiPendingPropertyIds={aiPendingPropertyIds}
              onReanalyze={reanalyzeAfterTaxonomyChange}
              onHighlightChange={(propertyNames, tone) =>
                setEvidenceHighlight(tone ? { propertyNames: new Set(propertyNames), tone } : null)
              }
              onCreateIssue={({ id, label: propertyLabel }) => {
                if (!result) return toast.error("분석 결과가 있어야 이슈로 등록할 수 있어요");
                createIssue.mutate(
                  { type: "property", id, label: propertyLabel },
                  {
                    onSuccess: (issue) => {
                      setSelectedIssueId(issue.id);
                      setCommentBody("");
                      toast.success(`${label}.${propertyLabel} 이슈를 추가했어요`);
                    },
                  },
                );
              }}
              onCreateEventIssue={() => {
                if (!result) return toast.error("분석 결과가 있어야 이슈로 등록할 수 있어요");
                createIssue.mutate(
                  { type: "event", id: item.target_id, label: "이벤트 전체" },
                  {
                    onSuccess: (issue) => {
                      setSelectedIssueId(issue.id);
                      setCommentBody("");
                      toast.success(`${label} 이벤트 전체 이슈를 추가했어요`);
                    },
                  },
                );
              }}
              onEditEvent={() =>
                navigate({
                  to: "/w/$wsId/p/$projectId/taxonomy",
                  params: (prev) => ({ wsId: prev.wsId, projectId: prev.projectId }),
                })
              }
              onEditProperty={(propertyId) => {
                const property = eventProperties.find((candidate) => candidate.id === propertyId);
                if (property) {
                  setTaxonomyDialog({ attribute: property, eventId: property.event_id });
                }
              }}
            />
          ) : currentAttribute ? (
            <Panel title="스펙 대조" description="스냅샷 수신 값과 어트리뷰트 정의를 비교해요.">
              <div className="overflow-x-auto">
                <div className="border-b border-[#dbe2ea] bg-white">
                  <SpecHierarchyLabel>상위 검증 대상 · 어트리뷰트</SpecHierarchyLabel>
                  <div className="grid min-w-[760px] grid-cols-[minmax(140px,1fr)_minmax(150px,1fr)_minmax(160px,1.1fr)_minmax(68px,0.5fr)_minmax(125px,0.65fr)] items-start gap-4 border-l-[3px] border-l-[#6f9aba] bg-[#f7fafc] py-3 pr-4 pl-[13px]">
                    <div className="self-center">
                      <code className="mono-token break-all text-[13px] font-bold text-[#334155]">
                        {currentAttribute.technical_name}
                      </code>
                      <p className="mt-1 text-[11px] text-[#8b97a8]">어트리뷰트 전체</p>
                    </div>
                    <div className="min-w-0">
                      <code className="rounded-md bg-[#f1f4f8] px-1.5 py-0.5 font-mono text-[12.5px] text-[#64748b]">
                        {latestAttributeValue === null
                          ? "null"
                          : Array.isArray(latestAttributeValue)
                            ? "array"
                            : typeof latestAttributeValue}
                      </code>
                      <p
                        className={cn(
                          "mt-1 break-words whitespace-pre-wrap text-[12.5px] leading-[1.45]",
                          finalStatus === "failed" ? "font-bold text-[#dc2626]" : "text-[#64748b]",
                        )}
                      >
                        {latestAttributeValue === undefined
                          ? "수신 값 없음"
                          : `수신 값: ${JSON.stringify(
                              latestAttributeValue,
                              null,
                              Array.isArray(latestAttributeValue) ? 2 : undefined,
                            )}`}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <code className="rounded-md bg-[#f1f4f8] px-1.5 py-0.5 font-mono text-[12.5px] text-[#64748b]">
                        {currentAttribute.data_type}
                      </code>
                      <p className="mt-1 break-words whitespace-pre-wrap text-[12.5px] leading-[1.45] text-[#64748b]">
                        {currentAttribute.example_value != null
                          ? `예: ${formatAttributeExample(
                              currentAttribute.example_value,
                              currentAttribute.data_type,
                            )}`
                          : "예시값 없음"}
                      </p>
                    </div>
                    <div className="flex self-center justify-center">
                      <span
                        className={cn(
                          "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          attributeAiPending
                            ? "bg-[#e8f1f8] text-[#2b6a9c]"
                            : finalStatus === "passed"
                              ? "bg-[#e8f5ec] text-[#16a34a]"
                              : finalStatus === "failed"
                                ? "bg-[#fdecec] text-[#dc2626]"
                                : "bg-[#fdf3e3] text-[#b45309]",
                        )}
                      >
                        {displayedVerdictLabel}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!result)
                            return toast.error("분석 결과가 있어야 이슈로 등록할 수 있어요");
                          createIssue.mutate(
                            {
                              type: "custom_attribute",
                              id: currentAttribute.id,
                              label: currentAttribute.technical_name,
                            },
                            {
                              onSuccess: (issue) => {
                                setSelectedIssueId(issue.id);
                                setCommentBody("");
                                toast.success(
                                  `${currentAttribute.technical_name} 이슈를 추가했어요`,
                                );
                              },
                            },
                          );
                        }}
                        className="rounded-md border border-[#f0dfc0] bg-[#fdf9f1] px-2 py-1 text-left text-[11.5px] font-semibold leading-tight text-[#b45309]"
                      >
                        이슈 있음
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setTaxonomyDialog({ attribute: currentAttribute, eventId: null })
                        }
                        className="rounded-md border border-[#e3e8ef] px-2 py-1 text-left text-[11.5px] leading-tight text-[#64748b] hover:border-[#2b6a9c] hover:text-[#2b6a9c]"
                      >
                        택소노미에서 수정
                      </button>
                    </div>
                  </div>
                </div>
                {currentAttribute.data_type === "array of object" ? (
                  <SpecHierarchyLabel>하위 필드 · Array of Object</SpecHierarchyLabel>
                ) : null}
              </div>
            </Panel>
          ) : null}

          <Panel
            title="라운드 이력"
            description="차수별 불일치 건수만 봅니다. 세부 목록은 펼쳐서 확인해요."
          >
            <ul>
              {compressedHistory.map((h) => {
                const open = openRounds[h.roundNumber] ?? false;
                const categories = [
                  { label: "필수 누락", properties: h.missingProperties, tone: "red" },
                  { label: "미정의", properties: h.undefinedProperties, tone: "amber" },
                  { label: "타입", properties: h.typeMismatchProperties, tone: "red" },
                  { label: "값·형식", properties: h.valueFormatProperties, tone: "red" },
                ] as const;
                const total = categories.reduce(
                  (count, category) => count + category.properties.length,
                  0,
                );
                return (
                  <li key={h.roundNumber} className="border-b border-[#f4f6f9] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setOpenRounds((prev) => ({ ...prev, [h.roundNumber]: !open }))}
                      className="grid w-full grid-cols-[48px_64px_minmax(0,1fr)_76px_20px] items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f7f9fc]"
                    >
                      <span className="text-[13px] font-semibold">{h.roundNumber}차</span>
                      <span>
                        <span
                          className={cn(
                            "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            h.finalStatus === "passed"
                              ? "bg-[#e8f5ec] text-[#16a34a]"
                              : h.finalStatus === "failed"
                                ? "bg-[#fdecec] text-[#dc2626]"
                                : "bg-[#fdf3e3] text-[#b45309]",
                          )}
                        >
                          {h.finalStatus === "passed"
                            ? "통과"
                            : h.finalStatus === "failed"
                              ? "오류"
                              : "미발생"}
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {categories.map((category) =>
                          category.properties.length > 0 ? (
                            <span
                              key={category.label}
                              className={cn(
                                "whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                                category.tone === "amber"
                                  ? "border-[#f0dfc0] bg-[#fdf3e3] text-[#b45309]"
                                  : "border-[#f4d0d0] bg-[#fdecec] text-[#dc2626]",
                              )}
                            >
                              {category.label} {category.properties.length}
                            </span>
                          ) : null,
                        )}
                        {total === 0 && h.otherReason ? (
                          <span className="truncate text-[12px] text-[#4a5666]">
                            {h.otherReason}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "text-right text-[12px] tabular-nums",
                          h.delta === null || h.delta <= 0 ? "text-[#8b97a8]" : "text-[#dc2626]",
                        )}
                      >
                        {h.delta === null ? "최초" : h.delta > 0 ? `+${h.delta}` : `±${h.delta}`}
                      </span>
                      <span
                        className={cn(
                          "text-[#c3ccd8] transition-transform",
                          open ? "rotate-90" : "",
                        )}
                      >
                        ›
                      </span>
                    </button>
                    {open && total > 0 ? (
                      <div className="space-y-2 px-4 pb-3 pl-[64px]">
                        {categories.map((category) =>
                          category.properties.length > 0 ? (
                            <div key={category.label}>
                              <p className="text-[11.5px] font-semibold text-[#64748b]">
                                {category.label}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {category.properties.map((property) => (
                                  <code
                                    key={property}
                                    className="mono-token rounded-md border border-[#eef1f5] bg-[#f6f8fa] px-1.5 py-0.5 text-[11.5px] text-[#4a5666]"
                                  >
                                    {property}
                                  </code>
                                ))}
                              </div>
                            </div>
                          ) : null,
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        <div className="min-w-0 max-w-[360px] flex-[1_1_320px] space-y-4">
          {result?.failed_layer === "qualitative" ? (
            <Panel
              title="AI·규칙 오류 해소"
              description="값의 의미나 A→B 조건은 규칙을 고친 뒤 다시 분석해야 해요."
            >
              <div className="space-y-2 p-4">
                <Link
                  from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
                  to="/w/$wsId/p/$projectId/taxonomy"
                  params={(prev) => ({ wsId: prev.wsId, projectId: prev.projectId })}
                  className="block rounded-md border border-[#d9dcf3] px-3 py-2 text-center text-[12.5px] font-semibold text-[#4b4f8a]"
                >
                  택소노미·AI 규칙 수정
                </Link>
                <Button
                  className="w-full"
                  disabled={analyze.isPending}
                  onClick={() =>
                    reanalyzeAfterTaxonomyChange()
                      .then(() => toast.success("다시 분석해 판정을 갱신했어요"))
                      .catch((error) => toast.error(errorMessage(error)))
                  }
                >
                  수정 반영 후 다시 분석
                </Button>
              </div>
            </Panel>
          ) : null}
          <Panel
            title="이슈 처리"
            description={`${item.target_type === "event" ? "이벤트 전체나 프로퍼티" : "어트리뷰트"} 이슈에 댓글을 남겨요. 상태 변경과 이월은 이슈 모아보기에서 합니다.`}
          >
            <div className="space-y-3 p-4">
              {discussions.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-5 text-center text-[12.5px] text-[#8b97a8]">
                  이슈 있음 버튼을 누르면 여기에 추가돼요.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {discussions.map((discussion) => (
                      <button
                        key={discussion.id}
                        type="button"
                        title={discussionDisplayLabel(discussion)}
                        onMouseEnter={() => setHoveredIssueProperty(discussion.target_label)}
                        onMouseLeave={() => setHoveredIssueProperty(null)}
                        onClick={() => {
                          setSelectedIssueId(discussion.id);
                          setCommentBody("");
                        }}
                        className={cn(
                          "max-w-full rounded-md border px-2 py-1 font-mono text-[11.5px]",
                          selectedIssue?.id === discussion.id
                            ? "border-[#4b4f8a] bg-[#f6f7fd] font-semibold text-[#4b4f8a]"
                            : "border-[#e3e8ef] text-[#64748b]",
                        )}
                      >
                        <span className="block truncate">{discussionDisplayLabel(discussion)}</span>
                      </button>
                    ))}
                  </div>

                  {selectedIssue ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          title={discussionDisplayLabel(selectedIssue)}
                          onMouseEnter={() => setHoveredIssueProperty(selectedIssue.target_label)}
                          onMouseLeave={() => setHoveredIssueProperty(null)}
                          className="truncate font-mono text-[12px] font-semibold text-[#4b4f8a]"
                        >
                          {discussionDisplayLabel(selectedIssue)}
                        </p>
                        <QaIssueDeleteButton
                          compact
                          targetLabel={discussionDisplayLabel(selectedIssue)}
                          pending={deleteIssue.isPending}
                          onDelete={() => {
                            deleteIssue.mutate(selectedIssue.id, {
                              onSuccess: () => {
                                setSelectedIssueId(null);
                                setCommentBody("");
                                toast.success("이슈를 삭제했어요");
                              },
                              onError: (error) => toast.error(errorMessage(error)),
                            });
                          }}
                        />
                      </div>
                      {selectedIssue.qa_discussion_comments.length > 0 ? (
                        <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg bg-[#f8fafc] p-3">
                          {selectedIssue.qa_discussion_comments.map((comment) => (
                            <div
                              key={comment.id}
                              className={cn(
                                "rounded-lg border px-3 py-2.5",
                                comment.external_author_name
                                  ? "border-[#9dcfc4] bg-[#edf9f6]"
                                  : "border-[#dbe2ea] bg-white",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p
                                  className={cn(
                                    "text-[11px] font-medium",
                                    comment.external_author_name
                                      ? "text-[#167565]"
                                      : "text-[#8b97a8]",
                                  )}
                                >
                                  {comment.external_author_name ? (
                                    <span className="mr-1.5 rounded bg-[#ccece5] px-1.5 py-0.5 text-[10px] font-bold">
                                      {project?.name ?? "고객사"}
                                    </span>
                                  ) : null}
                                  {comment.external_author_name ??
                                    (comment.author_id === user?.id ? "나" : "내부 담당자")}{" "}
                                  · {formatDateTime(comment.created_at)}
                                </p>
                                {comment.author_id === user?.id &&
                                editingComment?.id !== comment.id ? (
                                  <button
                                    type="button"
                                    aria-label="댓글 수정"
                                    onClick={() =>
                                      setEditingComment({ id: comment.id, body: comment.body })
                                    }
                                    className="text-[#8b97a8] hover:text-[#4b4f8a]"
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                ) : null}
                              </div>
                              {editingComment?.id === comment.id ? (
                                <div className="mt-1 space-y-1.5">
                                  <Textarea
                                    value={editingComment.body}
                                    onChange={(event) =>
                                      setEditingComment({
                                        id: comment.id,
                                        body: event.target.value,
                                      })
                                    }
                                    className="min-h-[60px] bg-white"
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingComment(null)}
                                    >
                                      취소
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={
                                        !editingComment.body.trim() || updateComment.isPending
                                      }
                                      onClick={() =>
                                        updateComment.mutate(
                                          { commentId: comment.id, body: editingComment.body },
                                          {
                                            onSuccess: () => {
                                              setEditingComment(null);
                                              toast.success("댓글을 수정했어요");
                                            },
                                            onError: (error) => toast.error(errorMessage(error)),
                                          },
                                        )
                                      }
                                    >
                                      저장
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[12.5px] leading-relaxed text-[#4a5666]">
                                  {comment.body}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <Textarea
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        placeholder={`${discussionDisplayLabel(selectedIssue)}에 대한 원인·수정 내용을 남겨보세요`}
                        className="min-h-[68px]"
                      />
                      <Button
                        className="w-full"
                        disabled={!user || !commentBody.trim() || addComment.isPending}
                        onClick={() => {
                          if (!user || !commentBody.trim()) return;
                          addComment.mutate(
                            {
                              discussionId: selectedIssue.id,
                              body: commentBody.trim(),
                              authorId: user.id,
                            },
                            {
                              onSuccess: () => {
                                setCommentBody("");
                                toast.success("댓글을 남겼어요");
                              },
                            },
                          );
                        }}
                      >
                        댓글 남기기
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
              <Link
                from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
                to="/w/$wsId/p/$projectId/issues"
                params={(prev) => ({ wsId: prev.wsId, projectId: prev.projectId })}
                className="block text-center text-[12px] font-medium text-[#4b4f8a] hover:underline"
              >
                전체 이슈 모아보기
              </Link>
            </div>
          </Panel>
        </div>
      </div>
      {taxonomyDialog ? (
        <TaxonomyAttributeDialog
          projectId={projectId}
          userId={user?.id ?? ""}
          events={events}
          eventProperties={eventProperties}
          attribute={taxonomyDialog.attribute}
          eventId={taxonomyDialog.eventId}
          channels={channels}
          excludedKeys={exclusions?.properties ?? new Set<string>()}
          onClose={() => setTaxonomyDialog(null)}
          onSaved={() => {
            void refetchEventProperties();
            void refetchCustomAttributes();
          }}
        />
      ) : null}
    </div>
  );
}
