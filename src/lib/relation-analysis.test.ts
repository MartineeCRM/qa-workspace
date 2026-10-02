import { describe, expect, it } from "vitest";
import {
  buildRelationBatches,
  relationResponseFormat,
  parseRelationResponse,
  valueAtPointer,
  RELATION_BATCH_BYTES,
} from "./relation-analysis";
import type { QaRunEvent } from "./qa-rounds-queries";
import { loadRelationLogs } from "./relation-analysis.server";

function log(
  id: string,
  event: string,
  properties: Record<string, unknown>,
  user = "user-a",
): QaRunEvent {
  return {
    id,
    source_event_id: id,
    qa_session_id: "session",
    event_id: null,
    raw_event_name: event,
    external_user_id: user,
    occurred_at: "2026-09-17T00:00:00Z",
    created_at: "2026-09-17T00:00:00Z",
    raw_properties: properties,
  };
}
const logs = [
  log("pdp", "PDP", { product_id: "100", seller_id: "12345" }),
  log("cart", "add_to_cart", { product_id: "100", seller_id: "123456" }),
];
function response() {
  return {
    candidates: [
      {
        title: "판매자 식별자가 달라요",
        reasoning: "두 이벤트의 판매자 식별자가 달라 확인이 필요해요.",
        connection_reason: "사용자와 상품 ID가 같지만 판매처 변경 여부는 알 수 없어요.",
        normal_exceptions: ["판매처를 바꿨을 수 있어요."],
        left: { log_id: "pdp", field: "/seller_id" },
        right: { log_id: "cart", field: "/seller_id" },
        anchors: [{ left_field: "/product_id", right_field: "/product_id" }],
      },
    ],
  };
}

describe("relation findings", () => {
  it("preserves the numeric-string mismatch and copies actual evidence, without claiming UUID", () => {
    const result = parseRelationResponse(JSON.stringify(response()), logs);
    expect(result[0].evidence.left_value).toBe("12345");
    expect(result[0].evidence.right_value).toBe("123456");
    expect(result[0].evidence.anchors[0].value).toBe("100");
    expect(result[0].evidence.left).toEqual(logs[0]);
    expect(result[0].reasoning).not.toContain("UUID");
  });
  it("rejects invented refs, cross-user pairs, weak links, and matching values", () => {
    const invented = response();
    invented.candidates[0].left.field = "/missing";
    expect(() => parseRelationResponse(JSON.stringify(invented), logs)).toThrow("없는 필드");
    expect(() =>
      parseRelationResponse(JSON.stringify(response()), [
        logs[0],
        { ...logs[1], external_user_id: "other" },
      ]),
    ).toThrow("다른 사용자");
    const weak = response();
    weak.candidates[0].anchors = [];
    expect(() => parseRelationResponse(JSON.stringify(weak), logs)).toThrow("연결 근거");
    expect(() =>
      parseRelationResponse(JSON.stringify(response()), [
        logs[0],
        { ...logs[1], raw_properties: { ...logs[1].raw_properties, seller_id: "12345" } },
      ]),
    ).toThrow("같은 값");
    expect(() =>
      parseRelationResponse(JSON.stringify(response()), [
        logs[0],
        { ...logs[1], raw_properties: { ...logs[1].raw_properties, product_id: "200" } },
      ]),
    ).toThrow("일치하지");
  });
  it("supports nested fields and aliases without seller-specific logic; merges reversed duplicate pairs", () => {
    expect(valueAtPointer({ items: [{ "a/b": 0 }] }, "/items/0/a~1b")).toBe(0);
    const input = response();
    input.candidates[0].left.field = "/items/0/quantity";
    input.candidates[0].right.field = "/quantity";
    input.candidates[0].anchors[0].right_field = "/item_id";
    const evidence = [
      log("pdp", "PDP", { product_id: "100", items: [{ quantity: 0 }] }),
      log("cart", "add_to_cart", { item_id: "100", quantity: 2 }),
    ];
    const reversed = {
      ...input.candidates[0],
      left: input.candidates[0].right,
      right: input.candidates[0].left,
      anchors: [{ left_field: "/item_id", right_field: "/product_id" }],
    };
    input.candidates.push(reversed);
    expect(parseRelationResponse(JSON.stringify(input), evidence)).toHaveLength(1);
  });
});

describe("relation input coverage", () => {
  it("retains middle logs instead of selecting only the latest or first/last samples", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      log(String(i), i % 2 ? "cart" : "PDP", { amount: i === 10 ? "anomaly" : 1 }),
    );
    const batches = buildRelationBatches(rows, []);
    expect(batches).toHaveLength(1);
    expect(JSON.parse(batches[0].input).logs).toHaveLength(20);
    expect(batches[0].input).toContain("anomaly");
  });
  it("bounds call input size, overlaps boundaries, and exposes excluded logs through coverage", () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      log(String(i).padStart(4, "0"), i % 2 ? "cart" : "PDP", {
        product_id: "100",
        data: "x".repeat(1_000),
      }),
    );
    const batches = buildRelationBatches(rows, []);
    expect(batches).toHaveLength(3);
    batches.forEach((b) =>
      expect(new TextEncoder().encode(b.input).length).toBeLessThanOrEqual(RELATION_BATCH_BYTES),
    );
    expect(batches[1].logs[0].id).toBe(batches[0].logs.at(-4)?.id);
    expect(new Set(batches.flatMap((b) => b.logs.map((l) => l.id))).size).toBeLessThan(rows.length);
  });
  it("reads past a database's first 1,000-row page", async () => {
    const rows = Array.from({ length: 1_005 }, (_, i) => log(String(i), "PDP", {}));
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      range: async (from: number, to: number) => ({
        data: rows.slice(from, to + 1),
        error: null,
        count: rows.length,
      }),
    };
    const result = await loadRelationLogs({ from: () => query }, "session");
    expect(result.logs).toHaveLength(1_005);
    expect(result.total).toBe(1_005);
  });
});

it("constrains references to real property pointers, including escaped nested keys", () => {
  const schema = relationResponseFormat([log("a", "PDP", { "a/b": { "x~y": 1 } })]);
  const fields = schema.schema.properties.candidates.items.properties;
  expect(fields.left.properties.field.enum).toEqual(["/a~1b", "/a~1b/x~0y"]);
  expect(fields.anchors.items.properties.left_field.enum).not.toContain("/properties/a~1b");
});
