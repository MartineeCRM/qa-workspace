import { Panel } from "@/components/app/layout-parts";
import { formatRawLogTime } from "@/lib/domain";
import { buildMergedTimeline } from "@/lib/qa-workflow";
import {
  useQaAttributeSnapshots,
  useQaChecklistItems,
  useQaRunEvents,
  type QaSession,
} from "@/lib/qa-rounds-queries";

export function QaSessionAnalysisPanel({ session }: { session: QaSession }) {
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const { data: snapshots = [] } = useQaAttributeSnapshots(session.id);
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const rows = buildMergedTimeline(runEvents, snapshots);

  return (
    <Panel
      title="병합 데이터셋"
      description="어트리뷰트 변화와 이벤트 로그를 시간순으로 합칩니다. 이 테이블이 모든 판정의 근거예요."
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5 px-5 py-4">
        {[
          { label: "병합 행", value: rows.length },
          { label: "어트리뷰트", value: snapshots.length },
          { label: "이벤트", value: runEvents.length },
          { label: "검증 대상", value: checklistItems.length },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[11px] border border-[#eef1f5] bg-[#fbfcfd] px-3.5 py-3.5"
          >
            <p className="text-[11.5px] text-[#8b97a8]">{stat.label}</p>
            <p className="text-xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[800px] grid-cols-[124px_124px_160px_minmax(340px,1fr)] gap-x-5 border-t bg-[#fbfcfd] px-5 py-2 text-xs font-medium text-[#64748b]">
          <span className="text-center">시각</span>
          <span className="text-center">출처</span>
          <span className="text-center">이름</span>
          <span className="pl-8">값/변화</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid min-w-[800px] grid-cols-[124px_124px_160px_minmax(340px,1fr)] gap-x-5 border-b border-[#f1f4f8] px-5 py-2.5 text-xs"
          >
            <span className="whitespace-nowrap text-center tabular-nums text-[#8b97a8]">
              {formatRawLogTime(row.occurredAt)}
            </span>
            <span className="text-center">
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  backgroundColor: row.source === "snapshot" ? "#fdecec" : "#eaf1f8",
                  color: row.source === "snapshot" ? "#dc2626" : "#2b6a9c",
                }}
              >
                {row.source === "snapshot" ? "어트리뷰트" : "이벤트"}
              </span>
            </span>
            <span className="mono-token truncate text-center">{row.name}</span>
            <span className="mono-token truncate pl-8">{row.change}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
