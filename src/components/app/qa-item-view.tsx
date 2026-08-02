import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/domain";
import {
  buildMergedTimeline,
  nextChecklistItemId,
  previousChecklistItemId,
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
import { useTaxonomyCustomAttributes, useTaxonomyEvents } from "@/lib/queries";

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
  const [commentBody, setCommentBody] = useState("");

  const label =
    item.target_type === "event"
      ? events.find((e) => e.id === item.target_id)?.technical_name
      : customAttributes.find((a) => a.id === item.target_id)?.technical_name;
  const finalStatus = result?.final_status ?? "not_collected";
  const verdictStyle = VERDICT_STYLE[finalStatus];

  const timeline = buildMergedTimeline(runEvents, snapshots);
  const relevantKeys = new Set(
    (Array.isArray(result?.ai_evidence) ? (result?.ai_evidence as Array<{ id?: string }>) : []).map(
      (e) => e.id,
    ),
  );
  const evidenceRows = timeline.filter(
    (row) => relevantKeys.size === 0 || relevantKeys.has(row.key),
  );

  const orderedIds = checklistItems.map((i) => i.id);

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
      <div>
        <h2 className="mono-token text-xl font-bold">{label ?? item.target_id}</h2>
        <p className="mt-1 text-[12.5px] text-[#8b97a8]">
          {item.target_type === "event" ? "이벤트" : "attribute"} · 마지막 판정{" "}
          {result ? formatDateTime(result.updated_at) : "없음"}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_420px] space-y-4">
          <div
            className="rounded-[14px] border px-[18px] py-4"
            style={{ borderColor: verdictStyle.border, backgroundColor: verdictStyle.bg }}
          >
            <p className="text-xs font-bold" style={{ color: verdictStyle.fg }}>
              AI 판정
            </p>
            <p className="mt-1.5 text-[13.5px] leading-[1.7] text-[#3c4757]">
              {result?.ai_reasoning ?? "판단 이유가 없어요."}
            </p>
          </div>

          <Panel title="근거 로그" description="이 항목과 관련된 병합 타임라인 구간">
            <div className="grid grid-cols-[88px_76px_1fr_1fr] gap-3 bg-[#fbfcfd] px-4 py-2 text-xs font-medium text-[#64748b]">
              <span>시각</span>
              <span>출처</span>
              <span>이름</span>
              <span>값/변화</span>
            </div>
            {evidenceRows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[88px_76px_1fr_1fr] gap-3 border-b border-[#f1f4f8] px-4 py-2 text-xs"
              >
                <span className="tabular-nums text-[#8b97a8]">
                  {formatDateTime(row.occurredAt)}
                </span>
                <span>{row.source === "snapshot" ? "스냅샷" : "이벤트"}</span>
                <span className="mono-token truncate">{row.name}</span>
                <span className="mono-token truncate">{row.change}</span>
              </div>
            ))}
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

          <div className="flex gap-2">
            <Link
              from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
              to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
              params={(prev) => ({
                ...prev,
                itemId: previousChecklistItemId(orderedIds, item.id),
              })}
              className="flex-1 rounded-md border px-3 py-2 text-center text-sm hover:border-[#2b6a9c]"
            >
              ← 이전 항목
            </Link>
            <Link
              from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
              to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
              params={(prev) => ({ ...prev, itemId: nextChecklistItemId(orderedIds, item.id) })}
              className="flex-1 rounded-md border px-3 py-2 text-center text-sm hover:border-[#2b6a9c]"
            >
              다음 항목 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
