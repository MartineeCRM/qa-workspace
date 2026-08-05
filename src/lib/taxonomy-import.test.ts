import { describe, expect, it } from "vitest";
import { parseAllowedValues, parseTaxonomyFile } from "@/lib/taxonomy-import";

describe("parseAllowedValues", () => {
  it("removes wrapping quotes without changing the value itself", () => {
    expect(parseAllowedValues('"pc_web", "mo_web", "ios_app", "android_app"')).toEqual([
      "pc_web",
      "mo_web",
      "ios_app",
      "android_app",
    ]);
    expect(parseAllowedValues("GOLD, SILVER")).toEqual(["GOLD", "SILVER"]);
  });
});

describe("parseTaxonomyFile required defaults", () => {
  it("defaults event properties to required while preserving explicit false", () => {
    const parsed = parseTaxonomyFile(
      "taxonomy.json",
      JSON.stringify({
        events: [
          {
            name: "purchase",
            properties: [{ name: "order_id" }, { name: "coupon", required: false }],
          },
        ],
        user_attributes: [{ name: "nickname" }],
      }),
    );

    expect(parsed.events[0].attributes.map((attribute) => attribute.is_required)).toEqual([
      true,
      false,
    ]);
    expect(parsed.userAttributes[0].is_required).toBe(false);
  });
});
