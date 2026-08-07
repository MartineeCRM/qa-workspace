import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ChevronRight, LogOut, MessageSquareText, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatMergedTimelineTime } from "@/lib/domain";
import {
  commentOnSharedIssue,
  getSharedIssuePortal,
  updateSharedIssue,
} from "@/lib/issue-share.functions";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/share/$token")({ ssr: false, component: SharedIssuesPage });

const STATUS = {
  open: { label: "이슈 있음", color: "bg-[#fff1f2] text-[#c81e3a]" },
  talk: { label: "논의중", color: "bg-[#fff7e6] text-[#a85708]" },
  fixing: { label: "개발 수정 중", color: "bg-[#eaf3ff] text-[#23669b]" },
  done: { label: "해결", color: "bg-[#eaf8ef] text-[#16803a]" },
} as const;
type Status = keyof typeof STATUS;

function SharedIssuesPage() {
  const { token } = useParams({ from: "/share/$token" });
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [portal, setPortal] = useState<any>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(
    () =>
      getSharedIssuePortal({ data: { token } })
        .then((value) => {
          setPortal(value);
          setSelectedId((current) => current ?? value?.issues?.[0]?.id ?? null);
        })
        .catch(() => setPortal(null)),
    [token],
  );
  useEffect(() => {
    if (!authLoading && user) void load();
  }, [authLoading, user, load]);

  const filterOptions = useMemo(
    () => ({
      environments: [
        ...new Set<string>((portal?.issues ?? []).map((issue: any) => issue.environmentName)),
      ],
      channels: [
        ...new Set<string>(
          (portal?.issues ?? []).map((issue: any) => issue.channelName).filter(Boolean),
        ),
      ],
    }),
    [portal],
  );
  const shown = useMemo(
    () =>
      (portal?.issues ?? []).filter(
        (issue: any) =>
          (environmentFilter === "all" || issue.environmentName === environmentFilter) &&
          (channelFilter === "all" || issue.channelName === channelFilter) &&
          (statusFilter === "all" || issue.workflowStatus === statusFilter) &&
          issue.displayLabel.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [portal, environmentFilter, channelFilter, statusFilter, query],
  );
  const selected = shown.find((issue: any) => issue.id === selectedId) ?? shown[0] ?? null;

  if (authLoading)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-[#64748b]">
        불러오는 중…
      </div>
    );
  if (!user)
    return (
      <div className="grid min-h-screen place-items-center bg-[#eef2f6] px-5">
        <div className="w-full max-w-sm rounded-[14px] border border-[#cbd5e1] bg-white p-6 text-center shadow-sm">
          <ShieldCheck className="mx-auto size-8 text-[#2b6a9c]" />
          <h1 className="mt-3 text-lg font-bold">로그인 후 확인할 수 있어요</h1>
          <p className="mt-1 text-sm leading-6 text-[#64748b]">
            댓글과 상태 변경자를 정확히 기록하기 위해 고객사 계정으로 로그인해주세요.
          </p>
          <Button asChild className="mt-5 w-full">
            <Link to="/login" search={{ redirect: `/share/${token}` }}>
              로그인
            </Link>
          </Button>
          <Link
            to="/signup"
            search={{ redirect: `/share/${token}` }}
            className="mt-3 inline-block text-xs font-semibold text-[#2b6a9c] hover:underline"
          >
            고객사 계정 만들기
          </Link>
        </div>
      </div>
    );
  if (portal === undefined)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-[#64748b]">
        불러오는 중…
      </div>
    );
  if (portal === null)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f7fa] px-5">
        <div className="text-center">
          <ShieldCheck className="mx-auto size-8 text-[#64748b]" />
          <h1 className="mt-3 text-lg font-bold">공유 페이지를 열 수 없어요</h1>
          <p className="mt-1 text-sm text-[#64748b]">만료되었거나 비활성화된 링크입니다.</p>
        </div>
      </div>
    );

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#1c2431]">
      <header className="border-b border-[#cad4df] bg-[#172331] px-5 py-5 text-white">
        <div className="mx-auto flex max-w-[1320px] items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8fb9dc]">
              QA WORKSPACE
            </p>
            <h1 className="mt-1 text-xl font-bold">{portal.projectName} · 이슈 모아보기</h1>
            <p className="mt-1 text-xs text-[#aebdcb]">
              검증 이슈를 확인하고 상태와 댓글을 함께 관리합니다.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#aebdcb]">
            <span>{profile?.display_name || user.email}</span>
            <span>전체 {portal.issues.length}건</span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 hover:bg-white/10"
            >
              <LogOut className="size-3" /> 로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1320px] grid-cols-[390px_minmax(0,1fr)] gap-4 px-4 py-4 max-lg:grid-cols-1">
        <aside className="overflow-hidden rounded-[14px] border border-[#cbd5e1] bg-white shadow-sm">
          <div className="border-b border-[#dbe2ea] p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7b8998]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이벤트·프로퍼티·어트리뷰트 검색"
                className="pl-9"
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <label className="grid gap-1 text-[10px] font-semibold text-[#64748b]">
                QA 환경
                <select
                  value={environmentFilter}
                  onChange={(event) => setEnvironmentFilter(event.target.value)}
                  className="h-8 min-w-0 rounded-md border border-[#cbd5e1] bg-white px-2 text-xs font-medium text-[#334155]"
                >
                  <option value="all">전체</option>
                  {filterOptions.environments.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-[10px] font-semibold text-[#64748b]">
                OS
                <select
                  value={channelFilter}
                  onChange={(event) => setChannelFilter(event.target.value)}
                  className="h-8 min-w-0 rounded-md border border-[#cbd5e1] bg-white px-2 text-xs font-medium text-[#334155]"
                >
                  <option value="all">전체</option>
                  {filterOptions.channels.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-[10px] font-semibold text-[#64748b]">
                상태
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | Status)}
                  className="h-8 min-w-0 rounded-md border border-[#cbd5e1] bg-white px-2 text-xs font-medium text-[#334155]"
                >
                  <option value="all">전체</option>
                  {Object.entries(STATUS).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <ul className="max-h-[calc(100vh-220px)] overflow-y-auto">
            {shown.map((issue: any) => (
              <li key={issue.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(issue.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-[#e5eaf0] px-4 py-4 text-left transition-colors hover:bg-[#f7f9fb]",
                    selected?.id === issue.id &&
                      "border-l-[3px] border-l-[#2b6a9c] bg-[#f0f6fb] pl-[13px]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="break-all text-[13px] font-bold">{issue.displayLabel}</code>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                          STATUS[issue.workflowStatus as Status]?.color,
                        )}
                      >
                        {STATUS[issue.workflowStatus as Status]?.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#6d7b8b]">
                      {[issue.environmentName, issue.channelName, `${issue.roundNumber}차`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-[11px] text-[#8a97a5]">
                      댓글 {issue.comments.length}개 · {formatDateTime(issue.updatedAt)}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-[#9aa7b5]" />
                </button>
              </li>
            ))}
            {!shown.length ? (
              <li className="px-4 py-14 text-center text-xs text-[#7b8998]">
                조건에 맞는 이슈가 없어요.
              </li>
            ) : null}
          </ul>
        </aside>

        <section className="min-w-0 space-y-4">
          {!selected ? (
            <div className="grid min-h-72 place-items-center rounded-[14px] border border-[#cbd5e1] bg-white text-sm text-[#64748b]">
              확인할 이슈를 선택하세요.
            </div>
          ) : (
            <>
              <article className="rounded-[14px] border border-[#cbd5e1] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="break-all text-lg font-bold">{selected.displayLabel}</code>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-bold",
                          STATUS[selected.workflowStatus as Status]?.color,
                        )}
                      >
                        {STATUS[selected.workflowStatus as Status]?.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[#64748b]">
                      {[selected.environmentName, selected.channelName, `${selected.roundNumber}차`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <select
                    value={selected.workflowStatus}
                    disabled={saving}
                    onChange={async (event) => {
                      const status = event.target.value;
                      setSaving(true);
                      try {
                        await updateSharedIssue({
                          data: {
                            token,
                            discussionId: selected.id,
                            status,
                          },
                        });
                        await load();
                        toast.success("상태를 변경했어요");
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "상태 변경에 실패했어요",
                        );
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="h-9 rounded-md border border-[#cbd5e1] bg-white px-3 text-sm font-semibold"
                  >
                    {Object.entries(STATUS).map(([value, meta]) => (
                      <option key={value} value={value}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
              </article>

              <article className="overflow-hidden rounded-[14px] border border-[#cbd5e1] bg-white shadow-sm">
                <div className="border-b border-[#dbe2ea] px-5 py-4">
                  <h2 className="text-sm font-bold">근거 로그</h2>
                  <p className="mt-0.5 text-xs text-[#64748b]">
                    이 항목의 실제 이벤트·어트리뷰트 로그
                  </p>
                </div>
                <div className="max-h-[520px] overflow-auto bg-[#0d1117] p-4 font-mono text-[12px] leading-[1.7]">
                  {selected.logs.length ? (
                    selected.logs.map((row: any) => (
                      <div key={row.key} className="mb-2 text-[#c9d1d9] last:mb-0">
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
                            <span className="whitespace-pre-wrap">
                              {` ${row.change.replace(/,\s*/g, ",\n")}`}
                            </span>
                          ) : null}
                        </div>
                        {row.source === "event" ? (
                          <div className="pl-4">
                            <div>{"{"}</div>
                            {Object.entries(row.raw ?? {}).map(([key, value], index, entries) => (
                              <div key={key} className="pl-4">
                                {JSON.stringify(key)}: {JSON.stringify(value)}
                                {index < entries.length - 1 ? "," : ""}
                              </div>
                            ))}
                            <div>{"}"}</div>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="text-[#6e7681]">관련된 로그가 없어요.</p>
                  )}
                </div>
              </article>

              <article className="rounded-[14px] border border-[#cbd5e1] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="size-4 text-[#2b6a9c]" />
                  <h2 className="text-sm font-bold">댓글</h2>
                </div>
                <div className="mt-3 space-y-2">
                  {selected.comments.map((comment: any) => (
                    <div
                      key={comment.id}
                      className={cn(
                        "rounded-lg border px-3 py-2.5",
                        comment.external
                          ? "border-[#9dcfc4] bg-[#edf9f6]"
                          : "border-[#dbe2ea] bg-[#f5f7fa]",
                      )}
                    >
                      <p
                        className={cn(
                          "text-[11px] font-semibold",
                          comment.external ? "text-[#167565]" : "text-[#64748b]",
                        )}
                      >
                        {comment.external ? (
                          <span className="mr-1.5 rounded bg-[#ccece5] px-1.5 py-0.5 text-[10px] font-bold">
                            고객사
                          </span>
                        ) : null}
                        {comment.author} · {formatDateTime(comment.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5">
                        {comment.body}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-2">
                  <Textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="확인 내용이나 질문을 남겨주세요"
                    maxLength={5000}
                  />
                  <Button
                    disabled={saving || !body.trim()}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await commentOnSharedIssue({
                          data: { token, discussionId: selected.id, body },
                        });
                        setBody("");
                        await load();
                        toast.success("댓글을 남겼어요");
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "댓글 저장에 실패했어요",
                        );
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    댓글 남기기
                  </Button>
                </div>
              </article>
            </>
          )}
        </section>
      </div>
      <p className="pb-5 text-center text-[11px] text-[#7b8998]">
        공유 페이지 만료 {formatDateTime(portal.expiresAt)}
      </p>
    </main>
  );
}
