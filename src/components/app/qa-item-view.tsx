import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { errorMessage, formatDateTime } from "@/lib/domain";
import { inferDataType } from "@/lib/checklist-judge";
import {
  buildMergedTimeline,
  nextChecklistItemId,
  previousChecklistItemId,
  type MergedTimelineRow,
} from "@/lib/qa-workflow";
import {
  useAddDiscussionComment,
  useCarryOverItems,
  useChecklistItemRoundHistory,
  useQaAttributeSnapshots,
  useQaChecklistItems,
  useQaDiscussion,
  useQaRunEvents,
  useSetDisposition,
  type QaChecklistItemWithDisposition,
  type QaChecklistItemResult,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import { useAddDiscoveredEventProperty, useTaxonomyCustomAttributes, useTaxonomyEvents } from "@/lib/queries";

const VERDICT_STYLE = {
  passed: { border: "#cfe8d8", bg: "#f2faf5", fg: "#16a34a" },
  failed: { border: "#f4d0d0", bg: "#fdf5f5", fg: "#dc2626" },
  not_collected: { border: "#f0dfc0", bg: "#fdf9f1", fg: "#b45309" },
} as const;

export function QaItemView({
  projectId,
  environmentId,
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
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const { data: snapshots = [] } = useQaAttributeSnapshots(session.id);
  const { data: history = [] } = useChecklistItemRoundHistory(item.id);
  const { data: discussion } = useQaDiscussion(result?.id ?? "");
  const setDisposition = useSetDisposition(session.id);
  const carryOver = useCarryOverItems(environmentId);
  const addComment = useAddDiscussionComment(result?.id ?? "");
  const addProperty = useAddDiscoveredEventProperty(projectId);
  const [commentBody, setCommentBody] = useState("");

  // "이전/다음 항목" links only change the :itemId path param, so this component
  // doesn't remount between items (same pattern that caused the session-view stepper
  // to go stale) — without this, a half-typed draft comment about one item would
  // silently carry over into the next item's textarea.
  useEffect(() => {
    setCommentBody("");
  }, [item.id]);

  const label =
    item.target_type === "event"
      ? events.find((e) => e.id === item.target_id)?.technical_name
      : customAttributes.find((a) => a.id === item.target_id)?.technical_name;
  const finalStatus = result?.final_status ?? "not_collected";
  const verdictStyle = VERDICT_STYLE[finalStatus];

  const timeline = buildMergedTimeline(runEvents, snapshots);
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
  const violatingProperties = new Set(
    result?.judged_by === "rule" && result?.ai_reasoning
      ? result.ai_reasoning
          .split("\n")
          .map((line) => line.split(":")[0]?.trim())
          .filter((v): v is string => Boolean(v))
      : [],
  );
  const unknownEventProperties =
    item.target_type === "event" && result?.judged_by === "rule" && Array.isArray(result?.ai_evidence)
      ? (
          result.ai_evidence as Array<{
            property: string;
            kind?: string;
            sampleValue?: unknown;
          }>
        ).filter((v) => v.kind === "unknown_property")
      : [];

  function addToTaxonomy(property: string, sampleValue: unknown) {
    if (!user) return;
    addProperty.mutate(
      {
        eventId: item.target_id,
        technicalName: property,
        dataType: inferDataType(sampleValue),
        sampleValue,
        userId: user.id,
      },
      {
        onSuccess: () =>
          toast.success(
            `"${property}"을(를) 택소노미에 반영했어요 — 이 항목은 다음 분석부터 반영돼요`,
          ),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  const orderedIds = checklistItems.map((i) => i.id);

  function copyEvidenceLog() {
    const text = evidenceRows
      .map((row) => {
        const header = `${formatDateTime(row.occurredAt)} | ${row.source === "snapshot" ? "스냅샷" : "이벤트"} | ${row.name}`;
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
          const highlighted = violatingProperties.has(k);
          return (
            <div key={k} className="pl-4">
              <span className={highlighted ? "rounded-sm bg-[#4a3f00] px-0.5 text-[#f2d675]" : undefined}>
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

  function copyIssue() {
    const bundle = [
      `항목: ${label ?? item.target_id}`,
      `판정: ${finalStatus}`,
      result?.ai_reasoning ? `판단 이유: ${result.ai_reasoning}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard
      .writeText(bundle)
      .then(() => toast.success("이슈 설명을 클립보드에 복사했어요 — 이슈 트래커에 붙여넣으세요"))
      .catch(() => toast.error("복사에 실패했어요"));
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
        <div className="min-w-0 flex-[1_1_420px] space-y-4">
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

          {unknownEventProperties.length > 0 ? (
            <div className="space-y-2 rounded-[14px] border border-[#f0dfc0] bg-[#fdf9f1] px-[18px] py-4">
              <p className="text-xs font-bold text-[#b45309]">택소노미에 없는 프로퍼티</p>
              {unknownEventProperties.map((v) => (
                <div
                  key={v.property}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="mono-token truncate text-[13px] font-semibold">{v.property}</p>
                    <p className="text-[11.5px] text-[#8b97a8]">
                      예시 값: {JSON.stringify(v.sampleValue)} ({inferDataType(v.sampleValue)} 추정)
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={addProperty.isPending}
                    onClick={() => addToTaxonomy(v.property, v.sampleValue)}
                  >
                    택소노미에 추가
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

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
            <div className="space-y-1 overflow-x-auto bg-[#0d1117] p-4 font-mono text-[12px] leading-[1.7]">
              {evidenceRows.length === 0 ? (
                <p className="text-[#6e7681]">관련된 로그가 없어요.</p>
              ) : (
                evidenceRows.map((row) => (
                  <div key={row.key} className="text-[#c9d1d9]">
                    <div className="whitespace-pre">
                      <span className="text-[#6e7681]">{formatDateTime(row.occurredAt)}</span>
                      <span className="text-[#6e7681]"> | </span>
                      <span className="text-[#7ee787]">
                        {row.source === "snapshot" ? "스냅샷" : "이벤트"}
                      </span>
                      <span className="text-[#6e7681]"> | </span>
                      <span>{row.name}</span>
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
          </Panel>

          <Panel title="라운드 이력">
            <ul className="px-4 py-2">
              {history.map((h, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 py-2 text-[12.5px]"
                >
                  <span className="text-[#8b97a8]">{h.roundNumber}차</span>
                  <span className="text-[#4a5666]">{h.reasoning ?? "—"}</span>
                  <span>
                    {h.finalStatus === "passed"
                      ? "통과"
                      : h.finalStatus === "failed"
                        ? "오류"
                        : "미발생"}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="min-w-0 max-w-[380px] flex-[1_1_330px] space-y-4">
          <Panel
            title="이 항목 처리"
            description="여기서 정하면 세션 결과와 커버리지에 바로 반영돼요."
          >
            <div className="space-y-1.5 p-4">
              {(
                [
                  {
                    value: "passed_override",
                    label: "통과로 처리",
                    desc: "판정을 뒤집고 커버리지에 통과로 반영",
                    color: "#16a34a",
                  },
                  {
                    value: "carried_over",
                    label: "다음 차수로 이월",
                    desc: "다음 라운드 체크리스트에 자동으로 담김",
                    color: "#5b5fc7",
                  },
                  {
                    value: "discussing",
                    label: "논의 중으로 두기",
                    desc: "원인 확인 전까지 미결로 유지",
                    color: "#b45309",
                  },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="w-full rounded-[11px] border p-[11px] text-left"
                  style={{
                    borderColor: item.disposition === option.value ? option.color : "#e3e8ef",
                    boxShadow:
                      item.disposition === option.value ? `0 0 0 3px ${option.color}1a` : "none",
                  }}
                  onClick={() => {
                    if (!user) return;
                    if (option.value === "carried_over") {
                      carryOver.mutate(
                        {
                          items: [
                            {
                              id: item.id,
                              qa_session_id: item.qa_session_id,
                              target_type: item.target_type,
                              target_id: item.target_id,
                            },
                          ],
                          userId: user.id,
                          assigneeId: null,
                        },
                        { onSuccess: () => toast.success("다음 라운드로 이월했어요") },
                      );
                      return;
                    }
                    setDisposition.mutate(
                      { itemId: item.id, disposition: option.value, userId: user.id },
                      { onSuccess: () => toast.success("처리 상태를 반영했어요") },
                    );
                  }}
                >
                  <p className="text-[13px] font-semibold">{option.label}</p>
                  <p className="text-[11.5px] text-[#8b97a8]">{option.desc}</p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title={`논의 ${discussion?.qa_discussion_comments.length ?? 0}`}>
            <div className="space-y-3 p-4">
              {(discussion?.qa_discussion_comments ?? []).map((c) => (
                <div key={c.id} className="grid grid-cols-[26px_minmax(0,1fr)] gap-2.5">
                  <span className="flex size-[26px] items-center justify-center rounded-full bg-[#eef1f5] text-[11px] font-bold text-[#64748b]">
                    {c.author_id.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-[12.5px] font-semibold">{formatDateTime(c.created_at)}</p>
                    <p className="text-[12.5px] leading-[1.6] text-[#4a5666]">{c.body}</p>
                  </div>
                </div>
              ))}
              <Textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="원인·재현 조건·담당자 멘션(@)을 남겨보세요"
                className="min-h-[62px]"
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={copyIssue}>
                  이슈로 내보내기
                </Button>
                <Button
                  className="flex-1 bg-[#1c2431] hover:bg-[#2c3648]"
                  disabled={!user || !commentBody.trim() || addComment.isPending}
                  onClick={() => {
                    if (!user || !commentBody.trim()) return;
                    addComment.mutate(
                      {
                        userId: user.id,
                        body: commentBody.trim(),
                        discussionId: discussion?.id ?? null,
                      },
                      {
                        onSuccess: () => {
                          setCommentBody("");
                          if (item.disposition === "unresolved" && user) {
                            setDisposition.mutate({
                              itemId: item.id,
                              disposition: "discussing",
                              userId: user.id,
                            });
                          }
                        },
                      },
                    );
                  }}
                >
                  코멘트 남기기
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
