import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/app/layout-parts";
import { QaBreadcrumb } from "@/components/app/qa-breadcrumb";
import { useAuth } from "@/lib/auth";
import { canAdmin, canEdit, errorMessage } from "@/lib/domain";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import {
  useCreateQaRound,
  useCreateQaSession,
  useDeleteQaRound,
  useDeleteQaSession,
  useQaRounds,
  useQaChannels,
  useQaSessions,
  useQaSessionSteps,
  useRenameQaRound,
  useRenameQaSession,
  useRoundValidationSummary,
  useSetQaSessionChannel,
  type QaRound,
  type QaSession,
} from "@/lib/qa-rounds-queries";

const SESSION_STEP_LABELS = ["체크리스트", "수집", "분석", "결과"] as const;

function SessionProgressBar({ step }: { step: number }) {
  return (
    <div className="mt-3.5 flex gap-[5px]">
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          className="h-1 flex-1 rounded-full"
          style={{
            backgroundColor: n < step ? "#16a34a" : n === step ? "#2b6a9c" : "#e8edf3",
          }}
        />
      ))}
    </div>
  );
}

function RoundMetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "neutral" | "success" | "danger" | "purple";
}) {
  const styles =
    tone === "success"
      ? "border-[#cfe8d8] bg-[#f2faf5] text-[#16a34a]"
      : tone === "danger"
        ? "border-[#f4d0d0] bg-[#fdf5f5] text-[#dc2626]"
        : tone === "purple"
          ? "border-[#d9dcf3] bg-[#f6f7fd] text-[#5b5fc7]"
          : "border-[#e3e8ef] bg-white text-[#1c2431]";
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${styles}`}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[11.5px] opacity-75">{sub}</p>
    </div>
  );
}

export function QaRoundView({
  wsId,
  projectId,
  stageSlug,
  environmentId,
  roundId,
}: {
  wsId: string;
  projectId: string;
  stageSlug: string;
  environmentId: string;
  roundId: string;
}) {
  const { user } = useAuth();
  const { role } = useWorkspaceContext();
  const editable = canEdit(role);
  const canDeleteRounds = canAdmin(role);
  const navigate = useNavigate();
  const { data: rounds = [] } = useQaRounds(environmentId);
  const round = rounds.find((r) => r.id === roundId);
  const { data: sessions = [] } = useQaSessions(roundId);
  const { data: channels = [] } = useQaChannels(projectId);
  const { data: sessionSteps } = useQaSessionSteps(roundId);
  const createRound = useCreateQaRound(projectId, environmentId);
  const renameRound = useRenameQaRound(environmentId);
  const deleteRound = useDeleteQaRound(environmentId);
  const deleteSession = useDeleteQaSession(roundId);
  const setSessionChannel = useSetQaSessionChannel(roundId);
  const renameSession = useRenameQaSession(roundId);
  const latestRound = rounds[rounds.length - 1];
  const { data: summary = { executed: 0, passed: 0, unconfirmedIssues: 0, confirmedIssues: 0 } } =
    useRoundValidationSummary(roundId);
  const [renamingRound, setRenamingRound] = useState<QaRound | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingRound, setDeletingRound] = useState<QaRound | null>(null);
  const [deletingSession, setDeletingSession] = useState<QaSession | null>(null);
  const [renamingSession, setRenamingSession] = useState<QaSession | null>(null);
  const [sessionName, setSessionName] = useState("");

  if (!round) return null;

  function startRename(r: QaRound) {
    setRenamingRound(r);
    setRenameValue(r.name ?? "");
  }

  function submitRename() {
    if (!renamingRound) return;
    renameRound.mutate(
      { roundId: renamingRound.id, name: renameValue.trim() || null },
      {
        onError: (error) => toast.error(errorMessage(error)),
        onSuccess: () => {
          toast.success("라운드 이름을 수정했어요");
          setRenamingRound(null);
        },
      },
    );
  }

  function confirmDelete() {
    if (!deletingRound) return;
    const deletedRoundId = deletingRound.id;
    deleteRound.mutate(deletedRoundId, {
      onError: (error) => toast.error(errorMessage(error)),
      onSuccess: () => {
        toast.success("라운드를 삭제했어요");
        setDeletingRound(null);
        if (deletedRoundId === roundId) {
          navigate({
            to: "/w/$wsId/p/$projectId/qa/$stageSlug",
            params: { wsId, projectId, stageSlug },
          });
        }
      },
    });
  }

  function confirmDeleteSession() {
    if (!deletingSession) return;
    deleteSession.mutate(deletingSession.id, {
      onError: (error) => toast.error(errorMessage(error)),
      onSuccess: () => {
        toast.success("검증 실행을 삭제했어요");
        setDeletingSession(null);
      },
    });
  }

  function submitSessionRename() {
    if (!renamingSession || !sessionName.trim()) return;
    renameSession.mutate(
      { sessionId: renamingSession.id, name: sessionName.trim() },
      {
        onError: (error) => toast.error(errorMessage(error)),
        onSuccess: () => {
          toast.success("세션명을 수정했어요");
          setRenamingSession(null);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <QaBreadcrumb
        items={[
          {
            label: "개발 QA",
            to: "/w/$wsId/p/$projectId/qa/$stageSlug",
            params: { wsId, projectId, stageSlug },
          },
          { label: round.name?.trim() ? round.name : `${round.round_number}차` },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[21px] font-bold tracking-[-0.4px]">
            {round.name?.trim() ? round.name : `${round.round_number}차`} 라운드
          </h2>
          <p className="text-[13px] text-[#8b97a8]">
            검증 실행 하나가 채널별 체크리스트 → 수집 → 분석 → 결과의 한 사이클이에요.
          </p>
        </div>
        <Button
          onClick={() =>
            user &&
            createRound.mutate(
              { userId: user.id, previousRoundId: latestRound?.id ?? null },
              { onError: (error) => toast.error(errorMessage(error)) },
            )
          }
          disabled={createRound.isPending}
        >
          + 새 라운드 시작
        </Button>
      </div>

      <div className="my-[18px] flex flex-wrap gap-2">
        {rounds.map((r) => (
          <div
            key={r.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg border pl-[13px] pr-1 py-1",
              r.id === roundId
                ? "border-[#1c2431] bg-[#1c2431] text-white"
                : "border-[#e3e8ef] bg-white text-[#64748b]",
            )}
          >
            <Link
              from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId"
              to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId"
              params={(prev) => ({ ...prev, roundId: r.id })}
              className={cn("text-[13px]", r.id === roundId ? "font-semibold" : "font-medium")}
            >
              {r.name?.trim() ? r.name : `${r.round_number}차`}
            </Link>
            {editable ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-label={`${r.round_number}차 라운드 작업 메뉴`}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem onSelect={() => startRename(r)}>이름 수정</DropdownMenuItem>
                  {canDeleteRounds ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        onSelect={() => setDeletingRound(r)}
                      >
                        삭제
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ))}
      </div>

      {renamingRound ? (
        <Dialog open onOpenChange={(v) => (v ? null : setRenamingRound(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>라운드 이름 수정</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="round-name">이름</Label>
              <Input
                id="round-name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder={`${renamingRound.round_number}차`}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenamingRound(null)}>
                취소
              </Button>
              <Button onClick={submitRename} disabled={renameRound.isPending}>
                저장
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {renamingSession ? (
        <Dialog open onOpenChange={(value) => (value ? null : setRenamingSession(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>세션명 수정</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="session-name">세션명</Label>
              <Input
                id="session-name"
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSessionRename();
                }}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenamingSession(null)}>
                취소
              </Button>
              <Button
                onClick={submitSessionRename}
                disabled={!sessionName.trim() || renameSession.isPending}
              >
                저장
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <AlertDialog open={!!deletingRound} onOpenChange={(v) => (v ? null : setDeletingRound(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              “
              {deletingRound?.name?.trim()
                ? deletingRound.name
                : `${deletingRound?.round_number}차`}
              ” 라운드를 삭제할까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              이 라운드에 속한 세션·체크리스트·검증 결과·스냅샷이 모두 함께 사라져요. 되돌릴 수
              없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deletingSession}
        onOpenChange={(v) => (v ? null : setDeletingSession(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>“{deletingSession?.name}” 검증 실행을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이 실행의 체크리스트·수집한 스냅샷/CSV·판정 결과·논의가 모두 함께 사라져요. 되돌릴 수
              없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSession}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        <RoundMetricCard
          label="검증 실행"
          value={summary.executed}
          sub="판정한 이벤트·어트리뷰트"
          tone="neutral"
        />
        <RoundMetricCard label="통과" value={summary.passed} sub="고유 대상 기준" tone="success" />
        <RoundMetricCard
          label="미확인 이슈"
          value={summary.unconfirmedIssues}
          sub="논의에 올리지 않은 오류"
          tone="danger"
        />
        <RoundMetricCard
          label="확인된 이슈"
          value={summary.confirmedIssues}
          sub="논의에 등록된 오류"
          tone="purple"
        />
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          title="아직 검증 실행이 없어요"
          description="아래에서 첫 검증 실행을 만들어보세요."
        />
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {sessions.map((s) => {
          const step = sessionSteps?.get(s.id) ?? 1;
          return (
            <div
              key={s.id}
              className="group relative rounded-[14px] border border-[#e3e8ef] bg-white hover:border-[#2b6a9c] hover:shadow-[0_2px_10px_rgba(28,36,49,0.06)]"
            >
              <Link
                from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId"
                to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId"
                params={(prev) => ({ ...prev, sessionId: s.id })}
                className="block p-4"
              >
                <div className="flex items-center justify-between pr-6">
                  <div>
                    <span className="text-[15px] font-semibold tracking-[-0.2px]">{s.name}</span>
                    <p className="mt-0.5 text-[11.5px] text-[#64748b]">
                      {channels.find((channel) => channel.id === s.qa_channel_id)?.name ??
                        "채널 미지정"}
                    </p>
                  </div>
                </div>
                <SessionProgressBar step={step} />
                <p className="mt-2 text-[11.5px] text-[#8b97a8]">
                  {step}/4 · {SESSION_STEP_LABELS[step - 1]} 단계
                </p>
              </Link>
              <div className="border-t border-[#eef1f5] px-4 py-2">
                <select
                  value={s.qa_channel_id ?? ""}
                  onChange={(event) =>
                    setSessionChannel.mutate(
                      { sessionId: s.id, channelId: event.target.value },
                      { onError: (error) => toast.error(errorMessage(error)) },
                    )
                  }
                  disabled={!editable || setSessionChannel.isPending}
                  className="w-full rounded-md border border-[#dbe2ea] bg-white px-2 py-1 text-[12px]"
                  aria-label={`${s.name} 검증 채널`}
                >
                  <option value="" disabled>
                    채널 미지정
                  </option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </div>
              {canDeleteRounds ? (
                <div className="absolute right-3 top-4 flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingSession(s);
                      setSessionName(s.name);
                    }}
                    aria-label={`${s.name} 세션명 수정`}
                    className="rounded-md p-1 text-[#8b97a8] hover:text-[#2b6a9c]"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingSession(s)}
                    aria-label={`${s.name} 검증 실행 삭제`}
                    className="rounded-md p-1 text-[#c3ccd8] hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        <NewSessionCard roundId={roundId} channels={channels} />
      </div>
    </div>
  );
}

function NewSessionCard({
  roundId,
  channels,
}: {
  roundId: string;
  channels: Array<{ id: string; name: string }>;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const createSession = useCreateQaSession(roundId);

  function submit() {
    if (!user || !name.trim() || !channelId) return;
    createSession.mutate(
      { userId: user.id, name: name.trim(), channelId },
      {
        onSuccess: () => setName(""),
        onError: (error) =>
          toast.error(errorMessage(error, "이 라운드에 같은 이름의 세션이 이미 있어요")),
      },
    );
  }

  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-[#c8d1dc] p-5 text-center text-[#64748b]">
      <select
        value={channelId}
        onChange={(event) => setChannelId(event.target.value)}
        className="w-full rounded-md border border-[#dbe2ea] bg-white px-2 py-1.5 text-[13.5px]"
      >
        <option value="">검증 채널 선택</option>
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.name}
          </option>
        ))}
      </select>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="기본 수집, 회원가입 시나리오"
        className="w-full rounded-md border border-[#dbe2ea] px-2 py-1.5 text-[13.5px]"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <button
        type="button"
        disabled={!user || !name.trim() || !channelId || createSession.isPending}
        onClick={submit}
        className="mt-1 text-[13.5px] hover:text-[#2b6a9c]"
      >
        + 새 검증 실행
      </button>
    </div>
  );
}
