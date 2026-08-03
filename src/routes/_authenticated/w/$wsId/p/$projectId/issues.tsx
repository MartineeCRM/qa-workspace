import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock3, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Panel } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { errorMessage, formatDateTime } from "@/lib/domain";
import {
  useAddDiscussionComment,
  useDeleteQaIssue,
  useProjectQaIssues,
  useUpdateQaIssue,
} from "@/lib/qa-rounds-queries";
import { useEnvironments, useTaxonomyEvents } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/issues")({
  component: QaIssuesPage,
});

const STATUS_LABEL = {
  needs_review: "확인 필요",
  still_issue: "여전히 이슈",
  next_validation: "다음 검증 대기",
  dismissed: "오탐·종료",
  verified: "검증 완료",
} as const;

function QaIssuesPage() {
  const { wsId, projectId } = useParams({ from: "/_authenticated/w/$wsId/p/$projectId/issues" });
  const { user } = useAuth();
  const { data: issues = [] } = useProjectQaIssues(projectId);
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: environments = [] } = useEnvironments(projectId);
  const updateIssue = useUpdateQaIssue(projectId);
  const deleteIssue = useDeleteQaIssue(projectId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const eventById = new Map(events.map((event) => [event.id, event]));
  const environmentById = new Map(environments.map((environment) => [environment.id, environment]));
  const openIssues = issues.filter(
    (issue) => issue.workflow_status !== "dismissed" && issue.workflow_status !== "verified",
  );

  return (
    <div className="space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold">이슈 모아보기</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          검증 결과에서 표시한 프로퍼티를 논의하고, 다음 차수에서 다시 검증할지 결정합니다.
        </p>
      </div>

      <Panel
        title={`처리할 이슈 ${openIssues.length}`}
        description="이슈를 등록하는 것만으로는 다음 차수에 이월되지 않아요."
      >
        {openIssues.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="처리할 이슈가 없어요" />
        ) : (
          <ul className="divide-y">
            {openIssues.map((issue) => {
              const event = eventById.get(issue.event_id);
              const environment = environmentById.get(issue.qa_environment_id);
              return (
                <li key={issue.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 text-[#b45309]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="mono-token text-sm font-semibold">
                          {event?.technical_name ?? issue.event_id}.{issue.target_label}
                        </code>
                        {environment ? <Pill>{environment.name}</Pill> : null}
                        <Pill>{STATUS_LABEL[issue.workflow_status]}</Pill>
                      </div>
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
                        className="mt-1 inline-block text-xs text-[#4b4f8a] hover:underline"
                      >
                        검증 근거 보기
                      </Link>
                    </div>
                  </div>

                  {issue.qa_discussion_comments.length > 0 ? (
                    <div className="space-y-2 rounded-lg bg-[#f8fafc] p-3">
                      {issue.qa_discussion_comments.map((comment) => (
                        <div key={comment.id}>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDateTime(comment.created_at)}
                          </p>
                          <p className="text-[13px] text-[#4a5666]">{comment.body}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <IssueCommentBox
                    issueId={issue.id}
                    resultId={issue.checklist_item_result_id}
                    userId={user?.id}
                    value={drafts[issue.id] ?? ""}
                    onChange={(value) =>
                      setDrafts((current) => ({ ...current, [issue.id]: value }))
                    }
                    onSaved={() => setDrafts((current) => ({ ...current, [issue.id]: "" }))}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateIssue.isPending}
                      onClick={() =>
                        updateIssue.mutate(
                          {
                            issueId: issue.id,
                            status: "still_issue",
                            checklistItemId: issue.checklist_item_id,
                          },
                          {
                            onSuccess: () => toast.success("이슈를 계속 확인할 항목으로 남겼어요"),
                          },
                        )
                      }
                    >
                      여전히 이슈로 남기기
                    </Button>
                    <Button
                      size="sm"
                      disabled={updateIssue.isPending}
                      onClick={() =>
                        updateIssue.mutate(
                          {
                            issueId: issue.id,
                            status: "next_validation",
                            checklistItemId: issue.checklist_item_id,
                          },
                          {
                            onSuccess: () => toast.success("다음 차수 검증 대상으로 이월했어요"),
                            onError: (error) => toast.error(errorMessage(error)),
                          },
                        )
                      }
                    >
                      <Clock3 className="size-4" /> 다음 차수에서 검증
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updateIssue.isPending}
                      onClick={() =>
                        updateIssue.mutate(
                          {
                            issueId: issue.id,
                            status: "dismissed",
                            checklistItemId: issue.checklist_item_id,
                          },
                          { onSuccess: () => toast.success("오탐으로 종료했어요") },
                        )
                      }
                    >
                      오탐·종료
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[#dc2626] hover:text-[#dc2626]"
                      disabled={deleteIssue.isPending}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `${event?.technical_name ?? issue.event_id}.${issue.target_label} 이슈와 댓글을 삭제할까요?`,
                          )
                        )
                          return;
                        deleteIssue.mutate(issue.id, {
                          onSuccess: () => toast.success("이슈를 삭제했어요"),
                          onError: (error) => toast.error(errorMessage(error)),
                        });
                      }}
                    >
                      <Trash2 className="size-4" /> 이슈 삭제
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
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
  return (
    <div className="flex gap-2">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="원인, 수정 내용, 담당자를 남겨보세요"
        className="min-h-[42px] flex-1"
      />
      <Button
        variant="outline"
        disabled={!userId || !value.trim() || addComment.isPending}
        onClick={() => {
          if (!userId || !value.trim()) return;
          addComment.mutate(
            { discussionId: issueId, body: value.trim(), authorId: userId },
            { onSuccess: onSaved, onError: (error) => toast.error(errorMessage(error)) },
          );
        }}
      >
        댓글
      </Button>
    </div>
  );
}
