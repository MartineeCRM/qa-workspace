import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Clipboard, Upload } from "lucide-react";

import { EmptyState, Panel } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/domain";
import { parseRunEventsCsv } from "@/lib/run-events-csv";
import {
  useAnalyzeChecklist,
  useQaAttributeSnapshots,
  useQaRunEvents,
  useUploadRunEventsLog,
  type QaChecklistItem,
  type QaChecklistItemResult,
} from "@/lib/qa-rounds-queries";
import {
  useRules,
  type TaxonomyCustomAttribute,
  type TaxonomyEvent,
  type TaxonomyEventProperty,
} from "@/lib/queries";

type ChecklistItemWithResult = QaChecklistItem & {
  qa_checklist_item_results: QaChecklistItemResult[];
};

const LAYER_RANK: Record<string, number> = { none: 0, structural: 1, qualitative: 2 };

function layerOf(result: QaChecklistItemResult | undefined): "none" | "structural" | "qualitative" {
  if (!result || result.final_status !== "failed" || !result.failed_layer) return "none";
  return result.failed_layer === "structural" ? "structural" : "qualitative";
}

function itemLabel(
  item: QaChecklistItem,
  events: TaxonomyEvent[],
  customAttributes: TaxonomyCustomAttribute[],
): string {
  const label =
    item.target_type === "event"
      ? events.find((e) => e.id === item.target_id)?.technical_name
      : customAttributes.find((a) => a.id === item.target_id)?.technical_name;
  return label ?? item.target_id;
}

export function ResultPanel({
  sessionId,
  projectId,
  events,
  eventProperties,
  customAttributes,
  checklistItems,
}: {
  sessionId: string;
  projectId: string;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  customAttributes: TaxonomyCustomAttribute[];
  checklistItems: ChecklistItemWithResult[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"failed" | "passed">("failed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: runEvents = [] } = useQaRunEvents(sessionId);
  const { data: snapshots = [] } = useQaAttributeSnapshots(sessionId);
  const { data: rules = [] } = useRules(projectId);
  const uploadLog = useUploadRunEventsLog(sessionId);
  const analyze = useAnalyzeChecklist(sessionId);

  const eventByName = useMemo(() => new Map(events.map((e) => [e.technical_name, e])), [events]);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const parsedRows = parseRunEventsCsv(text);
      const rows = parsedRows.map((r) => ({
        ...r,
        event_id: eventByName.get(r.raw_event_name)?.id ?? null,
      }));
      await uploadLog.mutateAsync(rows);
      await analyze.mutateAsync({
        checklistItems,
        events,
        eventProperties,
        customAttributes,
        rules,
        runEvents: [...runEvents, ...rows],
        snapshots,
      });
      toast.success("로그를 업로드하고 판정을 완료했어요");
    } catch (error) {
      toast.error(errorMessage(error, "로그 처리에 실패했어요"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const failed = checklistItems.filter(
    (i) => (i.qa_checklist_item_results[0]?.final_status ?? "not_collected") !== "passed",
  );
  const passed = checklistItems.filter(
    (i) => i.qa_checklist_item_results[0]?.final_status === "passed",
  );
  const sortedFailed = [...failed].sort(
    (a, b) =>
      LAYER_RANK[layerOf(a.qa_checklist_item_results[0])] -
      LAYER_RANK[layerOf(b.qa_checklist_item_results[0])],
  );
  const visible = tab === "failed" ? sortedFailed : passed;
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0];
  const selectedResult = selected?.qa_checklist_item_results[0];

  function copyBundle(item: ChecklistItemWithResult) {
    const result = item.qa_checklist_item_results[0];
    const label = itemLabel(item, events, customAttributes);
    const bundle = [
      `항목: ${label}`,
      `상태: ${result?.final_status === "passed" ? "통과" : result?.final_status === "failed" ? "불합격" : "미수집"}`,
      result?.ai_reasoning ? `판단 이유: ${result.ai_reasoning}` : null,
      result?.ai_evidence ? `근거 로그:\n${JSON.stringify(result.ai_evidence, null, 2)}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    navigator.clipboard.writeText(bundle);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1400);
  }

  return (
    <Panel
      title="검증결과"
      description="로그를 올리면 존재·구조는 즉시, 규칙이 걸린 항목은 AI가 판정해요."
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> {busy ? "처리 중…" : "로그 업로드"}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <button
          type="button"
          onClick={() => setTab("failed")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "failed" ? "bg-destructive/10 text-destructive" : "text-muted-foreground"
          }`}
        >
          불합격 항목 <span className="ml-1 text-xs">{failed.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("passed")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "passed" ? "bg-published/40 text-published-foreground" : "text-muted-foreground"
          }`}
        >
          통과한 항목 <span className="ml-1 text-xs">{passed.length}</span>
        </button>
      </div>

      {checklistItems.length === 0 ? (
        <EmptyState title="체크리스트가 비어 있어요" description="먼저 위 체크리스트에 항목을 담아주세요." />
      ) : visible.length === 0 ? (
        <EmptyState
          title={tab === "failed" ? "불합격 항목이 없어요" : "통과한 항목이 없어요"}
          description="로그를 업로드하면 여기 채워져요."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[380px_1fr]">
          <ul className="divide-y border-r">
            {visible.map((item) => {
              const result = item.qa_checklist_item_results[0];
              const layer = layerOf(result);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm ${
                      selected?.id === item.id ? "bg-surface-strong/60" : "hover:bg-surface"
                    }`}
                  >
                    {layer !== "none" ? (
                      <span className="mono-token text-[10px] font-bold uppercase text-destructive">
                        {layer === "structural" ? "구조" : "의미"}
                      </span>
                    ) : null}
                    <span className="mono-token min-w-0 flex-1 truncate">
                      {itemLabel(item, events, customAttributes)}
                    </span>
                    <Pill>{result?.judged_by === "ai" ? "AI" : "RULE"}</Pill>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected ? (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono-token text-base font-semibold">
                  {itemLabel(selected, events, customAttributes)}
                </span>
                <Pill>{selectedResult?.final_status ?? "not_collected"}</Pill>
                <Pill>{selectedResult?.judged_by === "ai" ? "AI" : "RULE"}</Pill>
              </div>
              <p className="text-sm">{selectedResult?.ai_reasoning ?? "판단 이유가 없어요."}</p>
              <div className="relative overflow-hidden rounded-md bg-[#111113]">
                <button
                  type="button"
                  onClick={() => copyBundle(selected)}
                  className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs text-white/90 hover:bg-white/20"
                >
                  {copiedId === selected.id ? (
                    <>
                      <Check className="size-3.5" /> 복사됨
                    </>
                  ) : (
                    <>
                      <Clipboard className="size-3.5" /> 전체 복사
                    </>
                  )}
                </button>
                <pre className="mono-token overflow-x-auto p-4 text-xs text-white">
                  {JSON.stringify(selectedResult?.ai_evidence ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
