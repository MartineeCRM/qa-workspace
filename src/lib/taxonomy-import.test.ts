import { describe, expect, it } from "vitest";
import { parseTaxonomyFile } from "@/lib/taxonomy-import";

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
