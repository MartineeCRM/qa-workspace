import { describe, expect, it } from "vitest";
import {
  formatAttributeExample,
  resolveChecklistItemLabel,
  resolveDiscussionDisplayLabel,
} from "@/lib/qa-item-labels";

describe("formatAttributeExample", () => {
  it("pretty-prints an array value as JSON regardless of data type", () => {
    expect(formatAttributeExample(["a", "b"], "string")).toBe(JSON.stringify(["a", "b"], null, 2));
  });

  it("returns a non-array value as-is when the data type is not an array type", () => {
    expect(formatAttributeExample("hello", "string")).toBe("hello");
    expect(formatAttributeExample(true, "boolean")).toBe("true");
  });

  it("pretty-prints a JSON-encoded array string for array data types", () => {
    expect(formatAttributeExample('["a","b"]', "array")).toBe(JSON.stringify(["a", "b"], null, 2));
  });

  it("falls back to comma-newline formatting for non-JSON array examples", () => {
    expect(formatAttributeExample("a, b, c", "array")).toBe("a,\nb,\nc");
  });
});

describe("resolveDiscussionDisplayLabel", () => {
  it("uses the target label directly for a custom attribute", () => {
    expect(
      resolveDiscussionDisplayLabel({ target_type: "custom_attribute", target_label: "age" }, "purchase"),
    ).toBe("age");
  });

  it("appends '전체' for a whole-event target", () => {
    expect(resolveDiscussionDisplayLabel({ target_type: "event", target_label: "" }, "purchase")).toBe(
      "purchase · 이벤트 전체",
    );
  });

  it("joins event label and property label for a property target", () => {
    expect(
      resolveDiscussionDisplayLabel({ target_type: "property", target_label: "order_no" }, "purchase"),
    ).toBe("purchase.order_no");
  });
});

describe("resolveChecklistItemLabel", () => {
  const events = [{ id: "e1", technical_name: "purchase" }];
  const customAttributes = [{ id: "a1", technical_name: "age" }];

  it("resolves an event checklist item's technical name", () => {
    expect(
      resolveChecklistItemLabel({ target_type: "event", target_id: "e1" }, events, customAttributes),
    ).toBe("purchase");
  });

  it("resolves a custom attribute checklist item's technical name", () => {
    expect(
      resolveChecklistItemLabel(
        { target_type: "custom_attribute", target_id: "a1" },
        events,
        customAttributes,
      ),
    ).toBe("age");
  });

  it("falls back to the raw target id when nothing matches", () => {
    expect(
      resolveChecklistItemLabel({ target_type: "event", target_id: "missing" }, events, customAttributes),
    ).toBe("missing");
  });
});
