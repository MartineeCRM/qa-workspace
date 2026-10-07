import { describe, expect, it } from "vitest";
import {
  buildEvidenceLogText,
  extractAiRawResponse,
  extractAiSummary,
  isAiAnalysisIncomplete,
  isAttributeAiPending,
  isEvidenceLong,
  selectRelevantEvidenceRows,
} from "@/lib/qa-item-evidence";
import type { MergedTimelineRow } from "@/lib/qa-workflow";

describe("extractAiSummary", () => {
  it("returns null when there is no evidence", () => {
    expect(extractAiSummary(null)).toBeNull();
    expect(extractAiSummary(undefined)).toBeNull();
  });

  it("prefers a top-level qualitative_error string", () => {
    expect(extractAiSummary({ qualitative_error: "모델 호출 실패" })).toBe("모델 호출 실패");
  });

  it("joins historical_warnings messages when there is no qualitative array", () => {
    expect(
      extractAiSummary({
        historical_warnings: [{ message: "경고 A" }, { message: "경고 B" }, { not_a_message: 1 }],
      }),
    ).toBe("경고 A 경고 B");
  });

  it("collects reasoning lines from a flat qualitative array", () => {
    const summary = extractAiSummary({
      qualitative: [
        { reasoning: "값이 형식과 다릅니다." },
        { reasoning: "  " },
        { not_reasoning: true },
      ],
    });
    expect(summary).toBe("값이 형식과 다릅니다.");
  });

  it("groups repeated observed_summary values that appear in 3+ fields", () => {
    const entry = (field: string) => ({
      reasoning: "무시됨",
      evidence: { observed_summary: "true", refs: [{ field }] },
    });
    const summary = extractAiSummary({
      qualitative: [entry("a"), entry("b"), entry("c")],
    });
    expect(summary).toBe("a 외 2개 프로퍼티에 같은 형식의 값이 들어왔습니다. 실제 값: true");
  });

  it("does not group when fewer than 3 distinct fields share a summary", () => {
    const entry = (field: string) => ({
      reasoning: `reason-${field}`,
      evidence: { observed_summary: "true", refs: [{ field }] },
    });
    const summary = extractAiSummary({
      qualitative: [entry("a"), entry("b")],
    });
    expect(summary).toBe("reason-a reason-b");
  });
});

describe("extractAiRawResponse", () => {
  it("returns null for non-object evidence", () => {
    expect(extractAiRawResponse(null)).toBeNull();
    expect(extractAiRawResponse("text")).toBeNull();
    expect(extractAiRawResponse([1, 2])).toBeNull();
  });

  it("returns a top-level raw_response", () => {
    expect(extractAiRawResponse({ raw_response: "RAW" })).toBe("RAW");
  });

  it("recurses into qualitative to find a nested raw_response", () => {
    expect(extractAiRawResponse({ qualitative: { qualitative: { raw_response: "NESTED" } } })).toBe(
      "NESTED",
    );
  });

  it("returns null when nothing in the chain has raw_response", () => {
    expect(extractAiRawResponse({ qualitative: { foo: "bar" } })).toBeNull();
  });
});

describe("isAiAnalysisIncomplete", () => {
  it("is false when there is no result", () => {
    expect(isAiAnalysisIncomplete(undefined)).toBe(false);
  });

  it("is true when ai_evidence carries a qualitative_error", () => {
    expect(
      isAiAnalysisIncomplete({
        ai_evidence: { qualitative_error: "timeout" },
        judged_by: "ai",
        final_status: "not_collected",
        ai_reasoning: null,
      }),
    ).toBe(true);
  });

  it("is true when judged_by ai, not_collected, and ai_reasoning is set", () => {
    expect(
      isAiAnalysisIncomplete({
        ai_evidence: null,
        judged_by: "ai",
        final_status: "not_collected",
        ai_reasoning: "검토 필요",
      }),
    ).toBe(true);
  });

  it("is false for a normal passed rule-judged result", () => {
    expect(
      isAiAnalysisIncomplete({
        ai_evidence: null,
        judged_by: "rule",
        final_status: "passed",
        ai_reasoning: null,
      }),
    ).toBe(false);
  });
});

describe("isAttributeAiPending", () => {
  const attribute = { description: "설명", example_value: null };

  it("is false when there is no current attribute", () => {
    expect(
      isAttributeAiPending({
        currentAttribute: undefined,
        latestAttributeValue: "x",
        aiAnalysisIncomplete: true,
      }),
    ).toBe(false);
  });

  it("is false when no value has been captured yet", () => {
    expect(
      isAttributeAiPending({
        currentAttribute: attribute,
        latestAttributeValue: undefined,
        aiAnalysisIncomplete: true,
      }),
    ).toBe(false);
  });

  it("is false when the AI analysis is not incomplete", () => {
    expect(
      isAttributeAiPending({
        currentAttribute: attribute,
        latestAttributeValue: "x",
        aiAnalysisIncomplete: false,
      }),
    ).toBe(false);
  });

  it("is false when the attribute has neither description nor example value", () => {
    expect(
      isAttributeAiPending({
        currentAttribute: { description: null, example_value: null },
        latestAttributeValue: "x",
        aiAnalysisIncomplete: true,
      }),
    ).toBe(false);
  });

  it("is true when a captured value is awaiting AI judgement on a described attribute", () => {
    expect(
      isAttributeAiPending({
        currentAttribute: attribute,
        latestAttributeValue: "x",
        aiAnalysisIncomplete: true,
      }),
    ).toBe(true);
  });
});

describe("selectRelevantEvidenceRows", () => {
  const timeline: MergedTimelineRow[] = [
    {
      key: "event:1",
      occurredAt: "2026-01-01T00:00:00Z",
      source: "event",
      name: "purchase",
      change: "",
    },
    {
      key: "snapshot:order_no",
      occurredAt: "2026-01-01T00:01:00Z",
      source: "snapshot",
      name: "order_no",
      change: "order_no: null -> 1",
    },
    {
      key: "snapshot:unrelated",
      occurredAt: "2026-01-01T00:02:00Z",
      source: "snapshot",
      name: "unrelated",
      change: "unrelated: null -> 1",
    },
  ];
  const customAttributes = [{ id: "attr-1", technical_name: "order_no" }];
  const runEvents = [{ id: "1", event_id: "purchase-event" }];

  it("keeps only timeline rows whose target matches an evidence target, newest first", () => {
    const rows = selectRelevantEvidenceRows({
      evidenceTargets: [
        { targetType: "event", targetId: "purchase-event" },
        { targetType: "custom_attribute", targetId: "attr-1" },
      ],
      customAttributes,
      runEvents,
      timeline,
    });
    expect(rows.map((row) => row.key)).toEqual(["snapshot:order_no", "event:1"]);
  });

  it("returns an empty list when nothing matches", () => {
    const rows = selectRelevantEvidenceRows({
      evidenceTargets: [{ targetType: "custom_attribute", targetId: "attr-missing" }],
      customAttributes,
      runEvents,
      timeline,
    });
    expect(rows).toEqual([]);
  });
});

describe("isEvidenceLong", () => {
  it("is false for a short list of small rows", () => {
    const rows: MergedTimelineRow[] = [
      { key: "1", occurredAt: "", source: "event", name: "a", change: "x" },
    ];
    expect(isEvidenceLong(rows)).toBe(false);
  });

  it("is true when there are more than 6 rows", () => {
    const rows: MergedTimelineRow[] = Array.from({ length: 7 }, (_, i) => ({
      key: String(i),
      occurredAt: "",
      source: "event" as const,
      name: "a",
      change: "x",
    }));
    expect(isEvidenceLong(rows)).toBe(true);
  });

  it("is true when the combined raw/change JSON exceeds 3000 characters", () => {
    const rows: MergedTimelineRow[] = [
      {
        key: "1",
        occurredAt: "",
        source: "event",
        name: "a",
        change: "",
        raw: { v: "x".repeat(4000) },
      },
    ];
    expect(isEvidenceLong(rows)).toBe(true);
  });
});

describe("buildEvidenceLogText", () => {
  it("renders event rows with pretty-printed raw JSON", () => {
    const rows: MergedTimelineRow[] = [
      {
        key: "event:1",
        occurredAt: "2026-01-01T00:00:00+09:00",
        source: "event",
        name: "purchase",
        change: "",
        raw: { order_no: "1" },
      },
    ];
    const text = buildEvidenceLogText(rows);
    expect(text).toContain("purchase | 이벤트 |");
    expect(text).toContain('"order_no": "1"');
  });

  it("renders snapshot rows with their change summary and joins rows with a blank line", () => {
    const rows: MergedTimelineRow[] = [
      {
        key: "snapshot:order_no",
        occurredAt: "2026-01-01T00:00:00+09:00",
        source: "snapshot",
        name: "order_no",
        change: "order_no: null -> 1",
      },
      {
        key: "event:1",
        occurredAt: "2026-01-01T00:01:00+09:00",
        source: "event",
        name: "purchase",
        change: "",
        raw: {},
      },
    ];
    const text = buildEvidenceLogText(rows);
    expect(text.split("\n\n")).toHaveLength(2);
    expect(text).toContain("order_no | 어트리뷰트 | ");
    expect(text).toContain("order_no: null -> 1");
  });
});
