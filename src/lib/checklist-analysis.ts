import {
  collectRuleEvidence,
  judgeAttributeStructural,
  judgeEventStructural,
  matchEventLogs,
  matchLatestSnapshotValue,
  type AttributeSnapshot,
  type RunEvent,
  type TaxonomyAttributeLite,
  type TaxonomyPropertyLite,
} from "@/lib/checklist-judge";
import { judgeChecklistItemWithAI } from "@/lib/ai-judge.functions";
import type { QaChecklistItem } from "@/lib/qa-rounds-queries";
import type {
  TaxonomyCustomAttribute,
  TaxonomyEvent,
  TaxonomyEventProperty,
  ValidationRule,
} from "@/lib/queries";

export type ChecklistItemVerdict = {
  checklist_item_id: string;
  ai_verdict: "passed" | "failed" | "not_collected";
  ai_reasoning: string | null;
  ai_evidence: unknown;
  failed_layer: "structural" | "qualitative" | null;
  final_status: "passed" | "failed" | "not_collected";
  judged_by: "rule" | "ai";
};

export async function judgeChecklistItem(
  item: QaChecklistItem,
  ctx: {
    events: TaxonomyEvent[];
    eventProperties: TaxonomyEventProperty[];
    customAttributes: TaxonomyCustomAttribute[];
    rules: ValidationRule[];
    runEvents: RunEvent[];
    snapshots: AttributeSnapshot[];
  },
): Promise<ChecklistItemVerdict> {
  const base = { checklist_item_id: item.id };

  if (item.target_type === "event") {
    const event = ctx.events.find((e) => e.id === item.target_id);
    const matched = event ? matchEventLogs(event.id, ctx.runEvents) : [];
    if (!event || matched.length === 0) {
      return {
        ...base,
        ai_verdict: "not_collected",
        ai_reasoning: null,
        ai_evidence: null,
        failed_layer: null,
        final_status: "not_collected",
        judged_by: "rule",
      };
    }

    const properties: TaxonomyPropertyLite[] = ctx.eventProperties
      .filter((p) => p.event_id === event.id)
      .map((p) => ({
        id: p.id,
        event_id: p.event_id,
        technical_name: p.technical_name,
        data_type: p.data_type,
        is_required: p.is_required,
        allowed_values: Array.isArray(p.allowed_values) ? (p.allowed_values as string[]) : null,
      }));
    const violations = judgeEventStructural(matched, properties);
    if (violations.length > 0) {
      return {
        ...base,
        ai_verdict: "failed",
        ai_reasoning: violations.map((v) => `${v.property}: ${v.reason}`).join(" / "),
        ai_evidence: matched,
        failed_layer: "structural",
        final_status: "failed",
        judged_by: "rule",
      };
    }

    return judgeQualitative(base.checklist_item_id, event.id, "event", ctx);
  }

  const attribute = ctx.customAttributes.find((a) => a.id === item.target_id);
  const value = attribute ? matchLatestSnapshotValue(attribute.technical_name, ctx.snapshots) : undefined;
  if (!attribute || value === undefined) {
    return {
      ...base,
      ai_verdict: "not_collected",
      ai_reasoning: null,
      ai_evidence: null,
      failed_layer: null,
      final_status: "not_collected",
      judged_by: "rule",
    };
  }

  const attributeLite: TaxonomyAttributeLite = {
    id: attribute.id,
    technical_name: attribute.technical_name,
    data_type: attribute.data_type,
    is_required: attribute.is_required,
    allowed_values: Array.isArray(attribute.allowed_values)
      ? (attribute.allowed_values as string[])
      : null,
  };
  const violations = judgeAttributeStructural(value, attributeLite);
  if (violations.length > 0) {
    return {
      ...base,
      ai_verdict: "failed",
      ai_reasoning: violations.map((v) => v.reason).join(" / "),
      ai_evidence: { value },
      failed_layer: "structural",
      final_status: "failed",
      judged_by: "rule",
    };
  }

  return judgeQualitative(base.checklist_item_id, attribute.id, "custom_attribute", ctx);
}

async function judgeQualitative(
  checklistItemId: string,
  targetId: string,
  targetType: "event" | "custom_attribute",
  ctx: {
    events: TaxonomyEvent[];
    eventProperties: TaxonomyEventProperty[];
    customAttributes: TaxonomyCustomAttribute[];
    rules: ValidationRule[];
    runEvents: RunEvent[];
    snapshots: AttributeSnapshot[];
  },
): Promise<ChecklistItemVerdict> {
  const rule = ctx.rules.find(
    (r) =>
      r.is_enabled &&
      r.validation_rule_targets.some((t) => t.target_type === targetType && t.target_id === targetId),
  );

  if (!rule) {
    return {
      checklist_item_id: checklistItemId,
      ai_verdict: "passed",
      ai_reasoning: null,
      ai_evidence: null,
      failed_layer: null,
      final_status: "passed",
      judged_by: "rule",
    };
  }

  const targets = rule.validation_rule_targets
    .map((t) => {
      if (t.target_type === "event") {
        const label = ctx.events.find((e) => e.id === t.target_id)?.technical_name ?? t.target_id;
        return { kind: "event" as const, id: t.target_id, technicalName: label };
      }
      if (t.target_type === "custom_attribute") {
        const label =
          ctx.customAttributes.find((a) => a.id === t.target_id)?.technical_name ?? t.target_id;
        return { kind: "custom_attribute" as const, id: t.target_id, technicalName: label };
      }
      // property: no separate evidence source — resolve to the parent event,
      // since the property's value already lives inside that event's raw_properties in qa_run_events
      const property = ctx.eventProperties.find((p) => p.id === t.target_id);
      if (!property) return null;
      const parentEvent = ctx.events.find((e) => e.id === property.event_id);
      return {
        kind: "event" as const,
        id: property.event_id,
        technicalName: `${parentEvent?.technical_name ?? property.event_id}.${property.technical_name}`,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  const bundle = collectRuleEvidence(
    { description: rule.description, targets },
    { runEvents: ctx.runEvents, snapshots: ctx.snapshots },
  );

  const result = await judgeChecklistItemWithAI({
    data: { ruleDescription: bundle.ruleDescription, targets: bundle.targets },
  });

  if (!result.ok) {
    return {
      checklist_item_id: checklistItemId,
      ai_verdict: "not_collected",
      ai_reasoning: result.error,
      ai_evidence: null,
      failed_layer: null,
      final_status: "not_collected",
      judged_by: "ai",
    };
  }

  return {
    checklist_item_id: checklistItemId,
    ai_verdict: result.verdict,
    ai_reasoning: result.reasoning,
    ai_evidence: result.evidence,
    failed_layer: result.verdict === "failed" ? "qualitative" : null,
    final_status: result.verdict,
    judged_by: "ai",
  };
}
