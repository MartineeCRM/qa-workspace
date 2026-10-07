import { Panel } from "@/components/app/layout-parts";

type RuleCounts = {
  required: number;
  undefined: number;
  type: number;
  format: number;
  aiPending: number;
  passed: number;
};

function AiSummaryText({ text }: { text: string }) {
  const sentences = text.split(/(?<=\.)\s+/).filter(Boolean);
  return (
    <div className="mt-3 space-y-1 text-pretty text-[13px] leading-[1.7] text-[#3c4757]">
      {sentences.map((sentence, sentenceIndex) => (
        <p key={sentenceIndex}>
          {sentence.split(/(`[^`]+`)/g).map((part, partIndex) =>
            part.startsWith("`") && part.endsWith("`") ? (
              <code key={partIndex} className="font-mono text-[12.5px]">
                {part.slice(1, -1)}
              </code>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </div>
  );
}

type ItemVerdictSummaryProps = {
  displayedVerdictLabel: string;
  displayedVerdictStyle: { fg: string; bg: string };
  ruleCounts: RuleCounts;
  aiSummary: string | null;
  aiRawResponse: string | null;
};

export function ItemVerdictSummary({
  displayedVerdictLabel,
  displayedVerdictStyle,
  ruleCounts,
  aiSummary,
  aiRawResponse,
}: ItemVerdictSummaryProps) {
  return (
    <Panel
      className="overflow-hidden"
      title={
        <span className="flex items-center gap-2.5">
          <span>판정 요약</span>
          <span
            className="rounded-full px-2.5 py-[3px] text-[11px] font-bold"
            style={{
              color: displayedVerdictStyle.fg,
              backgroundColor: displayedVerdictStyle.bg,
            }}
          >
            {displayedVerdictLabel}
          </span>
        </span>
      }
    >
      <div className="@container grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))]">
        <div className="border-b px-5 pb-[18px] pt-4 @[720px]:border-b-0 @[720px]:border-r">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-[2px] bg-[#8b97a8]" />
            <h4 className="text-[12.5px] font-bold">Rule based 분석</h4>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2">
            {[
              { label: "필수 누락", value: ruleCounts.required, color: "#dc2626" },
              { label: "미정의", value: ruleCounts.undefined, color: "#b45309" },
              { label: "타입", value: ruleCounts.type, color: "#dc2626" },
              { label: "형식·의미", value: ruleCounts.format, color: "#dc2626" },
              { label: "AI 확인 필요", value: ruleCounts.aiPending, color: "#2b6a9c" },
              { label: "통과", value: ruleCounts.passed, color: "#16a34a" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="whitespace-nowrap text-[11.5px] text-[#8b97a8]">{stat.label}</p>
                <p
                  className="mt-0.5 text-[21px] font-bold tabular-nums"
                  style={{ color: stat.value === 0 ? "#c3ccd8" : stat.color }}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 pb-[18px] pt-4">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-[#b45309]" />
            <h4 className="text-[12.5px] font-bold">AI 분석</h4>
          </div>
          {aiSummary ? (
            <>
              <AiSummaryText text={aiSummary} />
              {aiRawResponse ? (
                <details className="mt-3 rounded-lg border border-[#dbe2ea] bg-[#f8fafc]">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[#64748b]">
                    AI 원문 보기
                  </summary>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all border-t border-[#dbe2ea] p-3 text-[11.5px] leading-5 text-[#475569]">
                    {aiRawResponse}
                  </pre>
                </details>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-[13px] leading-[1.7] text-[#a3adbb]">추가 분석 없음</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
