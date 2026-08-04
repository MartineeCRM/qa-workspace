import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { QaItemSpecDiffTable } from "@/components/app/qa-item-spec-diff";
import { QaIssueDeleteButton } from "@/components/app/qa-issue-delete-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { errorMessage, formatDateTime, formatRawLogTime } from "@/lib/domain";
import { normalizeFlatAttributeArrays } from "@/lib/checklist-judge";
import {
  aiFailedTaxonomyPropertyIds,
  buildMergedTimeline,
  compressRoundHistory,
  nextChecklistItemId,
  previousChecklistItemId,
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
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
} from "@/lib/queries";

const VERDICT_STYLE = {
  passed: { border: "#cfe8d8", bg: "#f2faf5", fg: "#16a34a" },
  failed: { border: "#f4d0d0", bg: "#fdf5f5", fg: "#dc2626" },
  not_collected: { border: "#f0dfc0", bg: "#fdf9f1", fg: "#b45309" },
} as const;

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
  const { user } = useAuth();
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: eventProperties = [], refetch: refetchEventProperties } =
    useTaxonomyEventProperties(projectId);
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

  // "이전/다음 항목" links only change the :itemId path param, so this component
  // doesn't remount between items.
  useEffect(() => {
    setEvidenceExpanded(false);
    setSelectedIssueId(null);
    setCommentBody("");
    setEvidenceHighlight(null);
    setHoveredIssueProperty(null);
    setEditingComment(null);
  }, [item.id]);

  const label =
    item.target_type === "event"
      ? events.find((e) => e.id === item.target_id)?.technical_name
      : customAttributes.find((a) => a.id === item.target_id)?.technical_name;
  const finalStatus = result?.final_status ?? "not_collected";
  const verdictStyle = VERDICT_STYLE[finalStatus];
  const selectedIssue =
    discussions.find((discussion) => discussion.id === selectedIssueId) ?? discussions[0] ?? null;

  const normalizedSnapshots = normalizeFlatAttributeArrays(snapshots, customAttributes);
  const timeline = buildMergedTimeline(runEvents, normalizedSnapshots);
  // Scope the evidence log to this item's own target — never fall back to showing
  // the whole session's CSV/snapshot history for items with no ai_evidence (e.g.
  // passed verdicts), which is what a size-0-relevantKeys fallback used to do.
  const relevantKeys = new Set(
    item.target_type === "event"
      ? runEvents.filter((e) => e.event_id === item.target_id).map((e) => `event:${e.id}`)
      : timeline
          .filter((row) => row.source === "snapshot" && row.name === label)
          .map((row) => row.key),
  );
  const evidenceRows = timeline.filter((row) => relevantKeys.has(row.key));
  const aiFailedPropertyIds = aiFailedTaxonomyPropertyIds(result?.ai_evidence);
  const evidenceIsLong =
    evidenceRows.length > 6 ||
    evidenceRows.reduce(
      (length, row) => length + JSON.stringify(row.raw ?? row.change ?? "").length,
      0,
    ) > 3_000;
  const violatingProperties = new Set(
    result?.judged_by === "rule" && result?.ai_reasoning
      ? result.ai_reasoning
          .split("\n")
          .map((line) => line.split(":")[0]?.trim())
          .filter((v): v is string => Boolean(v))
      : [],
  );
  const thisEventProperties =
    item.target_type === "event"
      ? eventProperties.filter(
          (property) =>
            property.event_id === item.target_id &&
            (!session.qa_channel_id ||
              !exclusions?.properties.has(`${property.id}:${session.qa_channel_id}`)),
        )
      : [];
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
  const compressedHistory = compressRoundHistory(
    history,
    new Map(eventProperties.map((property) => [property.id, property.technical_name])),
  );

  const orderedIds = checklistItems.map((i) => i.id);

  function copyEvidenceLog() {
    const text = evidenceRows
      .map((row) => {
        const header = `${row.name} | ${row.source === "snapshot" ? "스냅샷" : "이벤트"} | ${formatRawLogTime(row.occurredAt)}`;
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
          const highlighted = violatingProperties.has(k);
          return (
            <div key={k} className="pl-4">
              <span
                className={cn(
                  issueHovered && "rounded-sm bg-red-400/20 px-0.5",
                  !issueHovered &&
                    selected &&
                    (evidenceHighlight?.tone === "pass"
                      ? "rounded-sm bg-emerald-400/20 px-0.5"
                      : "rounded-sm bg-amber-300/20 px-0.5"),
                  !issueHovered &&
                    !selected &&
                    highlighted &&
                    "rounded-sm bg-[#4a3f00] px-0.5 text-[#f2d675]",
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
    const highlighted = violatingProperties.has(row.name);
    return (
      <span className={highlighted ? "rounded-sm bg-[#4a3f00] px-0.5 text-[#f2d675]" : undefined}>
        {row.change}
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
            {item.target_type === "event" ? "이벤트" : "attribute"} · 마지막 판정{" "}
            {result ? formatDateTime(result.updated_at) : "없음"}
          </p>
        </div>
        <div className="flex gap-2">
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
            title="근거 로그"
            description="이 항목과 관련된 병합 타임라인 구간"
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
                            {row.source === "snapshot" ? "스냅샷" : "이벤트"}
                          </span>
                          <span className="text-[#6e7681]"> | </span>
                          <span className="text-[#6e7681]">{formatRawLogTime(row.occurredAt)}</span>
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
              properties={thisEventProperties}
              rawPropertiesList={matchedRawPropertiesList}
              aiFailedPropertyIds={aiFailedPropertyIds}
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
            />
          ) : (
            <div
              className="rounded-[14px] border px-[18px] py-4"
              style={{ borderColor: verdictStyle.border, backgroundColor: verdictStyle.bg }}
            >
              <p className="text-xs font-bold" style={{ color: verdictStyle.fg }}>
                {result?.judged_by === "rule" ? "Rule 기반 판정" : "AI 판정"}
              </p>
              <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-[1.7] text-[#3c4757]">
                {result?.ai_reasoning ?? "판단 이유가 없어요."}
              </p>
            </div>
          )}

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
            description="스펙 대조에서 선택한 프로퍼티별로 댓글을 남겨요. 상태 변경과 이월은 이슈 모아보기에서 합니다."
          >
            <div className="space-y-3 p-4">
              {discussions.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-5 text-center text-[12.5px] text-[#8b97a8]">
                  스펙 대조에서 이슈 있음을 누르면 여기에 추가돼요.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {discussions.map((discussion) => (
                      <button
                        key={discussion.id}
                        type="button"
                        title={`${label}.${discussion.target_label}`}
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
                        <span className="block truncate">
                          {label}.{discussion.target_label}
                        </span>
                      </button>
                    ))}
                  </div>

                  {selectedIssue ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          title={`${label}.${selectedIssue.target_label}`}
                          onMouseEnter={() => setHoveredIssueProperty(selectedIssue.target_label)}
                          onMouseLeave={() => setHoveredIssueProperty(null)}
                          className="truncate font-mono text-[12px] font-semibold text-[#4b4f8a]"
                        >
                          {label}.{selectedIssue.target_label}
                        </p>
                        <QaIssueDeleteButton
                          compact
                          targetLabel={`${label}.${selectedIssue.target_label}`}
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
                            <div key={comment.id}>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-[#8b97a8]">
                                  {formatDateTime(comment.created_at)}
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
                        placeholder={`${label}.${selectedIssue.target_label}에 대한 원인·수정 내용을 남겨보세요`}
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
    </div>
  );
}
