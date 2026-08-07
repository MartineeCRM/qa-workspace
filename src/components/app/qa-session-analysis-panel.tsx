import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileUp, SearchCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage, formatMergedTimelineTime } from "@/lib/domain";
import { parseRunEventsCsv } from "@/lib/run-events-csv";
import { buildMergedTimeline, unexpectedSnapshotAttributeIds } from "@/lib/qa-workflow";
import {
  useAddChecklistItems,
  useQaAttributeSnapshots,
  useQaChecklistItems,
  useQaRunEvents,
  useUploadRunEventsLog,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import { useTaxonomyCustomAttributes, useTaxonomyEvents } from "@/lib/queries";

export function QaSessionAnalysisPanel({
  projectId,
  session,
  analyzing,
  analysisProgress,
  onAnalyze,
}: {
  projectId: string;
  session: QaSession;
  analyzing: boolean;
  analysisProgress?: { completed: number; total: number };
  onAnalyze: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: attributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const { data: snapshots = [] } = useQaAttributeSnapshots(session.id);
  const { data: items = [] } = useQaChecklistItems(session.id);
  const uploadLog = useUploadRunEventsLog(session.id);
  const addItems = useAddChecklistItems(session.id);
  const eventByName = useMemo(
    () => new Map(events.map((event) => [event.technical_name, event])),
    [events],
  );
  const collectedEventIds = new Set(
    runEvents.flatMap((event) => (event.event_id ? [event.event_id] : [])),
  );
  const executedEventItems = items.filter(
    (item) => item.target_type === "event" && item.executed_at,
  );
  const hasEventCsv = runEvents.length > 0;
  const collectedItems = executedEventItems.filter((item) => collectedEventIds.has(item.target_id));
  const missingItems = hasEventCsv
    ? executedEventItems.filter((item) => !collectedEventIds.has(item.target_id))
    : [];
  const unexpectedEventIds = Array.from(
    new Set(
      runEvents
        .filter(
          (event) =>
            event.event_id && !executedEventItems.some((item) => item.target_id === event.event_id),
        )
        .flatMap((event) => (event.event_id ? [event.event_id] : [])),
    ),
  );
  const unexpectedEvents = unexpectedEventIds.map((eventId) => eventName(eventId));
  const unexpectedAttributes = unexpectedSnapshotAttributeIds({
    snapshots,
    attributes,
    checklistItems: items,
  }).flatMap((attributeId) => {
    const attribute = attributes.find((candidate) => candidate.id === attributeId);
    return attribute ? [attribute] : [];
  });
  const rows = buildMergedTimeline(runEvents, snapshots);

  function eventName(eventId: string) {
    return events.find((event) => event.id === eventId)?.technical_name ?? eventId;
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const parsedRows = parseRunEventsCsv(await file.text());
      await uploadLog.mutateAsync(
        parsedRows.map((row) => ({
          ...row,
          event_id: eventByName.get(row.raw_event_name)?.id ?? null,
        })),
      );
      toast.success(`${parsedRows.length}행을 업로드하고 실행 기록과 대조했어요`);
    } catch (error) {
      toast.error(errorMessage(error, "CSV 업로드에 실패했어요"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addAllUnexpectedItems() {
    try {
      await addItems.mutateAsync({
        eventIds: unexpectedEventIds,
        customAttributeIds: unexpectedAttributes.map((attribute) => attribute.id),
      });
      toast.success(
        `이벤트 ${unexpectedEventIds.length}개와 어트리뷰트 ${unexpectedAttributes.length}개를 이번 검증에 추가했어요`,
      );
    } catch (error) {
      toast.error(errorMessage(error, "발견된 항목을 추가하지 못했어요"));
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#dfe5ec] bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf3] px-5 py-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.12em] text-[#64748b] uppercase">
              이벤트 로그
            </p>
            <h3 className="mt-1 text-[17px] font-bold">CSV를 올려 실행 기록과 대조하세요</h3>
            <p className="mt-1 text-xs text-[#7b8798]">
              Event User Log 반영이 늦을 수 있으므로 미수집 후보는 다시 확인한 뒤 분석하세요.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <FileUp className="size-4" />
            {runEvents.length > 0 ? "CSV 추가 업로드" : "CSV 업로드"}
          </Button>
        </header>

        <div className="grid gap-3 p-5 md:grid-cols-3">
          <StatusCard tone="success" label="수집 확인" value={collectedItems.length} />
          <StatusCard tone="warning" label="미수집 후보" value={missingItems.length} />
          <StatusCard
            tone="neutral"
            label="추가 수집"
            value={unexpectedEvents.length + unexpectedAttributes.length}
          />
        </div>

        {unexpectedEvents.length + unexpectedAttributes.length > 0 ? (
          <div className="mx-5 mb-5 rounded-xl border border-[#cfd9e6] bg-[#f5f8fb] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-[#263547]">
                  체크하지 않은 항목 {unexpectedEvents.length + unexpectedAttributes.length}개를
                  발견했어요
                </p>
                <p className="mt-0.5 text-xs text-[#6f7f91]">
                  이벤트 {unexpectedEvents.length}개 · 어트리뷰트 {unexpectedAttributes.length}개
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => void addAllUnexpectedItems()}
                disabled={addItems.isPending}
              >
                모두 이번 검증에 추가
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DiscoveredItemList title="이벤트" items={unexpectedEvents} />
              <DiscoveredItemList
                title="어트리뷰트"
                items={unexpectedAttributes.map((attribute) => attribute.technical_name)}
              />
            </div>
          </div>
        ) : null}

        {missingItems.length > 0 ? (
          <div className="mx-5 mb-5 rounded-xl border border-[#f0d8a8] bg-[#fffaf0] p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#b45309]" />
              <div>
                <p className="text-[13px] font-semibold text-[#7c3f0c]">
                  실행했지만 CSV에서 찾지 못한 이벤트가 있어요
                </p>
                <p className="mt-1 text-xs leading-5 text-[#8a5a24]">
                  CSV에 아직 반영되지 않았을 수 있어요. Event User Log에서 다시 확인한 뒤 CSV를
                  추가로 업로드해주세요. 그대로 분석하면 미발생으로 판정합니다.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {missingItems.map((item) => (
                    <span
                      key={item.id}
                      className="mono-token rounded-md border border-[#ecd6aa] bg-white px-2 py-1 text-[11.5px] text-[#7c3f0c]"
                    >
                      {eventName(item.target_id)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#dfe5ec] bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf3] px-5 py-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.12em] text-[#64748b] uppercase">
              분석 준비
            </p>
            <h3 className="mt-1 text-[17px] font-bold">수집 데이터 미리보기</h3>
            <p className="mt-1 text-xs text-[#7b8798]">
              이벤트 {runEvents.length}행 · 어트리뷰트 스냅샷 {snapshots.length}개 · 검증 대상{" "}
              {items.length}개
            </p>
          </div>
          <Button
            onClick={onAnalyze}
            disabled={
              analyzing || items.length === 0 || (executedEventItems.length > 0 && !hasEventCsv)
            }
          >
            <SearchCheck className="size-4" />
            {analyzing ? "분석 중" : "검증 결과 분석"}
          </Button>
        </header>

        {analysisProgress ? (
          <div className="border-b border-[#e8edf3] bg-[#f7f8fc] px-5 py-4">
            <div className="mb-2 flex justify-between text-xs font-semibold text-[#4b4f8a]">
              <span>규칙·AI 분석 진행 중</span>
              <span>
                {analysisProgress.completed}/{analysisProgress.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#e2e5f4]">
              <div
                className="h-full rounded-full bg-[#5b5fc7] transition-[width] duration-300"
                style={{ width: `${(analysisProgress.completed / analysisProgress.total) * 100}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="max-h-[360px] overflow-auto">
          <div className="grid min-w-[760px] grid-cols-[150px_110px_180px_minmax(300px,1fr)] gap-4 bg-[#f8fafc] px-5 py-2 text-[11.5px] font-semibold text-[#64748b]">
            <span>시각</span>
            <span>출처</span>
            <span>이름</span>
            <span>값/변화</span>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[#8b97a8]">
              아직 수집된 이벤트나 스냅샷이 없어요.
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.key}
                className="grid min-w-[760px] grid-cols-[150px_110px_180px_minmax(300px,1fr)] gap-4 border-t border-[#eef1f5] px-5 py-2.5 text-xs"
              >
                <span className="whitespace-nowrap text-[#8b97a8]">
                  {formatMergedTimelineTime(row.source, row.occurredAt)}
                </span>
                <span>{row.source === "snapshot" ? "어트리뷰트" : "이벤트"}</span>
                <span className="mono-token truncate">{row.name}</span>
                <span className="mono-token truncate text-[#475569]">{row.change}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function DiscoveredItemList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#dce4ed] bg-white">
      <p className="border-b border-[#e8edf3] px-3 py-2 text-xs font-semibold text-[#526174]">
        {title} {items.length}개
      </p>
      <ul className="max-h-44 overflow-y-auto p-2">
        {items.length === 0 ? (
          <li className="px-1 py-2 text-xs text-[#94a3b8]">발견된 항목이 없어요.</li>
        ) : (
          items.map((item) => (
            <li
              key={item}
              title={item}
              className="mono-token truncate rounded-md px-2 py-1.5 text-xs text-[#354255] odd:bg-[#f7f9fb]"
            >
              {item}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function StatusCard({
  tone,
  label,
  value,
}: {
  tone: "success" | "warning" | "neutral";
  label: string;
  value: number;
}) {
  const style =
    tone === "success"
      ? "border-[#cfe8d8] bg-[#f4faf6] text-[#15803d]"
      : tone === "warning"
        ? "border-[#f0d8a8] bg-[#fffaf0] text-[#a4550a]"
        : "border-[#dfe5ec] bg-[#f8fafc] text-[#475569]";
  return (
    <div className={`rounded-xl border px-4 py-3 ${style}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        {tone === "success" ? <Check className="size-3.5" /> : null}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
