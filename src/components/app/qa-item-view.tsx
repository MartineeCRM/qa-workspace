import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { QaItemSpecDiffTable, SpecHierarchyLabel } from "@/components/app/qa-item-spec-diff";
import { TaxonomyAttributeDialog } from "@/components/app/taxonomy-tab";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { errorMessage, formatDateTime } from "@/lib/domain";
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
  snapshotsForRunUsers,
} from "@/lib/qa-workflow";
import {
  buildEvidenceLogText,
  extractAiRawResponse,
  extractAiSummary,
  isAiAnalysisIncomplete,
  isAttributeAiPending,
  isEvidenceLong,
  selectRelevantEvidenceRows,
} from "@/lib/qa-item-evidence";
import {
  formatAttributeExample,
  resolveChecklistItemLabel,
  resolveDiscussionDisplayLabel,
} from "@/lib/qa-item-labels";
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
import { ItemVerdictSummary } from "@/components/app/qa/item-verdict-summary";
import { ItemEvidencePanel } from "@/components/app/qa/item-evidence-panel";
import { ItemRoundHistoryPanel } from "@/components/app/qa/item-round-history-panel";
import { ItemDiscussionPanel } from "@/components/app/qa/item-discussion-panel";

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

export function QaItemView({
  wsId,
  projectId,
  stageSlug,
  roundId,
  session,
  item,
  result,
}: {
  wsId: string;
  projectId: string;
  stageSlug: string;
  roundId: string;
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
  // Lightweight signal: incremented at every point the original code called
  // setCommentBody("") — issue tab click, issue creation success, deletion success.
  // Item-change reset is handled by key={item.id} remounting the panel.
  const [commentResetVersion, setCommentResetVersion] = useState(0);
  const [evidenceHighlight, setEvidenceHighlight] = useState<{
    propertyNames: Set<string>;
    tone: "pass" | "issue";
  } | null>(null);
  const [hoveredIssueProperty, setHoveredIssueProperty] = useState<string | null>(null);
  const [taxonomyDialog, setTaxonomyDialog] = useState<{
    attribute: TaxonomyEventProperty | TaxonomyCustomAttribute;
    eventId: string | null;
  } | null>(null);

  // "이전/다음 항목" links only change the :itemId path param, so this component
  // doesn't remount between items. Panel-local states (evidenceExpanded, openRounds,
  // commentBody, editingComment) are reset via key={item.id} on each panel.
  useEffect(() => {
    setSelectedIssueId(null);
    setEvidenceHighlight(null);
    setHoveredIssueProperty(null);
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
    return resolveDiscussionDisplayLabel(discussion, label);
  }

  const normalizedSnapshots = normalizeFlatAttributeArrays(
    snapshotsForRunUsers(runEvents, snapshots),
    customAttributes,
  );
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
  const evidenceRows = selectRelevantEvidenceRows({
    evidenceTargets,
    customAttributes,
    runEvents,
    timeline,
  });
  const aiFailedPropertyIds = aiFailedTaxonomyPropertyIds(result?.ai_evidence);
  const aiAnalysisIncomplete = isAiAnalysisIncomplete(result);
  const attributeAiPending = isAttributeAiPending({
    currentAttribute,
    latestAttributeValue,
    aiAnalysisIncomplete,
  });
  const displayedVerdictLabel = attributeAiPending ? "AI 확인 필요" : verdictLabel;
  const displayedVerdictStyle = attributeAiPending
    ? { border: "#c9ddee", bg: "#e8f1f8", fg: "#2b6a9c" }
    : verdictStyle;
  const evidenceIsLong = isEvidenceLong(evidenceRows);
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
    return resolveChecklistItemLabel(checklistItem, events, customAttributes);
  }

  function copyEvidenceLog() {
    const text = buildEvidenceLogText(evidenceRows);
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("근거 로그를 클립보드에 복사했어요"))
      .catch(() => toast.error("복사에 실패했어요"));
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

  function handleSelectIssue(id: string) {
    setSelectedIssueId(id);
    setCommentResetVersion((v) => v + 1);
  }

  function handleDeleteIssue() {
    if (!selectedIssue) return;
    deleteIssue.mutate(selectedIssue.id, {
      onSuccess: () => {
        setSelectedIssueId(null);
        setCommentResetVersion((v) => v + 1);
        toast.success("이슈를 삭제했어요");
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  function handleAddComment(body: string, onSuccess: () => void) {
    if (!user || !selectedIssue) return;
    addComment.mutate(
      { discussionId: selectedIssue.id, body, authorId: user.id },
      {
        onSuccess: () => {
          onSuccess();
          toast.success("댓글을 남겼어요");
        },
      },
    );
  }

  function handleUpdateComment(commentId: string, body: string, onSuccess: () => void) {
    updateComment.mutate(
      { commentId, body },
      {
        onSuccess: () => {
          onSuccess();
          toast.success("댓글을 수정했어요");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  function handleReanalyzeWithToast() {
    reanalyzeAfterTaxonomyChange()
      .then(() => toast.success("다시 분석해 판정을 갱신했어요"))
      .catch((error) => toast.error(errorMessage(error)));
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
                params: {
                  wsId,
                  projectId,
                  stageSlug,
                  roundId,
                  sessionId: session.id,
                  itemId: event.target.value,
                },
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
          <ItemVerdictSummary
            displayedVerdictLabel={displayedVerdictLabel}
            displayedVerdictStyle={displayedVerdictStyle}
            ruleCounts={ruleCounts}
            aiSummary={aiSummary}
            aiRawResponse={aiRawResponse}
          />

          <ItemEvidencePanel
            key={item.id}
            evidenceRows={evidenceRows}
            evidenceIsLong={evidenceIsLong}
            onCopy={copyEvidenceLog}
            hoveredIssueProperty={hoveredIssueProperty}
            evidenceHighlight={evidenceHighlight}
          />

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
                      setCommentResetVersion((v) => v + 1);
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
                      setCommentResetVersion((v) => v + 1);
                      toast.success(`${label} 이벤트 전체 이슈를 추가했어요`);
                    },
                  },
                );
              }}
              onEditEvent={() =>
                navigate({
                  to: "/w/$wsId/p/$projectId/taxonomy",
                  params: { wsId, projectId },
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
                  <div className="grid min-w-[760px] grid-cols-[minmax(140px,1fr)_minmax(150px,1fr)_minmax(160px,1.1fr)_minmax(68px,0.5fr)_minmax(125px,0.65fr)] items-center gap-4 border-l-[3px] border-l-[#6f9aba] bg-[#f7fafc] py-3 pr-4 pl-[13px]">
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
                    <div className="flex self-center flex-col gap-1">
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
                                setCommentResetVersion((v) => v + 1);
                                toast.success(
                                  `${currentAttribute.technical_name} 이슈를 추가했어요`,
                                );
                              },
                            },
                          );
                        }}
                        className="rounded-md border border-[#e3e8ef] px-2 py-1 text-left text-[11.5px] leading-tight text-[#64748b] hover:border-[#2b6a9c] hover:text-[#2b6a9c]"
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

          <ItemRoundHistoryPanel key={item.id} compressedHistory={compressedHistory} />
        </div>

        <ItemDiscussionPanel
          key={item.id}
          failedLayer={result?.failed_layer}
          analyzeIsPending={analyze.isPending}
          onReanalyze={handleReanalyzeWithToast}
          discussions={discussions}
          selectedIssue={selectedIssue}
          onSelectIssue={handleSelectIssue}
          commentResetVersion={commentResetVersion}
          onHoverIssueProperty={setHoveredIssueProperty}
          onDeleteIssue={handleDeleteIssue}
          deleteIssuePending={deleteIssue.isPending}
          onAddComment={handleAddComment}
          addCommentPending={addComment.isPending}
          onUpdateComment={handleUpdateComment}
          updateCommentPending={updateComment.isPending}
          userId={user?.id}
          projectName={project?.name}
          targetType={item.target_type}
          discussionDisplayLabel={discussionDisplayLabel}
          wsId={wsId}
          projectId={projectId}
        />
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
