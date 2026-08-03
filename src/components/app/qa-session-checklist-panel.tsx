import { useMemo, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Panel } from "@/components/app/layout-parts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { errorMessage } from "@/lib/domain";
import { cn } from "@/lib/utils";
import {
  useAddChecklistItems,
  useAdoptCarryOverItems,
  usePendingCarryOverItems,
  useQaChecklistItems,
  useQaRounds,
  useRemoveChecklistItem,
  useResetChecklist,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import {
  useTaxonomyCustomAttributes,
  useTaxonomyEvents,
  type TaxonomyCustomAttribute,
  type TaxonomyEvent,
} from "@/lib/queries";

type SearchTarget =
  | { kind: "event"; id: string; label: string; sub: string | null }
  | { kind: "custom_attribute"; id: string; label: string; sub: string | null };

function SourceBadge({ carried }: { carried: boolean }) {
  return carried ? (
    <span className="inline-flex items-center rounded-full border border-[#d9dcf3] bg-[#eef0fb] px-2 py-0.5 text-[11px] font-semibold text-[#5b5fc7]">
      이월
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-[#e3e8ef] bg-[#f1f4f8] px-2 py-0.5 text-[11px] font-semibold text-[#8b97a8]">
      신규
    </span>
  );
}

export function QaSessionChecklistPanel({
  projectId,
  environmentId,
  session,
}: {
  projectId: string;
  environmentId: string;
  session: QaSession;
}) {
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const { data: rounds = [] } = useQaRounds(environmentId);
  const round = rounds.find((r) => r.id === session.qa_round_id);
  const { data: pendingCarryOver = [] } = usePendingCarryOverItems(
    session.id,
    round?.previous_round_id ?? null,
  );
  const adoptCarryOver = useAdoptCarryOverItems(session.id);
  const addItems = useAddChecklistItems(session.id);
  const removeItem = useRemoveChecklistItem(session.id);
  const resetChecklist = useResetChecklist(session.id);
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<SearchTarget[]>([]);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const existingKeys = useMemo(
    () => new Set(checklistItems.map((i) => `${i.target_type}:${i.target_id}`)),
    [checklistItems],
  );
  const stagedKeys = useMemo(() => new Set(staged.map((t) => `${t.kind}:${t.id}`)), [staged]);

  const availableTargets: SearchTarget[] = useMemo(() => {
    const eventTargets: SearchTarget[] = events.map((e: TaxonomyEvent) => ({
      kind: "event",
      id: e.id,
      label: e.technical_name,
      sub: e.display_name ?? null,
    }));
    const attrTargets: SearchTarget[] = customAttributes.map((a: TaxonomyCustomAttribute) => ({
      kind: "custom_attribute",
      id: a.id,
      label: a.technical_name,
      sub: a.display_name ?? null,
    }));
    // Staged targets stay in the list (not filtered out) so the dropdown can show
    // them checked and let a click there un-stage them too.
    return [...eventTargets, ...attrTargets].filter((t) => !existingKeys.has(`${t.kind}:${t.id}`));
  }, [events, customAttributes, existingKeys]);

  const searchTargets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return availableTargets.filter(
      (t) => t.label.toLowerCase().includes(q) || (t.sub ?? "").toLowerCase().includes(q),
    );
  }, [search, availableTargets]);

  function toggleStage(target: SearchTarget) {
    setStaged((prev) =>
      prev.some((t) => t.kind === target.kind && t.id === target.id)
        ? prev.filter((t) => !(t.kind === target.kind && t.id === target.id))
        : [...prev, target],
    );
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || searchTargets.length === 0) return;
    e.preventDefault();
    toggleStage(searchTargets[0]);
  }

  // Lets a QA lead paste a newline-separated list (e.g. copied straight out of a
  // spec spreadsheet) and stage every line that matches a taxonomy name at once,
  // instead of searching and checking each one individually.
  function handleSearchPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n")) return; // single value: let it paste into the search box as usual

    e.preventDefault();
    const lines = Array.from(
      new Set(
        text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    );

    const matched: SearchTarget[] = [];
    for (const line of lines) {
      const q = line.toLowerCase();
      const hit =
        availableTargets.find((t) => t.label.toLowerCase() === q) ??
        availableTargets.find((t) => t.label.toLowerCase().includes(q));
      if (hit && !matched.some((m) => m.kind === hit.kind && m.id === hit.id)) {
        matched.push(hit);
      }
    }

    if (matched.length === 0) {
      toast.error("붙여넣은 텍스트와 일치하는 항목을 못 찾았어요");
      return;
    }

    setStaged((prev) => {
      const seen = new Set(prev.map((t) => `${t.kind}:${t.id}`));
      return [...prev, ...matched.filter((t) => !seen.has(`${t.kind}:${t.id}`))];
    });
    setSearch("");
    toast.success(
      lines.length > matched.length
        ? `${matched.length}개 선택했어요 (${lines.length - matched.length}개는 못 찾음)`
        : `${matched.length}개 선택했어요`,
    );
  }

  function commitAdd(targets: SearchTarget[]) {
    const eventIds = targets.filter((t) => t.kind === "event").map((t) => t.id);
    const customAttributeIds = targets
      .filter((t) => t.kind === "custom_attribute")
      .map((t) => t.id);
    if (eventIds.length === 0 && customAttributeIds.length === 0) return;
    addItems.mutate(
      { eventIds, customAttributeIds },
      { onError: (error) => toast.error(error instanceof Error ? error.message : String(error)) },
    );
  }

  function confirmReset() {
    resetChecklist.mutate(undefined, {
      onError: (error) => toast.error(errorMessage(error)),
      onSuccess: () => {
        toast.success("체크리스트를 초기화했어요");
        setConfirmingReset(false);
      },
    });
  }

  function itemLabel(targetType: "event" | "custom_attribute", targetId: string): string {
    const label =
      targetType === "event"
        ? events.find((e: TaxonomyEvent) => e.id === targetId)?.technical_name
        : customAttributes.find((a: TaxonomyCustomAttribute) => a.id === targetId)?.technical_name;
    return label ?? targetId;
  }

  return (
    <Panel
      title="이번 세션에서 검증할 항목"
      description={
        <>
          택소노미 전체가 아니라{" "}
          <span className="font-semibold text-[#2b6a9c]">여기 담은 항목만</span> 판정됩니다. 지난
          라운드에서 이월된 항목은 자동으로 담겨요.
        </>
      }
      actions={
        <Button
          size="sm"
          variant="outline"
          disabled={checklistItems.length === 0}
          onClick={() => setConfirmingReset(true)}
        >
          체크리스트 초기화
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 bg-[#fbfcfd] px-5 py-3.5">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          onPaste={handleSearchPaste}
          placeholder="이벤트·attribute 이름 검색 후 엔터 (줄바꿈 텍스트 붙여넣기도 가능)"
          className="min-w-[220px] flex-1"
        />
        {pendingCarryOver.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => adoptCarryOver.mutate(pendingCarryOver)}
            disabled={adoptCarryOver.isPending}
          >
            {round?.round_number}차 이월 항목 담기 ({pendingCarryOver.length})
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => commitAdd(availableTargets)}>
          택소노미 전체 추가
        </Button>
      </div>

      {search.trim() ? (
        searchTargets.length === 0 ? (
          <p className="border-b px-5 py-3 text-[12.5px] text-[#8b97a8]">일치하는 항목이 없어요.</p>
        ) : (
          <ul className="max-h-64 divide-y overflow-y-auto border-b">
            {searchTargets.map((t) => {
              const checked = stagedKeys.has(`${t.kind}:${t.id}`);
              return (
                <li key={`${t.kind}:${t.id}`}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-5 py-2 hover:bg-[#f7f9fc]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStage(t)}
                      className="size-4 shrink-0"
                    />
                    <span className="mono-token min-w-0 flex-1 truncate text-[13px]">
                      {t.label}
                    </span>
                    {t.sub ? (
                      <span className="truncate text-[11.5px] text-[#8b97a8]">{t.sub}</span>
                    ) : null}
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        t.kind === "event"
                          ? "bg-[#eaf1f8] text-[#2b6a9c]"
                          : "bg-[#eef0fb] text-[#5b5fc7]",
                      )}
                    >
                      {t.kind === "event" ? "이벤트" : "attribute"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {staged.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          {staged.map((t) => (
            <span
              key={`${t.kind}:${t.id}`}
              className="flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-xs"
            >
              <span className="mono-token">{t.label}</span>
              <button
                type="button"
                onClick={() => setStaged((prev) => prev.filter((s) => s.id !== t.id))}
                aria-label={`${t.label} 빼기`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <Button
            size="sm"
            onClick={() => {
              commitAdd(staged);
              setStaged([]);
            }}
          >
            이렇게만 검증
          </Button>
        </div>
      ) : null}

      {checklistItems.length === 0 ? (
        <EmptyState
          title="이 세션엔 체크리스트 항목이 없어요"
          description="위에서 검색해 추가해보세요."
        />
      ) : (
        <ul>
          {checklistItems.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_90px_130px_100px_28px] items-center gap-3 border-b border-[#f1f4f8] px-5 py-[11px]"
            >
              <span className="mono-token truncate text-[13px]">
                {itemLabel(item.target_type, item.target_id)}
              </span>
              <span className="text-xs text-[#64748b]">
                {item.target_type === "event" ? "이벤트" : "속성"}
              </span>
              <span className="truncate text-[11.5px] text-[#8b97a8]">—</span>
              <SourceBadge carried={Boolean(item.carried_from_item_id)} />
              <button
                type="button"
                onClick={() => removeItem.mutate(item.id)}
                aria-label="체크리스트에서 제거"
                className="text-[#c3ccd8] hover:text-[#64748b]"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-5 py-3 text-[12.5px] text-[#8b97a8]">{checklistItems.length}개 담김</p>

      <AlertDialog open={confirmingReset} onOpenChange={setConfirmingReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>체크리스트를 초기화할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              담긴 항목 {checklistItems.length}개가 모두 빠지고, 이미 판정된 결과·논의가 있다면
              함께 사라져요. 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset} disabled={resetChecklist.isPending}>
              초기화
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
