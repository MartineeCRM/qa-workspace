import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { Panel } from "@/components/app/layout-parts";
import { QaIssueDeleteButton } from "@/components/app/qa-issue-delete-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/domain";
import { type QaDiscussion } from "@/lib/qa-rounds-queries";

type ItemDiscussionPanelProps = {
  failedLayer: string | null | undefined;
  analyzeIsPending: boolean;
  onReanalyze: () => void;
  discussions: QaDiscussion[];
  selectedIssue: QaDiscussion | null;
  onSelectIssue: (id: string) => void;
  commentResetVersion: number;
  onHoverIssueProperty: (property: string | null) => void;
  onDeleteIssue: () => void;
  deleteIssuePending: boolean;
  onAddComment: (body: string, onSuccess: () => void) => void;
  addCommentPending: boolean;
  onUpdateComment: (commentId: string, body: string, onSuccess: () => void) => void;
  updateCommentPending: boolean;
  userId: string | undefined;
  projectName: string | null | undefined;
  targetType: "event" | "custom_attribute";
  discussionDisplayLabel: (discussion: QaDiscussion) => string;
  wsId: string;
  projectId: string;
};

export function ItemDiscussionPanel({
  failedLayer,
  analyzeIsPending,
  onReanalyze,
  discussions,
  selectedIssue,
  onSelectIssue,
  commentResetVersion,
  onHoverIssueProperty,
  onDeleteIssue,
  deleteIssuePending,
  onAddComment,
  addCommentPending,
  onUpdateComment,
  updateCommentPending,
  userId,
  projectName,
  targetType,
  discussionDisplayLabel,
  wsId,
  projectId,
}: ItemDiscussionPanelProps) {
  const [commentBody, setCommentBody] = useState("");
  const [editingComment, setEditingComment] = useState<{ id: string; body: string } | null>(null);

  // Reset the comment input on the parent's signal. The signal is incremented at
  // the exact sites where the original code called setCommentBody(""):
  // issue tab click, issue creation success, deletion success.
  // Item-change reset is handled upstream by key={item.id} remounting this panel.
  // Comment addition success resets via the onSuccess callback, not this effect.
  useEffect(() => {
    setCommentBody("");
  }, [commentResetVersion]);

  return (
    <div className="min-w-0 max-w-[360px] flex-[1_1_320px] space-y-4">
      {failedLayer === "qualitative" ? (
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
            <Button className="w-full" disabled={analyzeIsPending} onClick={onReanalyze}>
              수정 반영 후 다시 분석
            </Button>
          </div>
        </Panel>
      ) : null}
      <Panel
        title="이슈 처리"
        description={`${targetType === "event" ? "이벤트 전체나 프로퍼티" : "어트리뷰트"} 이슈에 댓글을 남겨요. 상태 변경과 이월은 이슈 관리에서 합니다.`}
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
                    onMouseEnter={() => onHoverIssueProperty(discussion.target_label)}
                    onMouseLeave={() => onHoverIssueProperty(null)}
                    onClick={() => onSelectIssue(discussion.id)}
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
                      onMouseEnter={() => onHoverIssueProperty(selectedIssue.target_label)}
                      onMouseLeave={() => onHoverIssueProperty(null)}
                      className="truncate font-mono text-[12px] font-semibold text-[#4b4f8a]"
                    >
                      {discussionDisplayLabel(selectedIssue)}
                    </p>
                    <QaIssueDeleteButton
                      compact
                      targetLabel={discussionDisplayLabel(selectedIssue)}
                      pending={deleteIssuePending}
                      onDelete={onDeleteIssue}
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
                                comment.external_author_name ? "text-[#167565]" : "text-[#8b97a8]",
                              )}
                            >
                              {comment.external_author_name ? (
                                <span className="mr-1.5 rounded bg-[#ccece5] px-1.5 py-0.5 text-[10px] font-bold">
                                  {projectName ?? "고객사"}
                                </span>
                              ) : null}
                              {comment.external_author_name ??
                                (comment.author_id === userId ? "나" : "내부 담당자")}{" "}
                              · {formatDateTime(comment.created_at)}
                            </p>
                            {comment.author_id === userId && editingComment?.id !== comment.id ? (
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
                                  disabled={!editingComment.body.trim() || updateCommentPending}
                                  onClick={() =>
                                    onUpdateComment(comment.id, editingComment.body, () =>
                                      setEditingComment(null),
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
                    disabled={!userId || !commentBody.trim() || addCommentPending}
                    onClick={() => onAddComment(commentBody.trim(), () => setCommentBody(""))}
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
            전체 이슈 관리
          </Link>
        </div>
      </Panel>
    </div>
  );
}
