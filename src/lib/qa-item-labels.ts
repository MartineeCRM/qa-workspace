import type { TaxonomyCustomAttribute, TaxonomyEvent } from "@/lib/queries";
import type { QaChecklistItem, QaDiscussion } from "@/lib/qa-rounds-queries";

// Pure label/formatting helpers extracted from QaItemView — resolving a
// human-readable label for a discussion or checklist item, and formatting an
// attribute's example value for display. No JSX, no hooks, no fetches.

export function formatAttributeExample(value: unknown, dataType: string): string {
  if (Array.isArray(value)) return JSON.stringify(value, null, 2);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!dataType.startsWith("array")) return text;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return JSON.stringify(parsed, null, 2);
  } catch {
    // Comma-separated taxonomy examples are valid even when they are not JSON.
  }
  return text.replace(/,\s*/g, ",\n");
}

export function resolveDiscussionDisplayLabel(
  discussion: Pick<QaDiscussion, "target_type" | "target_label">,
  eventLabel: string | undefined,
): string {
  if (discussion.target_type === "custom_attribute") return discussion.target_label;
  if (discussion.target_type === "event") return `${eventLabel} · 이벤트 전체`;
  return `${eventLabel}.${discussion.target_label}`;
}

export function resolveChecklistItemLabel(
  checklistItem: Pick<QaChecklistItem, "target_type" | "target_id">,
  events: Pick<TaxonomyEvent, "id" | "technical_name">[],
  customAttributes: Pick<TaxonomyCustomAttribute, "id" | "technical_name">[],
): string {
  return (
    (checklistItem.target_type === "event"
      ? events.find((event) => event.id === checklistItem.target_id)?.technical_name
      : customAttributes.find((attribute) => attribute.id === checklistItem.target_id)
          ?.technical_name) ?? checklistItem.target_id
  );
}
