import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader, Panel, EmptyState } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { useEnvironments, useTaxonomyCustomAttributes, useTaxonomyEvents } from "@/lib/queries";
import {
  useCreateQaRound,
  useCreateQaSession,
  useOverrideChecklistResult,
  useQaChecklistItems,
  useQaRounds,
  useQaSessions,
} from "@/lib/qa-rounds-queries";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/rounds")({
  component: RoundsPage,
});

function RoundsPage() {
  const { projectId, stageSlug } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/rounds",
  });
  const { user } = useAuth();
  const { data: environments = [] } = useEnvironments(projectId);
  const environment = environments.find((e) => e.slug === stageSlug);
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: rounds = [] } = useQaRounds(environment?.id ?? "");
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const activeRoundId = selectedRoundId ?? rounds[0]?.id ?? "";
  const { data: checklistItems = [] } = useQaChecklistItems(activeRoundId);
  const { data: sessions = [] } = useQaSessions(activeRoundId);
  const createRound = useCreateQaRound(projectId, environment?.id ?? "");
  const createSession = useCreateQaSession(activeRoundId);
  const override = useOverrideChecklistResult();
  const [sessionName, setSessionName] = useState("");

  if (!environment) return null;

  function handleCreateSession() {
    if (!user || !sessionName.trim()) return;
    createSession.mutate({ userId: user.id, name: sessionName.trim() });
    setSessionName("");
  }

  function handleCreateRound() {
    if (!user) return;
    const latestRound = rounds[0];
    const isFirstRound = !latestRound;
    const eventIds = isFirstRound ? events.map((e) => e.id) : [];
    const customAttributeIds = isFirstRound ? customAttributes.map((a) => a.id) : [];
    createRound.mutate({
      userId: user.id,
      previousRoundId: latestRound?.id ?? null,
      eventIds,
      customAttributeIds,
    });
  }

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        title={`${environment.name} QA 라운드`}
        description="1차는 전체 검증, 이후 차수는 이전 차수의 실패·미수집 항목만 자동으로 승계돼요."
        actions={
          <Button onClick={handleCreateRound} disabled={createRound.isPending}>
            새 라운드 시작
          </Button>
        }
      />

      {rounds.length === 0 ? (
        <EmptyState
          title="아직 라운드가 없어요"
          description="새 라운드를 시작하면 체크리스트가 자동으로 채워져요."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {rounds.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRoundId(r.id)}
                className={`rounded-md border px-3 py-1 text-sm ${
                  r.id === activeRoundId ? "bg-muted font-medium" : "text-muted-foreground"
                }`}
              >
                {r.round_number}차
              </button>
            ))}
          </div>

          <Panel
            title="세션"
            description="라운드 안의 실행 단위예요. 세션 하나가 행동+스냅샷 캡처 → CSV 업로드 → 시간순 검증까지의 한 사이클이에요."
          >
            <div className="space-y-3 px-4 py-4">
              <div className="flex gap-2">
                <Input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="예: 장바구니, 구매, 기타 오류사항 검증"
                  className="max-w-xs"
                />
                <Button
                  size="sm"
                  onClick={handleCreateSession}
                  disabled={createSession.isPending || !sessionName.trim()}
                >
                  세션 시작
                </Button>
              </div>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">아직 이 라운드에 세션이 없어요.</p>
              ) : (
                <ul className="divide-y">
                  {sessions.map((s) => (
                    <li key={s.id} className="py-2 text-sm">
                      {s.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel
            title="체크리스트"
            description="이 라운드에서 검증할 이벤트·attribute와 판정 결과예요."
          >
            {checklistItems.length === 0 ? (
              <EmptyState title="이 라운드엔 체크리스트 항목이 없어요" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>대상</TableHead>
                    <TableHead>AI 판정</TableHead>
                    <TableHead>실패 원인</TableHead>
                    <TableHead>최종 상태</TableHead>
                    <TableHead className="text-right">액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checklistItems.map((item) => {
                    const result = item.qa_checklist_item_results?.[0];
                    const label =
                      item.target_type === "event"
                        ? events.find((e) => e.id === item.target_id)?.technical_name
                        : customAttributes.find((a) => a.id === item.target_id)?.technical_name;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="mono-token text-xs">
                          {label ?? item.target_id}
                        </TableCell>
                        <TableCell className="text-xs">{result?.ai_verdict ?? "미실행"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {result?.failed_layer ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {result?.final_status ?? "not_collected"}
                        </TableCell>
                        <TableCell className="text-right">
                          {result ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() =>
                                user &&
                                override.mutate({
                                  resultId: result.id,
                                  finalStatus: "failed",
                                  overriddenBy: user.id,
                                  overrideReason: "수동 검토 결과 오류로 재분류",
                                })
                              }
                            >
                              오류로 수정
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
