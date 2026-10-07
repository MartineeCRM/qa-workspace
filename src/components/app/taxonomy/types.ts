import type {
  TaxonomyCustomAttribute,
  TaxonomyCustomAttributeProperty,
  TaxonomyEventProperty,
} from "@/lib/queries";

export type AnyAttribute =
  TaxonomyEventProperty | TaxonomyCustomAttribute | TaxonomyCustomAttributeProperty;

export type StatusFilter = "all" | "active" | "inactive";
export type SortKey = "name" | "updatedRecent";

export const PAGE_SIZE = 20;

export const dataTypeColors: Record<string, string> = {
  string: "border-[#c5d5e5] bg-[#e1ebf5] text-[#4c6884]",
  number: "border-[#c2d9cc] bg-[#deeee4] text-[#486b57]",
  boolean: "border-[#e0cea6] bg-[#f5ead1] text-[#7b6537]",
  array: "border-[#d1c5e3] bg-[#eae2f4] text-[#6c5689]",
  "array of object": "border-[#e2c3cb] bg-[#f4e0e5] text-[#865863]",
};
