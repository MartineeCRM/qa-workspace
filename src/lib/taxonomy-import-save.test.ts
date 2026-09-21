import { expect, it, vi } from "vitest";
import { saveTaxonomyImport } from "./taxonomy-import-save";
import { parseTaxonomyFile } from "./taxonomy-import";
import type {
  TaxonomyEvent,
  TaxonomyEventProperty,
  TaxonomyCustomAttribute,
  TaxonomyCustomAttributeProperty,
} from "./queries";

const { rows, failure } = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  failure: { error: null as Error | null },
}));
vi.mock("./queries", () => ({
  db: {
    from: (table: string) => {
      let values: Record<string, unknown>;
      let id: string | undefined;
      let inserting = false;
      const execute = async () => {
        if (failure.error) return { data: null, error: failure.error };
        const row = inserting
          ? { id: `new-${rows[table].length}`, ...values }
          : rows[table].find((r) => r.id === id)!;
        if (inserting) rows[table].push(row);
        else Object.assign(row, values);
        return { data: row, error: null };
      };
      const query = {
        update: (v: Record<string, unknown>) => {
          values = v;
          return query;
        },
        insert: (v: Record<string, unknown>) => {
          values = v;
          inserting = true;
          return query;
        },
        eq: (_key: string, value: string) => {
          id = value;
          return query;
        },
        select: () => query,
        single: execute,
        then: (resolve: (value: unknown) => unknown) => execute().then(resolve),
      };
      return query;
    },
  },
}));

it("overwrites matching specs while retaining IDs, QA-related settings, and omitted items", async () => {
  rows.taxonomy_events = [
    {
      id: "event",
      technical_name: "purchase",
      created_by: "original",
      is_active: false,
      category_id: "category",
    },
  ];
  rows.taxonomy_event_properties = [
    {
      id: "property",
      event_id: "event",
      technical_name: "amount",
      data_type: "string",
      sort_order: 8,
      created_by: "original",
    },
    { id: "untouched", event_id: "event", technical_name: "old", description: "keep" },
  ];
  rows.taxonomy_custom_attributes = [
    { id: "custom", technical_name: "grade", description: "old", created_by: "original" },
  ];
  const input = {
    projectId: "project",
    userId: "uploader",
    events: rows.taxonomy_events as unknown as TaxonomyEvent[],
    eventProperties: rows.taxonomy_event_properties as unknown as TaxonomyEventProperty[],
    customAttributes: rows.taxonomy_custom_attributes as unknown as TaxonomyCustomAttribute[],
    parsed: parseTaxonomyFile(
      "taxonomy.json",
      JSON.stringify({
        events: [
          {
            name: "purchase",
            display_name: "구매",
            properties: [
              { name: "amount", data_type: "number", required: false, example_value: 0 },
              { name: "currency", allowed_values: ["KRW"] },
            ],
          },
          { name: "new_event" },
        ],
        user_attributes: [{ name: "grade", description: "new" }, { name: "nickname" }],
      }),
    ),
  };
  expect(await saveTaxonomyImport(input)).toEqual({
    createdEvents: 1,
    createdAttrs: 2,
    updated: 3,
  });
  expect(rows.taxonomy_events[0]).toMatchObject({
    id: "event",
    display_name: "구매",
    description: null,
    created_by: "original",
    is_active: false,
    category_id: "category",
  });
  expect(rows.taxonomy_event_properties[0]).toMatchObject({
    id: "property",
    data_type: "number",
    is_required: false,
    example_value: "0",
    sort_order: 8,
    created_by: "original",
  });
  expect(rows.taxonomy_event_properties[1]).toMatchObject({ id: "untouched", description: "keep" });
  expect(rows.taxonomy_custom_attributes[0]).toMatchObject({
    id: "custom",
    description: "new",
    created_by: "original",
  });

  failure.error = new Error("Write failed");
  await expect(saveTaxonomyImport(input)).rejects.toThrow("Write failed");
  await expect(saveTaxonomyImport({ ...input, userId: undefined })).rejects.toThrow("로그인");
});

it("creates and updates array of object sub-fields on custom attributes", async () => {
  rows.taxonomy_events = [];
  rows.taxonomy_event_properties = [];
  rows.taxonomy_custom_attributes = [
    {
      id: "custom",
      technical_name: "cart_items",
      data_type: "array of object",
      created_by: "original",
    },
  ];
  rows.taxonomy_custom_attribute_properties = [
    {
      id: "prop",
      custom_attribute_id: "custom",
      technical_name: "item_id",
      data_type: "string",
      description: "old",
      created_by: "original",
    },
  ];
  failure.error = null;

  const result = await saveTaxonomyImport({
    projectId: "project",
    userId: "uploader",
    events: [],
    eventProperties: [],
    customAttributes: rows.taxonomy_custom_attributes as unknown as TaxonomyCustomAttribute[],
    customAttributeProperties: rows.taxonomy_custom_attribute_properties as unknown as
      TaxonomyCustomAttributeProperty[],
    parsed: parseTaxonomyFile(
      "taxonomy.json",
      JSON.stringify({
        user_attributes: [
          {
            name: "cart_items",
            data_type: "array of object",
            properties: [
              { name: "item_id", data_type: "string", description: "new" },
              { name: "quantity", data_type: "number", required: true },
            ],
          },
        ],
      }),
    ),
  });

  expect(result).toEqual({ createdEvents: 0, createdAttrs: 1, updated: 2 });
  expect(rows.taxonomy_custom_attribute_properties[0]).toMatchObject({
    id: "prop",
    description: "new",
    created_by: "original",
  });
  expect(rows.taxonomy_custom_attribute_properties[1]).toMatchObject({
    custom_attribute_id: "custom",
    technical_name: "quantity",
    is_required: true,
  });
});
