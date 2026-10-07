import type {
  TaxonomyCustomAttribute,
  TaxonomyCustomAttributeProperty,
  TaxonomyEventProperty,
} from "@/lib/queries";

export type AnyAttribute =
  TaxonomyEventProperty | TaxonomyCustomAttribute | TaxonomyCustomAttributeProperty;
