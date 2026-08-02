import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/layout-parts";
import { useAuth } from "@/lib/auth";
import {
  useCreateQaRound,
  useCreateQaSession,
  useQaRounds,
  useQaSessions,
} from "@/lib/qa-rounds-queries";

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
  projectId,
  environmentId,
  roundId,
}: {
  projectId: string;
  environmentId: string;
  roundId: string;
}) {
  const { user } = useAuth();
  const { data: rounds = [] } = useQaRounds(environmentId);
  const round = rounds.find((r) => r.id === roundId);
  const { data: sessions = [] } = useQaSessions(roundId);
  const createRound = useCreateQaRound(projectId, environmentId);
  const latestRound = rounds[rounds.length - 1];

  if (!round) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[21px] font-bold tracking-[-0.4px]">
            {round.name?.trim() ? round.name : `${round.round_number}차`} 라운드
          </h2>
          <p className="text-[13px] text-[#8b97a8]">
            세션 하나가 체크리스트 → 수집 → 분석 → 결과의 한 사이클이에요.
          </p>
        </div>
        <Button
          onClick={() =>
            user &&
            createRound.mutate({ userId: user.id, previousRoundId: latestRound?.id ?? null })
          }
          disabled={createRound.isPending}
        >
          + 새 라운드 시작
        </Button>
      </div>

      <div className="my-[18px] flex flex-wrap gap-2">
        {rounds.map((r) => (
          <Link
            key={r.id}
            from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId"
            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId"
            params={(prev) => ({ ...prev, roundId: r.id })}
            className={
              r.id === roundId
                ? "rounded-lg border border-[#1c2431] bg-[#1c2431] px-[13px] py-1.5 text-[13px] font-semibold text-white"
                : "rounded-lg border border-[#e3e8ef] bg-white px-[13px] py-1.5 text-[13px] font-medium text-[#64748b]"
            }
          >
            {r.name?.trim() ? r.name : `${r.round_number}차`}
          </Link>
        ))}
      </div>

      <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        <RoundMetricCard
          label="세션"
          value={sessions.length}
          sub={`수집 중 ${sessions.filter((s) => !s.ended_at).length} · 완료 ${sessions.filter((s) => s.ended_at).length}`}
          tone="neutral"
        />
      </div>

      {sessions.length === 0 ? (
        <EmptyState title="아직 세션이 없어요" description="아래에서 첫 세션을 만들어보세요." />
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {sessions.map((s) => (
          <Link
            key={s.id}
            from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId"
            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId"
            params={(prev) => ({ ...prev, sessionId: s.id })}
            className="rounded-[14px] border border-[#e3e8ef] bg-white p-4 hover:border-[#2b6a9c] hover:shadow-[0_2px_10px_rgba(28,36,49,0.06)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold tracking-[-0.2px]">{s.name}</span>
            </div>
            <SessionProgressBar step={s.ended_at ? 3 : 2} />
            <p className="mt-2 text-[11.5px] text-[#8b97a8]">
              {s.ended_at ? "3/4 · 분석 단계" : "2/4 · 수집 단계"}
            </p>
          </Link>
        ))}
        <NewSessionCard roundId={roundId} />
      </div>
    </div>
  );
}

function NewSessionCard({ roundId }: { roundId: string }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const createSession = useCreateQaSession(roundId);

  function submit() {
    if (!user || !name.trim()) return;
    createSession.mutate({ userId: user.id, name: name.trim() });
    setName("");
  }

  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-[#c8d1dc] p-5 text-center text-[#64748b]">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="장바구니 검증, AOS 검증처럼 자유롭게 그룹핑"
        className="w-full rounded-md border border-[#dbe2ea] px-2 py-1.5 text-[13.5px]"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <button
        type="button"
        disabled={!user || !name.trim() || createSession.isPending}
        onClick={submit}
        className="mt-1 text-[13.5px] hover:text-[#2b6a9c]"
      >
        + 새 세션
      </button>
    </div>
  );
}
