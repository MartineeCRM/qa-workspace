import { describe, expect, it } from "vitest";
import {
  parseAllowedValues,
  parseTaxonomyFile,
  parseTaxonomyFileWithWarnings,
} from "@/lib/taxonomy-import";

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
  it("preserves example values including zero, false and nested arrays", () => {
    const parsed = parseTaxonomyFile(
      "taxonomy.json",
      JSON.stringify({
        events: [
          {
            name: "purchase",
            properties: [
              { name: "amount", example_value: 0 },
              { name: "active", example_value: false },
              { name: "products", example_value: [{ code: "A" }] },
            ],
          },
        ],
        user_attributes: [{ name: "grade", example_value: "gold" }],
      }),
    );
    expect(parsed.events[0].attributes.map((a) => a.example_value)).toEqual([
      "0",
      "false",
      '[{"code":"A"}]',
    ]);
    expect(parsed.userAttributes[0].example_value).toBe("gold");
  });
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

describe("array of object sub-fields", () => {
  it("parses nested properties on a JSON user attribute", () => {
    const parsed = parseTaxonomyFile(
      "taxonomy.json",
      JSON.stringify({
        user_attributes: [
          {
            name: "cart_items",
            data_type: "array of object",
            properties: [
              { name: "item_id", data_type: "string", required: true },
              { name: "quantity", data_type: "number" },
            ],
          },
        ],
      }),
    );
    expect(parsed.userAttributes[0].properties).toEqual([
      expect.objectContaining({
        technical_name: "item_id",
        data_type: "string",
        is_required: true,
      }),
      expect.objectContaining({
        technical_name: "quantity",
        data_type: "number",
        is_required: false,
      }),
    ]);
  });

  it("parses nested properties from YAML using either properties or attributes key", () => {
    const parsed = parseTaxonomyFile(
      "taxonomy.yaml",
      [
        "user_attributes:",
        "  - technical_name: cart_items",
        "    data_type: array of object",
        "    attributes:",
        "      - technical_name: item_id",
        "        data_type: string",
      ].join("\n"),
    );
    expect(parsed.userAttributes[0].properties).toEqual([
      expect.objectContaining({ technical_name: "item_id", data_type: "string" }),
    ]);
  });

  it("ignores nested properties when the attribute isn't array of object", () => {
    const parsed = parseTaxonomyFile(
      "taxonomy.json",
      JSON.stringify({
        user_attributes: [{ name: "grade", data_type: "string", properties: [{ name: "sneaky" }] }],
      }),
    );
    expect(parsed.userAttributes[0].properties).toBeUndefined();
  });

  it("only supports one level of nesting", () => {
    const parsed = parseTaxonomyFile(
      "taxonomy.json",
      JSON.stringify({
        user_attributes: [
          {
            name: "cart_items",
            data_type: "array of object",
            properties: [
              {
                name: "nested",
                data_type: "array of object",
                properties: [{ name: "too_deep" }],
              },
            ],
          },
        ],
      }),
    );
    expect(parsed.userAttributes[0].properties?.[0].properties).toBeUndefined();
  });

  it("parses CSV user_attribute_property rows via the parent column", () => {
    const csv = [
      "type,event,technical_name,parent,display_name,data_type,required,allowed_values,description",
      "user_attribute,,cart_items,,장바구니,array of object,false,,",
      "user_attribute_property,,item_id,cart_items,상품 ID,string,true,,",
      "user_attribute_property,,quantity,cart_items,수량,number,true,,",
    ].join("\n");
    const parsed = parseTaxonomyFile("taxonomy.csv", csv);
    expect(parsed.userAttributes[0].properties).toEqual([
      expect.objectContaining({ technical_name: "item_id", data_type: "string" }),
      expect.objectContaining({ technical_name: "quantity", data_type: "number" }),
    ]);
  });
});

describe("parseTaxonomyFile CSV quoted multiline values", () => {
  it("keeps a quoted newline inside one cell instead of splitting the row", () => {
    const csv = "type,event,technical_name,description\n" + 'attribute,purchase,note,"1행\n2행"\n';
    const parsed = parseTaxonomyFile("taxonomy.csv", csv);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].attributes).toHaveLength(1);
    expect(parsed.events[0].attributes[0].description).toBe("1행\n2행");
  });
});

describe("parseTaxonomyFile unknown data type warnings", () => {
  it("warns when a type isn't recognized and falls back to string", () => {
    const csv = "type,event,technical_name,data_type\nattribute,purchase,note,timestamp\n";
    const result = parseTaxonomyFileWithWarnings("taxonomy.csv", csv);
    expect(result.events[0].attributes[0].data_type).toBe("string");
    expect(result.warnings).toEqual([
      'purchase.note: 알 수 없는 타입 "timestamp" → string으로 등록했어요',
    ]);
  });
});
