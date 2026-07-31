import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { EmptyState, Panel } from "@/components/app/layout-parts";
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
import {
  useTaxonomyCustomAttributes,
  useTaxonomyEvents,
  type TaxonomyCustomAttribute,
  type TaxonomyEvent,
} from "@/lib/queries";
import {
  useAddChecklistItems,
  useCaptureAttributeSnapshot,
  useCreateQaRound,
  useCreateQaSession,
  useOverrideChecklistResult,
  useQaAttributeSnapshots,
  useQaChecklistItems,
  useQaRounds,
  useQaSessions,
  useRemoveChecklistItem,
} from "@/lib/qa-rounds-queries";
import { toast } from "sonner";

type SearchTarget =
  | { kind: "event"; id: string; label: string; sub: string | null }
  | { kind: "custom_attribute"; id: string; label: string; sub: string | null };

export function QaRoundsPanel({
  projectId,
  environmentId,
  onActiveSessionChange,
}: {
  projectId: string;
  environmentId: string;
  onActiveSessionChange?: (sessionId: string) => void;
}) {
  const { user } = useAuth();
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: rounds = [] } = useQaRounds(environmentId);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const activeRoundId = selectedRoundId ?? rounds[0]?.id ?? "";
  const { data: sessions = [] } = useQaSessions(activeRoundId);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const activeSessionId = selectedSessionId ?? sessions[0]?.id ?? "";
  const { data: checklistItems = [] } = useQaChecklistItems(activeSessionId);
  const createRound = useCreateQaRound(projectId, environmentId);
  const createSession = useCreateQaSession(activeRoundId);
  const override = useOverrideChecklistResult();
  const [sessionName, setSessionName] = useState("");

  useEffect(() => {
    onActiveSessionChange?.(activeSessionId);
  }, [activeSessionId, onActiveSessionChange]);

  function handleCreateSession() {
    if (!user || !sessionName.trim()) return;
    createSession.mutate({ userId: user.id, name: sessionName.trim() });
    setSessionName("");
  }

  function handleCreateRound() {
    if (!user) return;
    const latestRound = rounds[0];
    createRound.mutate({ userId: user.id, previousRoundId: latestRound?.id ?? null });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          라운드마다 세션을 나눠서, 세션별로 이번엔 무엇을 검증할지 택소노미에서 골라요.
        </p>
        <Button size="sm" onClick={handleCreateRound} disabled={createRound.isPending}>
          새 라운드 시작
        </Button>
      </div>

      {rounds.length === 0 ? (
        <EmptyState
          title="아직 라운드가 없어요"
          description="새 라운드를 시작하고 세션을 만들면 체크리스트를 구성할 수 있어요."
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
                    <li key={s.id}>
                      <button
                        onClick={() => setSelectedSessionId(s.id)}
                        className={`w-full py-2 text-left text-sm ${
                          s.id === activeSessionId ? "font-medium" : "text-muted-foreground"
                        }`}
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          {activeSessionId ? (
            <ChecklistPanel
              sessionId={activeSessionId}
              events={events}
              customAttributes={customAttributes}
              checklistItems={checklistItems}
              userId={user?.id}
              onOverride={(resultId) =>
                user &&
                override.mutate({
                  resultId,
                  finalStatus: "failed",
                  overriddenBy: user.id,
                  overrideReason: "수동 검토 결과 오류로 재분류",
                })
              }
            />
          ) : (
            <Panel
              title="체크리스트"
              description="세션을 먼저 선택하거나 만들어야 체크리스트를 구성할 수 있어요."
            >
              <EmptyState
                title="선택된 세션이 없어요"
                description="위에서 세션을 만들거나 골라주세요."
              />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function ChecklistPanel({
  sessionId,
  events,
  customAttributes,
  checklistItems,
  userId,
  onOverride,
}: {
  sessionId: string;
  events: TaxonomyEvent[];
  customAttributes: TaxonomyCustomAttribute[];
  checklistItems: (import("@/lib/qa-rounds-queries").QaChecklistItem & {
    qa_checklist_item_results: import("@/lib/qa-rounds-queries").QaChecklistItemResult[];
  })[];
  userId: string | undefined;
  onOverride: (resultId: string) => void;
}) {
  const addItems = useAddChecklistItems(sessionId);
  const removeItem = useRemoveChecklistItem(sessionId);
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<SearchTarget[]>([]);

  const existingKeys = useMemo(
    () => new Set(checklistItems.map((i) => `${i.target_type}:${i.target_id}`)),
    [checklistItems],
  );
  const stagedKeys = useMemo(() => new Set(staged.map((t) => `${t.kind}:${t.id}`)), [staged]);

  const searchTargets: SearchTarget[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const eventTargets: SearchTarget[] = events.map((e) => ({
      kind: "event",
      id: e.id,
      label: e.technical_name,
      sub: e.display_name ?? null,
    }));
    const attrTargets: SearchTarget[] = customAttributes.map((a) => ({
      kind: "custom_attribute",
      id: a.id,
      label: a.technical_name,
      sub: a.display_name ?? null,
    }));
    const all = [...eventTargets, ...attrTargets].filter(
      (t) => !existingKeys.has(`${t.kind}:${t.id}`) && !stagedKeys.has(`${t.kind}:${t.id}`),
    );
    if (!q) return all;
    return all.filter(
      (t) => t.label.toLowerCase().includes(q) || (t.sub ?? "").toLowerCase().includes(q),
    );
  }, [search, events, customAttributes, existingKeys, stagedKeys]);

  function stageTarget(target: SearchTarget) {
    setStaged((prev) => [...prev, target]);
    setSearch("");
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (searchTargets.length === 0) return;
    stageTarget(searchTargets[0]);
  }

  function unstage(key: string) {
    setStaged((prev) => prev.filter((t) => `${t.kind}:${t.id}` !== key));
  }

  function commitAdd(targets: SearchTarget[]) {
    const eventIds = targets.filter((t) => t.kind === "event").map((t) => t.id);
    const customAttributeIds = targets
      .filter((t) => t.kind === "custom_attribute")
      .map((t) => t.id);
    if (eventIds.length === 0 && customAttributeIds.length === 0) return;
    addItems.mutate({ eventIds, customAttributeIds });
    setSearch("");
  }

  function handleConfirmStaged() {
    commitAdd(staged);
    setStaged([]);
  }

  function handleAddAll() {
    const eventTargets: SearchTarget[] = events.map((e) => ({
      kind: "event",
      id: e.id,
      label: e.technical_name,
      sub: null,
    }));
    const attrTargets: SearchTarget[] = customAttributes.map((a) => ({
      kind: "custom_attribute",
      id: a.id,
      label: a.technical_name,
      sub: null,
    }));
    commitAdd(
      [...eventTargets, ...attrTargets].filter((t) => !existingKeys.has(`${t.kind}:${t.id}`)),
    );
  }

  return (
    <Panel
      title="체크리스트"
      description="이번 세션에 검증할 이벤트·attribute를 택소노미에서 검색해 골라요."
    >
      <div className="space-y-4 px-4 py-4">
        <div className="rounded-md border p-3">
          <p className="text-xs font-medium">일부만 골라 추가하기</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            이름으로 검색하고 엔터를 누르면 아래 목록에 담겨요. 다 골랐으면 "이렇게만 검증"으로
            확정해요.
          </p>
          <div className="mt-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="이벤트·attribute 이름을 입력하고 엔터"
              className="max-w-xs"
            />
          </div>
          {search.trim() && searchTargets.length > 0 ? (
            <ul className="mt-2 max-h-40 divide-y overflow-y-auto rounded-md border">
              {searchTargets.slice(0, 20).map((t) => {
                const key = `${t.kind}:${t.id}`;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => stageTarget(t)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="text-xs text-muted-foreground">
                        {t.kind === "event" ? "이벤트" : "속성"}
                      </span>
                      <span className="mono-token text-xs">{t.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {staged.length > 0 ? (
            <div className="mt-3 space-y-2">
              <ul className="flex flex-wrap gap-1.5">
                {staged.map((t) => {
                  const key = `${t.kind}:${t.id}`;
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-1 rounded-full border bg-surface px-2 py-1 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {t.kind === "event" ? "이벤트" : "속성"}
                      </span>
                      <span className="mono-token">{t.label}</span>
                      <button
                        type="button"
                        onClick={() => unstage(key)}
                        aria-label={`${t.label} 빼기`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Button size="sm" onClick={handleConfirmStaged} disabled={addItems.isPending}>
                이렇게만 검증
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3">
          <div>
            <p className="text-xs font-medium">전체 한 번에 추가하기</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              검색·체크 없이 택소노미에 있는 이벤트·attribute를 통째로 넣어요.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleAddAll} disabled={addItems.isPending}>
            택소노미 전체 추가
          </Button>
        </div>
      </div>

      {checklistItems.length === 0 ? (
        <EmptyState
          title="이 세션엔 체크리스트 항목이 없어요"
          description="위에서 검색해 추가해보세요."
        />
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
                  <TableCell className="mono-token text-xs">{label ?? item.target_id}</TableCell>
                  <TableCell className="text-xs">{result?.ai_verdict ?? "미실행"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {result?.failed_layer ?? "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {result?.final_status ?? "not_collected"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {result ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => onOverride(result.id)}
                        >
                          오류로 수정
                        </Button>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="체크리스트에서 제거"
                        onClick={() => removeItem.mutate(item.id)}
                        disabled={!userId || removeItem.isPending}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

export function SnapshotPanel({ sessionId, projectId }: { sessionId: string; projectId: string }) {
  const { data: snapshots = [] } = useQaAttributeSnapshots(sessionId);
  const capture = useCaptureAttributeSnapshot(sessionId, projectId);
  const [brazeId, setBrazeId] = useState("");
  const [snapshotName, setSnapshotName] = useState("");

  function handleCapture() {
    if (!brazeId.trim() || !snapshotName.trim()) return;
    capture.mutate(
      { brazeId: brazeId.trim(), snapshotName: snapshotName.trim() },
      {
        onSuccess: () => {
          toast.success("스냅샷을 저장했어요");
          setSnapshotName("");
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
      },
    );
  }

  return (
    <Panel
      title="어트리뷰트 스냅샷"
      description="Braze에서 이 유저의 현재 attribute를 가져와 시점별로 저장해요."
    >
      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={brazeId}
            onChange={(e) => setBrazeId(e.target.value)}
            placeholder="braze_id"
            className="max-w-xs"
          />
          <Input
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="스냅샷 이름 (예: 장바구니 담기 전)"
            className="max-w-xs"
          />
          <Button
            size="sm"
            onClick={handleCapture}
            disabled={capture.isPending || !brazeId.trim() || !snapshotName.trim()}
          >
            스냅샷 찍기
          </Button>
        </div>

        {snapshots.length === 0 ? (
          <EmptyState title="아직 스냅샷이 없어요" description="위에서 캡처해보세요." />
        ) : (
          <ul className="divide-y rounded-md border">
            {snapshots.map((s) => (
              <li key={s.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.snapshot_name}</span>
                  <span className="mono-token text-xs text-muted-foreground">
                    {s.external_user_id}
                  </span>
                  <span
                    className={`text-xs ${
                      s.status === "captured"
                        ? "text-muted-foreground"
                        : s.status === "failed"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {s.status === "captured"
                      ? "캡처됨"
                      : s.status === "failed"
                        ? "실패"
                        : "요청 중"}
                  </span>
                </div>
                {s.payload ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      attribute {Object.keys(s.payload).length}개 보기
                    </summary>
                    <pre className="mt-1 max-h-56 overflow-auto rounded bg-surface-strong/40 p-2 text-xs">
                      {JSON.stringify(s.payload, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
