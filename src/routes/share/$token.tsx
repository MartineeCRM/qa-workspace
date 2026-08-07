import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/domain";
import {
  commentOnSharedIssue,
  getSharedIssue,
  updateSharedIssue,
} from "@/lib/issue-share.functions";

export const Route = createFileRoute("/share/$token")({
  ssr: false,
  component: SharedIssuePage,
});

const STATUS = {
  open: "이슈 있음",
  talk: "논의중",
  fixing: "개발 수정 중",
  done: "해결",
} as const;

function SharedIssuePage() {
  const { token } = useParams({ from: "/share/$token" });
  const [issue, setIssue] = useState<any>(undefined);
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(
    () =>
      getSharedIssue({ data: { token } })
        .then(setIssue)
        .catch(() => setIssue(null)),
    [token],
  );
  useEffect(() => void load(), [load]);

  if (issue === undefined)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-[#64748b]">
        불러오는 중…
      </div>
    );
  if (issue === null)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f7fa] px-5">
        <div className="text-center">
          <ShieldCheck className="mx-auto size-8 text-[#64748b]" />
          <h1 className="mt-3 text-lg font-bold">공유 링크를 열 수 없어요</h1>
          <p className="mt-1 text-sm text-[#64748b]">만료되었거나 비활성화된 링크입니다.</p>
        </div>
      </div>
    );

  return (
    <main className="min-h-screen bg-[#f4f7fa] px-4 py-8 text-[#1c2431]">
      <div className="mx-auto max-w-[920px] space-y-4">
        <header className="rounded-[14px] border border-[#cbd5e1] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-[#2b6a9c]">QA Workspace · 공유 이슈</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-mono text-xl font-bold">{issue.targetLabel}</h1>
              <p className="mt-1 text-xs text-[#64748b]">
                {[
                  issue.projectName,
                  issue.environmentName,
                  issue.channelName,
                  issue.sessionName,
                  `${issue.roundNumber}차`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <select
              value={issue.workflowStatus}
              onChange={async (event) => {
                const status = event.target.value;
                setSaving(true);
                try {
                  await updateSharedIssue({ data: { token, status } });
                  setIssue((current: any) => ({ ...current, workflowStatus: status }));
                  toast.success("상태를 변경했어요");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "상태 변경에 실패했어요");
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="h-9 rounded-md border border-[#cbd5e1] bg-white px-3 text-sm font-semibold"
            >
              {Object.entries(STATUS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </header>

        <section className="rounded-[14px] border border-[#cbd5e1] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold">판정 및 근거</h2>
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-[#3c4757]">
            {issue.reasoning || "별도의 판정 설명이 없습니다."}
          </p>
          {issue.evidence ? (
            <details className="mt-3 rounded-lg border border-[#dbe2ea] bg-[#f8fafc]">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[#64748b]">
                전체 판정 데이터
              </summary>
              <pre className="max-h-80 overflow-auto border-t border-[#dbe2ea] p-3 text-[11px] leading-5">
                {JSON.stringify(issue.evidence, null, 2)}
              </pre>
            </details>
          ) : null}
          <details className="mt-3 rounded-lg border border-[#202938] bg-[#0d1117] text-[#d7e0ea]">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
              원본 근거 로그 {issue.logs.length}건
            </summary>
            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-all border-t border-[#202938] p-3 text-[11px] leading-5">
              {JSON.stringify(issue.logs, null, 2)}
            </pre>
          </details>
        </section>

        <section className="rounded-[14px] border border-[#cbd5e1] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-[#2b6a9c]" />
            <h2 className="text-sm font-bold">댓글</h2>
          </div>
          <div className="mt-3 space-y-2">
            {issue.comments.map((comment: any) => (
              <article key={comment.id} className="rounded-lg bg-[#f8fafc] px-3 py-2.5">
                <p className="text-[11px] font-semibold text-[#64748b]">
                  {comment.author} · {formatDateTime(comment.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5">{comment.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-4 grid gap-2">
            <Input
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              placeholder="이름 또는 소속"
              maxLength={80}
            />
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="확인 내용이나 질문을 남겨주세요"
              maxLength={5000}
            />
            <Button
              disabled={saving || !authorName.trim() || !body.trim()}
              onClick={async () => {
                setSaving(true);
                try {
                  await commentOnSharedIssue({ data: { token, authorName, body } });
                  setBody("");
                  await load();
                  toast.success("댓글을 남겼어요");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "댓글 저장에 실패했어요");
                } finally {
                  setSaving(false);
                }
              }}
            >
              댓글 남기기
            </Button>
          </div>
        </section>
        <p className="text-center text-[11px] text-[#8b97a8]">
          링크 만료 {formatDateTime(issue.expiresAt)}
        </p>
      </div>
    </main>
  );
}
