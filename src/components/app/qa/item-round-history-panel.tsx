import { useState } from "react";
import { Panel } from "@/components/app/layout-parts";
import { cn } from "@/lib/utils";
import { type CompressedRoundHistoryEntry } from "@/lib/qa-workflow";

type ItemRoundHistoryPanelProps = {
  compressedHistory: CompressedRoundHistoryEntry[];
};

export function ItemRoundHistoryPanel({ compressedHistory }: ItemRoundHistoryPanelProps) {
  const [openRounds, setOpenRounds] = useState<Record<number, boolean>>({});
  return (
    <Panel
      title="라운드 이력"
      description="차수별 불일치 건수만 봅니다. 세부 목록은 펼쳐서 확인해요."
    >
      <ul>
        {compressedHistory.map((h) => {
          const open = openRounds[h.roundNumber] ?? false;
          const categories = [
            { label: "필수 누락", properties: h.missingProperties, tone: "red" },
            { label: "미정의", properties: h.undefinedProperties, tone: "amber" },
            { label: "타입", properties: h.typeMismatchProperties, tone: "red" },
            { label: "형식·의미", properties: h.valueFormatProperties, tone: "red" },
          ] as const;
          const total = categories.reduce(
            (count, category) => count + category.properties.length,
            0,
          );
          return (
            <li key={h.roundNumber} className="border-b border-[#f4f6f9] last:border-b-0">
              <button
                type="button"
                onClick={() => setOpenRounds((prev) => ({ ...prev, [h.roundNumber]: !open }))}
                className="grid w-full grid-cols-[48px_64px_minmax(0,1fr)_76px_20px] items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f7f9fc]"
              >
                <span className="text-[13px] font-semibold">{h.roundNumber}차</span>
                <span>
                  <span
                    className={cn(
                      "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      h.finalStatus === "passed"
                        ? "bg-[#e8f5ec] text-[#16a34a]"
                        : h.finalStatus === "failed"
                          ? "bg-[#fdecec] text-[#dc2626]"
                          : "bg-[#fdf3e3] text-[#b45309]",
                    )}
                  >
                    {h.finalStatus === "passed"
                      ? "통과"
                      : h.finalStatus === "failed"
                        ? "오류"
                        : "미발생"}
                  </span>
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {categories.map((category) =>
                    category.properties.length > 0 ? (
                      <span
                        key={category.label}
                        className={cn(
                          "whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                          category.tone === "amber"
                            ? "border-[#f0dfc0] bg-[#fdf3e3] text-[#b45309]"
                            : "border-[#f4d0d0] bg-[#fdecec] text-[#dc2626]",
                        )}
                      >
                        {category.label} {category.properties.length}
                      </span>
                    ) : null,
                  )}
                  {total === 0 && h.otherReason ? (
                    <span className="truncate text-[12px] text-[#4a5666]">{h.otherReason}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-right text-[12px] tabular-nums",
                    h.delta === null || h.delta <= 0 ? "text-[#8b97a8]" : "text-[#dc2626]",
                  )}
                >
                  {h.delta === null ? "최초" : h.delta > 0 ? `+${h.delta}` : `±${h.delta}`}
                </span>
                <span
                  className={cn("text-[#c3ccd8] transition-transform", open ? "rotate-90" : "")}
                >
                  ›
                </span>
              </button>
              {open && total > 0 ? (
                <div className="space-y-2 px-4 pb-3 pl-[64px]">
                  {categories.map((category) =>
                    category.properties.length > 0 ? (
                      <div key={category.label}>
                        <p className="text-[11.5px] font-semibold text-[#64748b]">
                          {category.label}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {category.properties.map((property) => (
                            <code
                              key={property}
                              className="mono-token rounded-md border border-[#eef1f5] bg-[#f6f8fa] px-1.5 py-0.5 text-[11.5px] text-[#4a5666]"
                            >
                              {property}
                            </code>
                          ))}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
