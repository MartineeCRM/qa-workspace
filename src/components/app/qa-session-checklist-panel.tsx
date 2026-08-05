import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock3, History, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { recommendAttributesForEvent } from "@/lib/attribute-recommendation.functions";
import { EmptyState } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, formatDateTime } from "@/lib/domain";
import { cn } from "@/lib/utils";
import {
  useAddChecklistItems,
  useAdoptCarryOverItems,
  useCaptureAttributeSnapshot,
  useMarkChecklistItemExecuted,
  usePendingCarryOverItems,
  useQaAttributeSnapshots,
  useQaChannelExclusions,
  useQaChecklistItems,
  useQaRounds,
  useRemoveChecklistItem,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import {
  useRules,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
} from "@/lib/queries";

type SuggestedAttribute = {
  attributeId: string;
  eventId: string;
  reason: string;
  source: "rule" | "ai";
};

const SNAPSHOT_DELAY_MS = 60_000;

export function QaSessionChecklistPanel({
  projectId,
  environmentId,
  session,
  onContinue,
}: {
  projectId: string;
  environmentId: string;
  session: QaSession;
  onContinue: () => void;
}) {
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: eventProperties = [] } = useTaxonomyEventProperties(projectId);
  const { data: attributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: rules = [] } = useRules(projectId);
  const { data: exclusions } = useQaChannelExclusions(
    events.map((event) => event.id),
    eventProperties.map((property) => property.id),
  );
  const { data: items = [] } = useQaChecklistItems(session.id);
  const { data: snapshots = [] } = useQaAttributeSnapshots(session.id);
  const { data: rounds = [] } = useQaRounds(environmentId);
  const round = rounds.find((candidate) => candidate.id === session.qa_round_id);
  const { data: pendingCarryOver = [] } = usePendingCarryOverItems(
    session.id,
    round?.previous_round_id ?? null,
    session.qa_channel_id,
  );
  const addItems = useAddChecklistItems(session.id);
  const removeItem = useRemoveChecklistItem(session.id);
  const markExecuted = useMarkChecklistItemExecuted(session.id);
  const adoptCarryOver = useAdoptCarryOverItems(session.id);
  const capture = useCaptureAttributeSnapshot(session.id, projectId);
  const [search, setSearch] = useState("");
  const [brazeId, setBrazeId] = useState("");
  const [now, setNow] = useState(Date.now());
  const [aiSuggestions, setAiSuggestions] = useState<SuggestedAttribute[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const requestedEvents = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const applicableEvents = useMemo(
    () =>
      session.qa_channel_id
        ? events.filter((event) => !exclusions?.events.has(`${event.id}:${session.qa_channel_id}`))
        : events,
    [events, exclusions, session.qa_channel_id],
  );
  const itemByKey = useMemo(
    () => new Map(items.map((item) => [`${item.target_type}:${item.target_id}`, item])),
    [items],
  );
  const executedEvents = items.filter((item) => item.target_type === "event" && item.executed_at);
  const boardItems = items.filter((item) => item.executed_at || item.carried_from_item_id);

  const ruleSuggestions = useMemo(() => {
    const suggestions: SuggestedAttribute[] = [];
    for (const item of executedEvents) {
      for (const rule of rules.filter((candidate) => candidate.is_enabled)) {
        const eventTargetIds = new Set(
          rule.validation_rule_targets.flatMap((target) => {
            if (target.target_type === "event") return [target.target_id];
            if (target.target_type !== "property") return [];
            const property = eventProperties.find((candidate) => candidate.id === target.target_id);
            return property ? [property.event_id] : [];
          }),
        );
        if (!eventTargetIds.has(item.target_id)) continue;
        for (const target of rule.validation_rule_targets) {
          if (target.target_type !== "custom_attribute") continue;
          suggestions.push({
            eventId: item.target_id,
            attributeId: target.target_id,
            reason: rule.description?.trim() || `${rule.name} 규칙에 함께 연결되어 있어요.`,
            source: "rule",
          });
        }
      }
    }
    return suggestions;
  }, [eventProperties, executedEvents, rules]);

  useEffect(() => {
    for (const item of executedEvents) {
      if (requestedEvents.current.has(item.target_id)) continue;
      requestedEvents.current.add(item.target_id);
      const event = events.find((candidate) => candidate.id === item.target_id);
      if (!event) continue;
      void recommendAttributesForEvent({
        data: {
          event: {
            id: event.id,
            technicalName: event.technical_name,
            displayName: event.display_name,
            description: event.description,
            triggerDescription: event.trigger_description,
          },
          attributes: attributes.map((attribute) => ({
            id: attribute.id,
            technicalName: attribute.technical_name,
            displayName: attribute.display_name,
            description: attribute.description,
          })),
        },
      })
        .then((recommendations) =>
          setAiSuggestions((previous) => [
            ...previous.filter((suggestion) => suggestion.eventId !== event.id),
            ...recommendations.map((recommendation) => ({
              ...recommendation,
              eventId: event.id,
              source: "ai" as const,
            })),
          ]),
        )
        .catch(() => undefined);
    }
  }, [attributes, events, executedEvents]);

  const suggestions = useMemo(() => {
    const byKey = new Map<string, SuggestedAttribute>();
    for (const suggestion of [...aiSuggestions, ...ruleSuggestions]) {
      const key = `${suggestion.eventId}:${suggestion.attributeId}`;
      if (!dismissed.has(key)) byKey.set(key, suggestion);
    }
    return [...byKey.values()];
  }, [aiSuggestions, dismissed, ruleSuggestions]);

  const q = search.trim().toLowerCase();
  const visibleEvents = applicableEvents.filter(
    (event) =>
      !q ||
      event.technical_name.toLowerCase().includes(q) ||
      (event.display_name ?? "").toLowerCase().includes(q),
  );
  const visibleAttributes = attributes.filter(
    (attribute) =>
      !q ||
      attribute.technical_name.toLowerCase().includes(q) ||
      (attribute.display_name ?? "").toLowerCase().includes(q),
  );

  function toggleTarget(targetType: "event" | "custom_attribute", targetId: string) {
    const existing = itemByKey.get(`${targetType}:${targetId}`);
    if (!existing) {
      addItems.mutate({
        eventIds: targetType === "event" ? [targetId] : [],
        customAttributeIds: targetType === "custom_attribute" ? [targetId] : [],
      });
      return;
    }
    if (!existing.executed_at) {
      markExecuted.mutate(existing.id);
      return;
    }
    removeItem.mutate(existing.id);
  }

  function captureAttribute(attributeId: string) {
    const attribute = attributes.find((candidate) => candidate.id === attributeId);
    if (!attribute) return;
    if (!brazeId.trim()) {
      toast.error("스냅샷을 촬영할 Braze ID를 먼저 입력해주세요");
      return;
    }
    capture.mutate(
      { brazeId: brazeId.trim(), snapshotName: `${attribute.technical_name} 확인` },
      {
        onError: (error) => toast.error(errorMessage(error)),
        onSuccess: () => {
          if (!itemByKey.has(`custom_attribute:${attribute.id}`)) {
            addItems.mutate({ eventIds: [], customAttributeIds: [attribute.id] });
          }
          toast.success(`${attribute.technical_name} 스냅샷을 저장했어요`);
        },
      },
    );
  }

  function recordAgain(itemId: string, eventId: string) {
    setDismissed(
      (previous) => new Set([...previous].filter((key) => !key.startsWith(`${eventId}:`))),
    );
    markExecuted.mutate(itemId, {
      onSuccess: () => toast.success("다시 실행한 시각을 기록했어요"),
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#dfe5ec] bg-white">
      <div className="grid min-h-[620px] lg:grid-cols-[minmax(330px,0.9fr)_minmax(430px,1.1fr)]">
        <section className="border-b border-[#e3e8ef] lg:border-r lg:border-b-0">
          <header className="border-b border-[#e8edf3] px-5 py-4">
            <p className="text-[11px] font-bold tracking-[0.12em] text-[#64748b] uppercase">
              택소노미
            </p>
            <h3 className="mt-1 text-[17px] font-bold">실행한 항목을 체크하세요</h3>
            <p className="mt-1 text-xs leading-5 text-[#7b8798]">
              앱에서 동작한 직후 체크하세요. 프로퍼티는 이벤트를 펼쳐 확인할 수 있어요.
            </p>
            <label className="mt-3 flex items-center gap-2 rounded-lg border border-[#dfe5ec] bg-[#fbfcfd] px-3">
              <Search className="size-4 text-[#94a3b8]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="이벤트·어트리뷰트 검색"
                className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </label>
          </header>

          <div className="max-h-[560px] overflow-y-auto">
            <p className="sticky top-0 z-10 border-b bg-[#f8fafc] px-5 py-2 text-[11px] font-bold text-[#64748b]">
              이벤트 {visibleEvents.length}
            </p>
            {visibleEvents.map((event) => {
              const item = itemByKey.get(`event:${event.id}`);
              const properties = eventProperties.filter(
                (property) => property.event_id === event.id && property.is_active,
              );
              return (
                <details key={event.id} className="group border-b border-[#eef1f5]">
                  <summary className="flex list-none items-center gap-3 px-5 py-3 hover:bg-[#f8fafc]">
                    <input
                      type="checkbox"
                      checked={Boolean(item?.executed_at)}
                      onClick={(clickEvent) => clickEvent.stopPropagation()}
                      onChange={() => toggleTarget("event", event.id)}
                      className="size-4 shrink-0 accent-[#1f5f8b]"
                      aria-label={`${event.technical_name} 실행 기록`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="mono-token block truncate text-[13px] font-semibold">
                        {event.technical_name}
                      </span>
                      {event.display_name ? (
                        <span className="block truncate text-[11.5px] text-[#8b97a8]">
                          {event.display_name}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[11px] text-[#94a3b8]">{properties.length}개</span>
                    <ChevronDown className="size-4 text-[#94a3b8] transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-[#eef1f5] bg-[#fbfcfd] px-5 py-3 pl-12">
                    {properties.length === 0 ? (
                      <p className="text-xs text-[#94a3b8]">등록된 프로퍼티가 없어요.</p>
                    ) : (
                      <ul className="space-y-2">
                        {properties.map((property) => (
                          <li key={property.id} className="flex items-center gap-2 text-xs">
                            <span className="mono-token min-w-0 flex-1 truncate">
                              {property.technical_name}
                            </span>
                            <span className="text-[#8b97a8]">{property.data_type}</span>
                            {property.is_required ? (
                              <span className="font-semibold text-[#b45309]">필수</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              );
            })}

            <p className="sticky top-0 z-10 border-y bg-[#f8fafc] px-5 py-2 text-[11px] font-bold text-[#64748b]">
              어트리뷰트 {visibleAttributes.length}
            </p>
            {visibleAttributes.map((attribute) => {
              const checked = Boolean(
                itemByKey.get(`custom_attribute:${attribute.id}`)?.executed_at,
              );
              return (
                <label
                  key={attribute.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-[#eef1f5] px-5 py-3 hover:bg-[#f8fafc]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTarget("custom_attribute", attribute.id)}
                    className="size-4 accent-[#5b5fc7]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mono-token block truncate text-[13px] font-semibold">
                      {attribute.technical_name}
                    </span>
                    <span className="text-[11.5px] text-[#8b97a8]">
                      {attribute.display_name ?? attribute.data_type}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="bg-[#fbfcfd]">
          <header className="border-b border-[#e8edf3] bg-white px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold tracking-[0.12em] text-[#2b6a9c] uppercase">
                  이번 검증
                </p>
                <h3 className="mt-1 text-[17px] font-bold">실행 기록과 스냅샷</h3>
              </div>
              {pendingCarryOver.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => adoptCarryOver.mutate(pendingCarryOver)}
                >
                  이월 항목 {pendingCarryOver.length}개 가져오기
                </Button>
              ) : null}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={brazeId}
                onChange={(event) => setBrazeId(event.target.value)}
                placeholder="스냅샷 촬영용 Braze ID"
                className="max-w-xs bg-[#fbfcfd]"
              />
              <span className="text-[11.5px] text-[#8b97a8]">이 세션에서 계속 사용해요.</span>
            </div>
          </header>

          <div className="space-y-3 p-5">
            {boardItems.length === 0 ? (
              <EmptyState
                title="아직 실행 기록이 없어요"
                description="왼쪽 택소노미에서 앱으로 실행한 이벤트를 체크하세요."
              />
            ) : (
              boardItems.map((item) => {
                const event = events.find((candidate) => candidate.id === item.target_id);
                const attribute = attributes.find((candidate) => candidate.id === item.target_id);
                const label =
                  item.target_type === "event" ? event?.technical_name : attribute?.technical_name;
                return (
                  <div key={item.id} className="rounded-xl border border-[#dfe5ec] bg-white p-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex size-6 items-center justify-center rounded-full",
                          item.executed_at
                            ? "bg-[#e8f5ec] text-[#15803d]"
                            : "bg-[#f1f4f8] text-[#94a3b8]",
                        )}
                      >
                        {item.executed_at ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Clock3 className="size-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="mono-token truncate text-[13.5px] font-semibold">
                            {label ?? item.target_id}
                          </span>
                          <span className="text-[11px] text-[#8b97a8]">
                            {item.target_type === "event" ? "이벤트" : "어트리뷰트"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#7b8798]">
                          {item.executed_at
                            ? `${formatDateTime(item.executed_at)} 실행 기록`
                            : "이월됨 · 실행했다면 왼쪽에서 체크하세요"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem.mutate(item.id)}
                        className="text-[#b3bdca] hover:text-[#64748b]"
                        aria-label={`${label ?? "항목"} 제거`}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    {item.target_type === "event" && item.executed_at ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 ml-9"
                        onClick={() => recordAgain(item.id, item.target_id)}
                        disabled={markExecuted.isPending}
                      >
                        다시 실행
                      </Button>
                    ) : null}
                    {item.target_type === "custom_attribute" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 ml-9"
                        onClick={() => captureAttribute(item.target_id)}
                        disabled={capture.isPending}
                      >
                        <History className="size-3.5" /> 스냅샷 촬영
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}

            {suggestions.map((suggestion) => {
              const eventItem = itemByKey.get(`event:${suggestion.eventId}`);
              const event = events.find((candidate) => candidate.id === suggestion.eventId);
              const attribute = attributes.find(
                (candidate) => candidate.id === suggestion.attributeId,
              );
              if (!eventItem?.executed_at || !attribute) return null;
              const readyAt = Date.parse(eventItem.executed_at) + SNAPSHOT_DELAY_MS;
              const remainingSeconds = Math.max(0, Math.ceil((readyAt - now) / 1_000));
              const capturedAfterExecution = snapshots.some(
                (snapshot) =>
                  snapshot.status === "captured" &&
                  Boolean(snapshot.captured_at) &&
                  Date.parse(snapshot.captured_at as string) >=
                    Date.parse(eventItem.executed_at as string) &&
                  Boolean(
                    snapshot.payload &&
                    suggestion.attributeId &&
                    attribute.technical_name in snapshot.payload,
                  ),
              );
              if (capturedAfterExecution) return null;
              const suggestionKey = `${suggestion.eventId}:${suggestion.attributeId}`;
              return (
                <div
                  key={suggestionKey}
                  className={cn(
                    "rounded-xl border p-4",
                    remainingSeconds > 0
                      ? "border-[#dfe5ec] bg-white"
                      : "border-[#c9ddee] bg-[#f3f8fc]",
                  )}
                >
                  <div className="flex gap-3">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e8f1f8] text-[#2b6a9c]">
                      <Sparkles className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono-token text-[13px] font-semibold">
                          {attribute.technical_name}
                        </span>
                        <span className="text-[10.5px] font-semibold text-[#2b6a9c]">
                          {suggestion.source === "rule" ? "검증 규칙" : "AI 추천"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#64748b]">{suggestion.reason}</p>
                      <p className="mt-1 text-[11.5px] text-[#8b97a8]">
                        {remainingSeconds > 0
                          ? `${event?.technical_name ?? "이벤트"} 반영 대기 중 · ${remainingSeconds}초 후 촬영 권장`
                          : "API에 반영됐을 가능성이 높아요. 지금 촬영하세요."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => captureAttribute(attribute.id)}
                          disabled={capture.isPending}
                        >
                          {remainingSeconds > 0 ? "지금 촬영" : "스냅샷 촬영"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDismissed((previous) => new Set(previous).add(suggestionKey))
                          }
                        >
                          이번에는 제외
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="sticky bottom-0 flex items-center justify-between border-t border-[#e3e8ef] bg-white px-5 py-4">
            <p className="text-xs text-[#7b8798]">
              실행 {executedEvents.length} · 스냅샷{" "}
              {snapshots.filter((snapshot) => snapshot.status === "captured").length}
            </p>
            <Button onClick={onContinue} disabled={executedEvents.length === 0}>
              분석으로 이동
            </Button>
          </footer>
        </section>
      </div>
    </div>
  );
}
