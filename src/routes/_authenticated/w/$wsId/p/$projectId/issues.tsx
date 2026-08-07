import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowUp, Check, CheckCircle2, Pencil, Share2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/layout-parts";
import { QaIssueDeleteButton } from "@/components/app/qa-issue-delete-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { errorMessage, formatDateTime } from "@/lib/domain";
import { createProjectIssueShare } from "@/lib/issue-share.functions";
import {
  useAddDiscussionComment,
  useDeleteQaIssue,
  useProjectQaIssues,
  useQaChannels,
  useSubmitQaIssues,
  useUpdateDiscussionComment,
  useUpdateQaIssue,
  type ProjectQaIssue,
} from "@/lib/qa-rounds-queries";
import { useEnvironments, useMembers, useTaxonomyEvents } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/issues")({
  component: QaIssuesPage,
});

type IssueStatus = "open" | "talk" | "fixing" | "done";
type IssueFilter = "all" | IssueStatus;

const STATUS = {
  open: { label: "이슈 있음", color: "#dc2626", bg: "#fff1f2" },
  talk: { label: "논의중", color: "#b45309", bg: "#fff7ed" },
  fixing: { label: "개발 수정 중", color: "#2b6a9c", bg: "#eff6ff" },
  done: { label: "해결", color: "#16a34a", bg: "#f0fdf4" },
} as const;
const STATUSES = Object.keys(STATUS) as IssueStatus[];
const SUBMITTABLE = new Set<IssueStatus>(["fixing", "done"]);

function QaIssuesPage() {
  const { wsId, projectId } = useParams({ from: "/_authenticated/w/$wsId/p/$projectId/issues" });
  const { user } = useAuth();
  const { data: issues = [] } = useProjectQaIssues(projectId);
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: environments = [] } = useEnvironments(projectId);
  const { data: channels = [] } = useQaChannels(projectId);
  const { data: members = [] } = useMembers(wsId);
  const updateIssue = useUpdateQaIssue(projectId);
  const submitIssues = useSubmitQaIssues(projectId);
  const deleteIssue = useDeleteQaIssue(projectId);
  const updateComment = useUpdateDiscussionComment();
  const [filter, setFilter] = useState<IssueFilter>("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, IssueStatus>>({});
  const [editingComment, setEditingComment] = useState<{ id: string; body: string } | null>(null);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const environmentById = new Map(environments.map((environment) => [environment.id, environment]));
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const authorById = new Map(
    members.map((member) => [
      member.user_id,
      member.profiles?.display_name || member.profiles?.email || "알 수 없는 사용자",
    ]),
  );
  const activeIssues = issues.filter(
    (issue): issue is ProjectQaIssue & { workflow_status: IssueStatus } =>
      issue.workflow_status !== "dismissed" && issue.workflow_status !== "verified",
  );
  const statusOf = (issue: ProjectQaIssue): IssueStatus =>
    statusOverrides[issue.id] ?? (issue.workflow_status as IssueStatus);
  const count = (status: IssueStatus) =>
    activeIssues.filter((issue) => statusOf(issue) === status).length;
  const submittable = activeIssues.filter((issue) => SUBMITTABLE.has(statusOf(issue)));
  const selected = submittable.filter((issue) => checked.has(issue.id));
  const allChecked = submittable.length > 0 && selected.length === submittable.length;
  const shown = activeIssues.filter((issue) => filter === "all" || statusOf(issue) === filter);
  const nextRounds = new Set(selected.map((issue) => issue.round_number + 1));
  const nextRoundLabel = nextRounds.size === 1 ? `${[...nextRounds][0]}차` : "다음 차수";

  function toggleChecked(issueId: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }

  function changeStatus(issue: ProjectQaIssue, status: IssueStatus) {
    const previous = statusOf(issue);
    setStatusOverrides((current) => ({ ...current, [issue.id]: status }));
    if (!SUBMITTABLE.has(status)) {
      setChecked((current) => {
        const next = new Set(current);
        next.delete(issue.id);
        return next;
      });
    }
    updateIssue.mutate(
      { issueId: issue.id, status },
      {
        onSuccess: () => toast.success(`상태를 ${STATUS[status].label}(으)로 바꿨어요`),
        onError: (error) => {
          setStatusOverrides((current) => ({ ...current, [issue.id]: previous }));
          toast.error(errorMessage(error));
        },
      },
    );
  }

  return (
    <div className="p-6">
      <section className="max-w-[1080px] overflow-hidden rounded-[14px] border border-[#cbd5e1] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <header className="flex flex-wrap items-center gap-4 border-b border-[#dbe2ea] bg-[#f8fafc] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold tracking-[-0.2px]">처리할 이슈</h2>
            <p className="mt-0.5 text-[12.5px] text-[#64748b]">
              이슈는 그대로 두면 계속 남아요. 개발 수정이 끝난 항목만 골라서 다음 차수 검증 목록으로
              제출합니다.
            </p>
          </div>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="h-9 bg-white text-xs"
            onClick={async () => {
              try {
                const share = await createProjectIssueShare({ data: { projectId } });
                const url = `${window.location.origin}/share/${share.token}`;
                await navigator.clipboard.writeText(url);
                window.open(url, "_blank", "noopener,noreferrer");
                toast.success("고객용 이슈 모아보기 주소를 복사했어요");
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            <Share2 className="mr-1.5 size-3.5" />
            고객용 이슈 모아보기
          </Button>
          <div className="flex items-center gap-[18px]">
            {STATUSES.map((status) => {
              const value = count(status);
              return (
                <div key={status} className="text-right">
                  <p className="whitespace-nowrap text-[11.5px] font-medium text-[#64748b]">
                    {STATUS[status].label}
                  </p>
                  <p
                    className="text-[19px] font-bold tabular-nums"
                    style={{ color: value ? STATUS[status].color : "#64748b" }}
                  >
                    {value}
                  </p>
                </div>
              );
            })}
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3 border-b border-[#dbe2ea] bg-[#f8fafc] px-5 py-[11px]">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[#475569]">
            <button
              type="button"
              aria-label="수정 완료 항목 전체 선택"
              onClick={() =>
                setChecked(allChecked ? new Set() : new Set(submittable.map((i) => i.id)))
              }
              className={cn(
                "flex size-4 items-center justify-center rounded border-[1.5px]",
                allChecked
                  ? "border-[#2b6a9c] bg-[#2b6a9c] text-white"
                  : "border-[#94a3b8] bg-white",
              )}
            >
              {allChecked ? <Check className="size-3" /> : null}
            </button>
            수정 완료 항목 전체 선택
          </label>
          <div className="h-[18px] w-px bg-[#cbd5e1]" />
          <div className="flex flex-wrap gap-1 rounded-[9px] bg-[#e2e8f0] p-[3px]">
            {(["all", ...STATUSES] as IssueFilter[]).map((key) => {
              const label = key === "all" ? "전체" : STATUS[key].label;
              const value = key === "all" ? activeIssues.length : count(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "whitespace-nowrap rounded-[7px] px-[11px] py-1.5 text-xs",
                    filter === key
                      ? "bg-white font-semibold text-[#1c2431] shadow-sm"
                      : "text-[#64748b] hover:text-[#334155]",
                  )}
                >
                  {label} {value}
                </button>
              );
            })}
          </div>
          <div className="flex-1" />
          <p className="text-xs font-medium text-[#64748b]">
            개발 수정 중·해결 {submittable.length}건이 제출 대상이에요
          </p>
        </div>

        {activeIssues.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="처리할 이슈가 없어요" />
        ) : shown.length === 0 ? (
          <p className="px-5 py-12 text-center text-[12.5px] text-[#64748b]">
            이 상태의 이슈가 없어요.
          </p>
        ) : (
          <ul>
            {shown.map((issue) => {
              const status = statusOf(issue);
              const canSubmit = SUBMITTABLE.has(status);
              const isChecked = checked.has(issue.id);
              const noteOpen = openNotes.has(issue.id);
              const eventName =
                issue.target_type === "custom_attribute"
                  ? "어트리뷰트"
                  : (eventById.get(issue.event_id)?.technical_name ?? issue.event_id);
              const environment = environmentById.get(issue.qa_environment_id);
              const channel = issue.qa_channel_id ? channelById.get(issue.qa_channel_id) : null;
              const comments = [...issue.qa_discussion_comments].sort((a, b) =>
                a.created_at.localeCompare(b.created_at),
              );
              const latestComment = comments.at(-1);
              const previousComments = comments.slice(0, -1);
              return (
                <li
                  key={issue.id}
                  className={cn(
                    "border-b border-[#e2e8f0]",
                    isChecked ? "bg-[#eff6ff]" : "bg-white",
                  )}
                >
                  <div className="grid grid-cols-[30px_minmax(0,1fr)_300px] items-start gap-5 px-5 py-[18px] max-md:grid-cols-[30px_minmax(0,1fr)]">
                    <button
                      type="button"
                      disabled={!canSubmit}
                      aria-label={`${eventName}.${issue.target_label} 제출 선택`}
                      onClick={() => toggleChecked(issue.id)}
                      className={cn(
                        "mt-0.5 flex size-[18px] items-center justify-center rounded-[5px] border-[1.5px]",
                        isChecked
                          ? "border-[#2b6a9c] bg-[#2b6a9c] text-white"
                          : canSubmit
                            ? "border-[#94a3b8] bg-white"
                            : "cursor-not-allowed border-[#e8edf3] bg-white opacity-55",
                      )}
                    >
                      {isChecked ? <Check className="size-3" /> : null}
                    </button>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-[9px]">
                        <code className="break-all text-sm font-semibold tracking-[-0.2px] text-[#1c2431]">
                          {eventName}
                        </code>
                        <span className="text-[#94a3b8]">·</span>
                        <code className="break-all text-sm font-semibold tracking-[-0.2px] text-[#2b6a9c]">
                          {issue.target_label}
                        </code>
                      </div>
                      <p className="mt-[7px] text-xs font-medium text-[#64748b]">
                        {[
                          environment?.name,
                          channel?.name ?? "채널 미지정",
                          issue.session_name,
                          `${issue.round_number}차`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>

                      {latestComment ? (
                        <div className="mt-3 rounded-[10px] border border-[#cbd5e1] bg-[#f8fafc] px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11.5px] font-medium text-[#64748b]">
                              {latestComment.external_author_name ??
                                (latestComment.author_id
                                  ? authorById.get(latestComment.author_id)
                                  : null) ??
                                "알 수 없는 사용자"}{" "}
                              · {formatDateTime(latestComment.created_at)}
                            </p>
                            {latestComment.author_id === user?.id &&
                            editingComment?.id !== latestComment.id ? (
                              <button
                                type="button"
                                aria-label="댓글 수정"
                                onClick={() =>
                                  setEditingComment({
                                    id: latestComment.id,
                                    body: latestComment.body,
                                  })
                                }
                                className="text-[#64748b] hover:text-[#2b6a9c]"
                              >
                                <Pencil className="size-3" />
                              </button>
                            ) : null}
                          </div>
                          {editingComment?.id === latestComment.id ? (
                            <div className="mt-1 space-y-1.5">
                              <Textarea
                                value={editingComment.body}
                                onChange={(event) =>
                                  setEditingComment({
                                    id: latestComment.id,
                                    body: event.target.value,
                                  })
                                }
                                className="min-h-16 bg-white"
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
                                  disabled={!editingComment.body.trim() || updateComment.isPending}
                                  onClick={() =>
                                    updateComment.mutate(
                                      {
                                        commentId: latestComment.id,
                                        body: editingComment.body,
                                      },
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
                            <p className="mt-0.5 text-[13px] leading-[1.6] text-[#3c4757]">
                              {latestComment.body}
                            </p>
                          )}
                        </div>
                      ) : null}

                      <div className="mt-2">
                        <IssueCommentBox
                          issueId={issue.id}
                          resultId={issue.checklist_item_result_id}
                          userId={user?.id}
                          value={drafts[issue.id] ?? ""}
                          onChange={(value) =>
                            setDrafts((current) => ({ ...current, [issue.id]: value }))
                          }
                          onSaved={() => {
                            setDrafts((current) => ({ ...current, [issue.id]: "" }));
                            toast.success("메모를 히스토리에 추가했어요");
                          }}
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {previousComments.length > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setOpenNotes((current) => {
                                const next = new Set(current);
                                if (next.has(issue.id)) next.delete(issue.id);
                                else next.add(issue.id);
                                return next;
                              })
                            }
                            className={cn(
                              "h-8 text-xs",
                              noteOpen && "border-[#2b6a9c] text-[#2b6a9c]",
                            )}
                          >
                            {noteOpen ? "기존 메모 닫기" : "기존 메모 보기"}
                          </Button>
                        ) : null}
                        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                          <Link
                            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
                            params={{
                              wsId,
                              projectId,
                              stageSlug: environment?.slug ?? "-",
                              roundId: issue.round_id,
                              sessionId: issue.qa_session_id,
                              itemId: issue.checklist_item_id,
                            }}
                          >
                            검증 근거 보기
                          </Link>
                        </Button>
                        <span
                          className="text-[11.5px] font-semibold"
                          style={{ color: STATUS[status].color }}
                        >
                          {STATUS[status].label} ·{" "}
                          {formatDateTime(issue.updated_at ?? issue.created_at)} 업데이트
                        </span>
                        <div className="flex-1" />
                        <QaIssueDeleteButton
                          muted
                          targetLabel={`${eventName}.${issue.target_label}`}
                          pending={deleteIssue.isPending}
                          onDelete={() =>
                            deleteIssue.mutate(issue.id, {
                              onSuccess: () => toast.success("이슈를 삭제했어요"),
                              onError: (error) => toast.error(errorMessage(error)),
                            })
                          }
                        />
                      </div>

                      {noteOpen ? (
                        <div className="mt-2.5">
                          {comments.length > 0 ? (
                            <div className="max-h-52 divide-y divide-[#dbe2ea] overflow-y-auto rounded-[10px] border border-[#dbe2ea] bg-[#f8fafc] px-3">
                              {previousComments.map((comment) => (
                                <div key={comment.id} className="py-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-medium text-[#64748b]">
                                      {comment.external_author_name ??
                                        (comment.author_id
                                          ? authorById.get(comment.author_id)
                                          : null) ??
                                        "알 수 없는 사용자"}{" "}
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
                                        className="text-[#64748b] hover:text-[#2b6a9c]"
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
                                        className="min-h-16 bg-white"
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
                                                onError: (error) =>
                                                  toast.error(errorMessage(error)),
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
                        </div>
                      ) : null}
                    </div>

                    <div className="border-l border-[#e2e8f0] pl-5 max-md:col-start-2 max-md:border-l-0 max-md:pl-0">
                      <p className="text-[11.5px] font-semibold text-[#475569]">상태</p>
                      <div className="mt-[9px] flex flex-col gap-[5px]">
                        {STATUSES.map((option) => {
                          const active = status === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              disabled={updateIssue.isPending}
                              onClick={() => changeStatus(issue, option)}
                              className="flex items-center gap-[9px] rounded-[10px] border px-[11px] py-[9px] text-left"
                              style={{
                                color: active ? STATUS[option].color : "#64748b",
                                background: active ? STATUS[option].bg : "#fff",
                                borderColor: active ? STATUS[option].color : "#cbd5e1",
                              }}
                            >
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ background: active ? STATUS[option].color : "#94a3b8" }}
                              />
                              <span className="text-[12.5px] font-semibold">
                                {STATUS[option].label}
                              </span>
                              <span className="flex-1" />
                              {active && SUBMITTABLE.has(option) ? (
                                <span className="text-[10.5px] font-semibold text-[#64748b]">
                                  제출 가능
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="flex flex-wrap items-center gap-3.5 border-t border-[#dbe2ea] bg-[#f8fafc] px-5 py-[15px]">
          <p className="text-[12.5px] text-[#5c6878]">
            {selected.length
              ? `선택한 ${selected.length}건이 ${nextRoundLabel} 체크리스트에 편입돼요.`
              : "제출할 항목을 선택해주세요. 선택하지 않은 이슈는 그대로 남습니다."}
          </p>
          <div className="flex-1" />
          <Button
            disabled={selected.length === 0 || submitIssues.isPending}
            onClick={() =>
              submitIssues.mutate(selected, {
                onSuccess: () => {
                  setChecked(new Set());
                  toast.success(`${selected.length}건을 다음 차수 검증 목록에 제출했어요`);
                },
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
            className="bg-[#2b6a9c] hover:bg-[#235a86] disabled:bg-[#e8edf3] disabled:text-[#a3adbb]"
          >
            {selected.length
              ? `다음 차수에서 확인할 항목 ${selected.length}건 제출하기`
              : "다음 차수에서 확인할 항목 제출하기"}
          </Button>
        </footer>
      </section>
    </div>
  );
}

function IssueCommentBox({
  issueId,
  resultId,
  userId,
  value,
  onChange,
  onSaved,
}: {
  issueId: string;
  resultId: string;
  userId: string | undefined;
  value: string;
  onChange: (value: string) => void;
  onSaved: () => void;
}) {
  const addComment = useAddDiscussionComment(resultId);
  const disabled = !userId || !value.trim() || addComment.isPending;
  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="원인, 수정 내용, 담당자를 남겨보세요"
        className="min-h-16 pr-12 text-[12.5px]"
      />
      <Button
        type="button"
        size="icon"
        aria-label="메모 등록"
        title="메모 등록"
        disabled={disabled}
        className="absolute right-2 top-1/2 size-[26px] -translate-y-1/2 rounded-full bg-[#1c2431] hover:bg-[#2c3648]"
        onClick={() => {
          if (!userId || !value.trim()) return;
          addComment.mutate(
            { discussionId: issueId, body: value.trim(), authorId: userId },
            { onSuccess: onSaved, onError: (error) => toast.error(errorMessage(error)) },
          );
        }}
      >
        <ArrowUp className="size-[13px]" />
      </Button>
    </div>
  );
}
