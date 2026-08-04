import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, formatDateTime } from "@/lib/domain";
import { parseRunEventsCsv } from "@/lib/run-events-csv";
import {
  useCaptureAttributeSnapshot,
  useEndQaSession,
  useQaAttributeSnapshots,
  useQaRunEvents,
  useUploadRunEventsLog,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import { useTaxonomyEvents } from "@/lib/queries";

type TimelineEntry = {
  key: string;
  time: string;
  title: string;
  desc: string;
  tag: "시작" | "스냅샷" | "CSV";
};

export function QaSessionCollectionPanel({
  projectId,
  session,
}: {
  projectId: string;
  session: QaSession;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [brazeId, setBrazeId] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: snapshots = [] } = useQaAttributeSnapshots(session.id);
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const capture = useCaptureAttributeSnapshot(session.id, projectId);
  const uploadLog = useUploadRunEventsLog(session.id);
  const endSession = useEndQaSession(session.qa_round_id);

  const eventByName = useMemo(() => new Map(events.map((e) => [e.technical_name, e])), [events]);

  const timeline: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [
      {
        key: "start",
        time: session.started_at,
        title: "세션 시작",
        desc: "",
        tag: "시작",
      },
      ...snapshots.map((s) => ({
        key: `snapshot:${s.id}`,
        time: s.captured_at ?? s.requested_at,
        title: `스냅샷 "${s.snapshot_name}"`,
        desc: s.payload ? `attribute ${Object.keys(s.payload).length}개` : "요청 중",
        tag: "스냅샷" as const,
      })),
    ];
    if (runEvents.length > 0) {
      const latestUploadTime = runEvents.reduce(
        (latest, event) => (event.created_at > latest ? event.created_at : latest),
        runEvents[0].created_at,
      );
      entries.push({
        key: "csv",
        time: latestUploadTime,
        title: "CSV 업로드",
        desc: `${runEvents.length}행`,
        tag: "CSV",
      });
    }
    return entries.sort((a, b) => a.time.localeCompare(b.time));
  }, [session, snapshots, runEvents]);

  function handleCapture() {
    if (!brazeId.trim() || !snapshotName.trim()) return;
    capture.mutate(
      { brazeId: brazeId.trim(), snapshotName: snapshotName.trim() },
      {
        onSuccess: () => {
          toast.success("스냅샷을 저장했어요");
          setSnapshotName("");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

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
      toast.success("CSV를 업로드했어요");
    } catch (error) {
      toast.error(errorMessage(error, "CSV 업로드에 실패했어요"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Panel
      title="수집 타임라인"
      description="attribute가 바뀌었을 시점마다 스냅샷을 찍고, 활동 로그 CSV를 올리세요. CSV는 여러 번 나눠 올리고 그때마다 다시 분석해도 돼요."
    >
      <div className="flex flex-wrap gap-3 border-b border-[#eef1f5] bg-[#fbfcfd] px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#e3e8ef] bg-white px-2.5 py-1.5">
          <span className="mr-0.5 text-[11px] font-semibold text-[#8b97a8]">스냅샷</span>
          <Input
            value={brazeId}
            onChange={(e) => setBrazeId(e.target.value)}
            placeholder="braze_id"
            className="h-8 w-32"
          />
          <Input
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="스냅샷 이름"
            className="h-8 w-40"
          />
          <Button size="sm" variant="outline" onClick={handleCapture} disabled={capture.isPending}>
            스냅샷 찍기
          </Button>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-[#e3e8ef] bg-white px-2.5 py-1.5">
          <span className="mr-0.5 text-[11px] font-semibold text-[#8b97a8]">CSV</span>
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            CSV 업로드
          </Button>
        </div>
      </div>

      <ul className="px-5 py-4">
        {timeline.map((entry, index) => (
          <li
            key={entry.key}
            className="grid grid-cols-[78px_20px_minmax(0,1fr)_auto] gap-3.5 py-3"
          >
            <span className="text-xs tabular-nums text-[#8b97a8]">
              {formatDateTime(entry.time)}
            </span>
            <span className="flex flex-col items-center">
              <span
                className="size-[9px] rounded-full"
                style={{
                  backgroundColor:
                    entry.tag === "스냅샷"
                      ? "#5b5fc7"
                      : entry.tag === "CSV"
                        ? "#2b6a9c"
                        : "#94a3b8",
                }}
              />
              {index < timeline.length - 1 ? (
                <span className="mt-1 h-full w-px bg-[#e8edf3]" />
              ) : null}
            </span>
            <span>
              <span className="text-[13.5px] font-semibold">{entry.title}</span>
              {entry.desc ? (
                <span className="block text-xs text-[#8b97a8]">{entry.desc}</span>
              ) : null}
            </span>
            <span
              className="h-fit rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor:
                  entry.tag === "스냅샷" ? "#eef0fb" : entry.tag === "CSV" ? "#eaf1f8" : "#f1f4f8",
                color:
                  entry.tag === "스냅샷" ? "#5b5fc7" : entry.tag === "CSV" ? "#2b6a9c" : "#64748b",
              }}
            >
              {entry.tag}
            </span>
          </li>
        ))}
      </ul>
      <div className="px-5 pb-4">
        <Button
          className="w-full bg-[#1c2431] hover:bg-[#2c3648]"
          disabled={runEvents.length === 0 || endSession.isPending || Boolean(session.ended_at)}
          onClick={() =>
            endSession.mutate(session.id, {
              onSuccess: () => toast.success("수집을 완료로 표시했어요"),
            })
          }
        >
          {session.ended_at ? "수집 완료 표시됨" : "수집 완료로 표시"}
        </Button>
        <p className="mt-1.5 text-center text-[11px] text-[#8b97a8]">
          분석은 CSV를 올리는 즉시 언제든 돌릴 수 있어요 — 이건 이 세션의 수집이 끝났다는 표시일
          뿐이에요.
        </p>
      </div>
    </Panel>
  );
}
