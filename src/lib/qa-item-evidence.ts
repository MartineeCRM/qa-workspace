import { formatMergedTimelineTime } from "@/lib/domain";
import type { TaxonomyCustomAttribute } from "@/lib/queries";
import { relatedRuleEvidenceTargets, type MergedTimelineRow } from "@/lib/qa-workflow";
import type { QaChecklistItemResult, QaRunEvent } from "@/lib/qa-rounds-queries";

// Pure evidence-interpretation helpers extracted from QaItemView — parsing AI
// judgement evidence, deciding which timeline rows are relevant to an item,
// and formatting that evidence for display/copy. No JSX, no hooks, no fetches.

export function extractAiSummary(evidence: unknown): string | null {
  if (
    evidence &&
    typeof evidence === "object" &&
    !Array.isArray(evidence) &&
    typeof (evidence as { qualitative_error?: unknown }).qualitative_error === "string"
  ) {
    return (evidence as { qualitative_error: string }).qualitative_error;
  }
  const historicalWarnings =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? (evidence as { historical_warnings?: unknown }).historical_warnings
      : null;
  const warningLines = Array.isArray(historicalWarnings)
    ? historicalWarnings
        .map((warning) =>
          warning && typeof warning === "object"
            ? (warning as { message?: unknown }).message
            : null,
        )
        .filter((message): message is string => typeof message === "string")
    : [];
  const nested =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? (evidence as { qualitative?: unknown }).qualitative
      : evidence;
  if (!Array.isArray(nested)) return warningLines.length > 0 ? warningLines.join(" ") : null;
  const repeated = new Map<string, string[]>();
  for (const entry of nested) {
    if (!entry || typeof entry !== "object") continue;
    const evidence = (entry as { evidence?: unknown }).evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) continue;
    const summary = (evidence as { observed_summary?: unknown }).observed_summary;
    const refs = (evidence as { refs?: unknown }).refs;
    if (typeof summary !== "string" || !Array.isArray(refs)) continue;
    const fields = refs.flatMap((ref) =>
      ref && typeof ref === "object" && typeof (ref as { field?: unknown }).field === "string"
        ? [(ref as { field: string }).field]
        : [],
    );
    if (fields.length > 0) repeated.set(summary, [...(repeated.get(summary) ?? []), ...fields]);
  }
  const groupedReasoning = Array.from(repeated.entries()).filter(
    ([, fields]) => new Set(fields).size >= 3,
  );
  const groupedSummaries = new Set(groupedReasoning.map(([summary]) => summary));
  const ungroupedLines = nested
    .filter((entry) => {
      if (!entry || typeof entry !== "object") return true;
      const summary = (entry as { evidence?: { observed_summary?: unknown } }).evidence
        ?.observed_summary;
      return typeof summary !== "string" || !groupedSummaries.has(summary);
    })
    .flatMap((entry) =>
      entry &&
      typeof entry === "object" &&
      typeof (entry as { reasoning?: unknown }).reasoning === "string"
        ? [(entry as { reasoning: string }).reasoning.trim()]
        : [],
    )
    .filter(Boolean);
  const groupedLines = groupedReasoning.map(([summary, fields]) => {
    const uniqueFields = [...new Set(fields)];
    return `${uniqueFields[0]} 외 ${uniqueFields.length - 1}개 프로퍼티에 같은 형식의 값이 들어왔습니다. 실제 값: ${summary}`;
  });
  const summaries = [...ungroupedLines, ...groupedLines, ...warningLines];
  return summaries.length > 0 ? summaries.join(" ") : null;
}

export function extractAiRawResponse(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const record = evidence as { raw_response?: unknown; qualitative?: unknown };
  if (typeof record.raw_response === "string") return record.raw_response;
  return extractAiRawResponse(record.qualitative);
}

export function isAiAnalysisIncomplete(
  result:
    | Pick<QaChecklistItemResult, "ai_evidence" | "judged_by" | "final_status" | "ai_reasoning">
    | undefined,
): boolean {
  return Boolean(
    (result?.ai_evidence &&
      typeof result.ai_evidence === "object" &&
      !Array.isArray(result.ai_evidence) &&
      (result.ai_evidence as { qualitative_error?: unknown }).qualitative_error) ||
    (result?.judged_by === "ai" && result.final_status === "not_collected" && result.ai_reasoning),
  );
}

export function isAttributeAiPending(input: {
  currentAttribute: Pick<TaxonomyCustomAttribute, "description" | "example_value"> | undefined;
  latestAttributeValue: unknown;
  aiAnalysisIncomplete: boolean;
}): boolean {
  return Boolean(
    input.currentAttribute &&
    input.latestAttributeValue !== undefined &&
    input.aiAnalysisIncomplete &&
    (input.currentAttribute.description?.trim() || input.currentAttribute.example_value != null),
  );
}

export function selectRelevantEvidenceRows(input: {
  evidenceTargets: ReturnType<typeof relatedRuleEvidenceTargets>;
  customAttributes: Pick<TaxonomyCustomAttribute, "id" | "technical_name">[];
  runEvents: Pick<QaRunEvent, "id" | "event_id">[];
  timeline: MergedTimelineRow[];
}): MergedTimelineRow[] {
  const relevantEventIds = new Set(
    input.evidenceTargets
      .filter((target) => target.targetType === "event")
      .map((target) => target.targetId),
  );
  const relevantAttributeNames = new Set(
    input.evidenceTargets
      .filter((target) => target.targetType === "custom_attribute")
      .map(
        (target) =>
          input.customAttributes.find((attribute) => attribute.id === target.targetId)
            ?.technical_name,
      )
      .filter((name): name is string => Boolean(name)),
  );
  const relevantKeys = new Set([
    ...input.runEvents
      .filter((event) => event.event_id && relevantEventIds.has(event.event_id))
      .map((event) => `event:${event.id}`),
    ...input.timeline
      .filter((row) => row.source === "snapshot" && relevantAttributeNames.has(row.name))
      .map((row) => row.key),
  ]);
  return input.timeline.filter((row) => relevantKeys.has(row.key)).reverse();
}

export function isEvidenceLong(rows: MergedTimelineRow[]): boolean {
  return (
    rows.length > 6 ||
    rows.reduce((length, row) => length + JSON.stringify(row.raw ?? row.change ?? "").length, 0) >
      3_000
  );
}

export function buildEvidenceLogText(rows: MergedTimelineRow[]): string {
  return rows
    .map((row) => {
      const header = `${row.name} | ${row.source === "snapshot" ? "어트리뷰트" : "이벤트"} | ${formatMergedTimelineTime(row.source, row.occurredAt)}`;
      if (row.source === "event") return `${header}\n${JSON.stringify(row.raw ?? {}, null, 2)}`;
      return `${header} ${row.change}`;
    })
    .join("\n\n");
}
