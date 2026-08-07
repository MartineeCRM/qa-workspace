import {
  collectRuleEvidence,
  judgeAttributeStructural,
  judgeEventStructural,
  matchEventLogs,
  matchLatestSnapshotValue,
  normalizeFlatAttributeArrays,
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

export function formatTaxonomyExampleForAI(example: unknown, dataType: string): string {
  if ((dataType === "array" || dataType === "array of object") && typeof example === "string") {
    try {
      const parsed = JSON.parse(example);
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch {
      if (dataType === "array") {
        const lineItems = example
          .replace(/^\s*\[|\]\s*$/g, "")
          .split(/\r?\n/)
          .map((value) =>
            value
              .trim()
              .replace(/,$/, "")
              .replace(/^["']|["']$/g, ""),
          )
          .filter(Boolean);
        return JSON.stringify(
          lineItems.length > 1
            ? lineItems
            : example
                .replace(/^\s*\[|\]\s*$/g, "")
                .split(",")
                .map((value) => value.trim().replace(/^["']|["']$/g, ""))
                .filter(Boolean),
        );
      }
    }
  }
  return JSON.stringify(example);
}

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
  ctx = {
    ...ctx,
    snapshots: normalizeFlatAttributeArrays(ctx.snapshots, ctx.customAttributes),
  };
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
    const sortedMatched = [...matched].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    const latestMatched = sortedMatched[0];
    const violations = judgeEventStructural([latestMatched], properties);
    const blockedPropertyNames = new Set(violations.map((violation) => violation.property));
    const historicalWarnings = Array.from(
      new Map(
        judgeEventStructural(sortedMatched.slice(1), properties)
          .filter((violation) => !blockedPropertyNames.has(violation.property))
          .map((violation) => [violation.property, violation]),
      ).values(),
    );
    const aiEligiblePropertyNames = new Set(
      properties
        .filter(
          (property) =>
            !blockedPropertyNames.has(property.technical_name) &&
            matched.some((log) => {
              const value = log.raw_properties[property.technical_name];
              return (
                value !== undefined &&
                value !== null &&
                !(typeof value === "string" && !value.trim())
              );
            }),
        )
        .map((property) => property.technical_name),
    );
    const qualitative = await judgeQualitative(
      base.checklist_item_id,
      event.id,
      "event",
      ctx,
      aiEligiblePropertyNames,
      latestMatched,
    );
    if (violations.length > 0) {
      const structuralReason = violations.map((v) => `${v.property}: ${v.reason}`).join("\n");
      const qualitativeError =
        qualitative.final_status === "not_collected" && qualitative.ai_reasoning
          ? `AI 분석 미완료: ${qualitative.ai_reasoning}`
          : null;
      return {
        ...base,
        ai_verdict: "failed",
        ai_reasoning: [
          structuralReason,
          qualitative.final_status === "failed" ? qualitative.ai_reasoning : null,
          qualitativeError,
        ]
          .filter(Boolean)
          .join("\n"),
        ai_evidence: {
          structural: violations,
          qualitative: qualitative.ai_evidence,
          qualitative_error: qualitativeError,
        },
        failed_layer: "structural",
        final_status: "failed",
        judged_by:
          qualitative.judged_by === "ai" && qualitative.ai_evidence !== null ? "ai" : "rule",
      };
    }

    if (historicalWarnings.length === 0) return qualitative;
    return {
      ...qualitative,
      ai_evidence: {
        qualitative: qualitative.ai_evidence,
        historical_warnings: historicalWarnings.map((warning) => ({
          ...warning,
          message: `최신 로그의 ${warning.property} 값은 정상입니다. 이전 로그에서는 ${warning.reason} 확인이 필요합니다.`,
        })),
      },
    };
  }

  const attribute = ctx.customAttributes.find((a) => a.id === item.target_id);
  const value = attribute
    ? matchLatestSnapshotValue(attribute.technical_name, ctx.snapshots)
    : undefined;
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
      ai_reasoning: violations.map((v) => v.reason).join("\n"),
      ai_evidence: {
        value,
        structural: violations,
        qualitative: null,
        qualitative_error: null,
      },
      failed_layer: "structural",
      final_status: "failed",
      judged_by: "rule",
    };
  }

  const qualitative = await judgeQualitative(
    base.checklist_item_id,
    attribute.id,
    "custom_attribute",
    ctx,
  );
  return qualitative;
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
  aiEligiblePropertyNames?: Set<string>,
  latestRunEvent?: RunEvent,
): Promise<ChecklistItemVerdict> {
  const rules = ctx.rules
    .filter((rule) => {
      if (!rule.is_enabled) return false;
      if (rule.validation_rule_targets.length === 0) return true;
      return rule.validation_rule_targets.some((t) => {
        if (t.target_type === targetType && t.target_id === targetId) return true;
        if (targetType === "event" && t.target_type === "property") {
          const property = ctx.eventProperties.find((p) => p.id === t.target_id);
          return property?.event_id === targetId;
        }
        return false;
      });
    })
    .filter((rule) => {
      if (targetType !== "event" || !aiEligiblePropertyNames) return true;
      return rule.validation_rule_targets.every((target) => {
        if (target.target_type !== "property") return true;
        const property = ctx.eventProperties.find((candidate) => candidate.id === target.target_id);
        return (
          property?.event_id !== targetId || aiEligiblePropertyNames.has(property.technical_name)
        );
      });
    });

  const taxonomyRules =
    targetType === "event"
      ? ctx.eventProperties
          .filter(
            (property) =>
              property.event_id === targetId &&
              (!aiEligiblePropertyNames || aiEligiblePropertyNames.has(property.technical_name)) &&
              (Boolean(property.description?.trim()) || property.example_value != null),
          )
          .map((property) => ({
            id: `taxonomy-property:${property.id}`,
            name: `${property.technical_name} 값 형식`,
            description: [
              `${property.technical_name}의 실제 값은 택소노미 정의와 같은 형식·의미여야 합니다.`,
              `택소노미 데이터 타입: ${property.data_type}.`,
              property.description?.trim() ? `설명: ${property.description.trim()}` : null,
              property.example_value != null
                ? `형식 예시: ${formatTaxonomyExampleForAI(property.example_value, property.data_type)} (고정값이 아니라 형식 표본)`
                : null,
            ]
              .filter(Boolean)
              .join(" "),
          }))
      : (() => {
          const attribute = ctx.customAttributes.find((candidate) => candidate.id === targetId);
          if (!attribute || (!attribute.description?.trim() && attribute.example_value == null)) {
            return [];
          }
          return [
            {
              id: `taxonomy-attribute:${attribute.id}`,
              name: `${attribute.technical_name} 값 형식`,
              description: [
                `${attribute.technical_name}의 실제 값은 택소노미 정의와 같은 형식·의미여야 합니다.`,
                `택소노미 데이터 타입: ${attribute.data_type}.`,
                attribute.description?.trim() ? `설명: ${attribute.description.trim()}` : null,
                attribute.example_value != null
                  ? `형식 예시: ${formatTaxonomyExampleForAI(attribute.example_value, attribute.data_type)} (고정값이 아니라 형식 표본)`
                  : null,
              ]
                .filter(Boolean)
                .join(" "),
            },
          ];
        })();
  const promptRules = [...rules, ...taxonomyRules];

  if (promptRules.length === 0) {
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

  const targets = rules
    .flatMap((rule) => rule.validation_rule_targets)
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

  if (taxonomyRules.length > 0 || rules.some((rule) => rule.validation_rule_targets.length === 0)) {
    if (targetType === "event") {
      const event = ctx.events.find((candidate) => candidate.id === targetId);
      targets.push({
        kind: "event",
        id: targetId,
        technicalName: event?.technical_name ?? targetId,
      });
    } else {
      const attribute = ctx.customAttributes.find((candidate) => candidate.id === targetId);
      targets.push({
        kind: "custom_attribute",
        id: targetId,
        technicalName: attribute?.technical_name ?? targetId,
      });
    }
  }

  const dedupedTargets = Array.from(new Map(targets.map((t) => [`${t.kind}:${t.id}`, t])).values());

  const qualitativeRunEvents = aiEligiblePropertyNames
    ? ctx.runEvents
        .filter((event) => event.event_id !== targetId || event === latestRunEvent)
        .map((event) =>
          event.event_id === targetId
            ? {
                ...event,
                raw_properties: Object.fromEntries(
                  Object.entries(event.raw_properties).filter(([name]) =>
                    aiEligiblePropertyNames.has(name),
                  ),
                ),
              }
            : event,
        )
    : ctx.runEvents;
  const bundle = collectRuleEvidence(
    { description: "", targets: dedupedTargets },
    { runEvents: qualitativeRunEvents, snapshots: ctx.snapshots },
  );

  let result: Awaited<ReturnType<typeof judgeChecklistItemWithAI>>;
  try {
    result = await judgeChecklistItemWithAI({
      data: {
        scope: {
          kind: targetType,
          technicalName:
            targetType === "event"
              ? (ctx.events.find((event) => event.id === targetId)?.technical_name ?? targetId)
              : (ctx.customAttributes.find((attribute) => attribute.id === targetId)
                  ?.technical_name ?? targetId),
          allowedFields:
            targetType === "event"
              ? [...(aiEligiblePropertyNames ?? [])]
              : [
                  ctx.customAttributes.find((attribute) => attribute.id === targetId)
                    ?.technical_name ?? targetId,
                ],
        },
        rules: promptRules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          description: rule.description?.trim() || rule.name,
        })),
        targets: bundle.targets,
      },
    });
  } catch (error) {
    return {
      checklist_item_id: checklistItemId,
      ai_verdict: "not_collected",
      ai_reasoning: error instanceof Error ? error.message : "AI 판정 호출에 실패했어요.",
      ai_evidence: null,
      failed_layer: null,
      final_status: "not_collected",
      judged_by: "ai",
    };
  }

  if (!result.ok) {
    return {
      checklist_item_id: checklistItemId,
      ai_verdict: "not_collected",
      ai_reasoning: result.error,
      ai_evidence: result.rawResponse
        ? { qualitative_error: result.error, raw_response: result.rawResponse }
        : null,
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
