export type RunEvent = {
  event_id: string | null;
  raw_event_name: string;
  occurred_at: string;
  external_user_id: string;
  raw_properties: Record<string, unknown>;
};

export type AttributeSnapshot = {
  external_user_id: string;
  snapshot_name: string;
  status: string;
  payload: Record<string, unknown> | null;
  captured_at: string | null;
};

export type TaxonomyPropertyLite = {
  id: string;
  event_id: string;
  technical_name: string;
  data_type: string;
  is_required: boolean;
  allowed_values: string[] | null;
};

export type TaxonomyAttributeLite = {
  id: string;
  technical_name: string;
  data_type: string;
  is_required: boolean;
  allowed_values: string[] | null;
};

export type StructuralViolation = {
  property: string;
  reason: string;
  kind?: "unknown_property";
  sampleValue?: unknown;
};

export function inferDataType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

export function matchEventLogs(eventId: string, runEvents: RunEvent[]): RunEvent[] {
  return runEvents.filter((r) => r.event_id === eventId);
}

function hasCapturedValue(snapshot: AttributeSnapshot, technicalName: string): boolean {
  return snapshot.status === "captured" && !!snapshot.payload && technicalName in snapshot.payload;
}

export function matchLatestSnapshotValue(
  technicalName: string,
  snapshots: AttributeSnapshot[],
): unknown {
  const captured = snapshots
    .filter((s) => hasCapturedValue(s, technicalName))
    .sort((a, b) => (b.captured_at ?? "").localeCompare(a.captured_at ?? ""));
  return captured[0]?.payload?.[technicalName];
}

export function matchesDataType(value: unknown, dataType: string): boolean {
  switch (dataType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    default:
      return true;
  }
}

function checkValue(
  value: unknown,
  propertyName: string,
  dataType: string,
  allowedValues: string[] | null,
): StructuralViolation | null {
  if (!matchesDataType(value, dataType)) {
    return {
      property: propertyName,
      reason: `타입이 ${dataType}이어야 하는데 ${typeof value}입니다`,
    };
  }
  if (allowedValues && !allowedValues.includes(String(value))) {
    return {
      property: propertyName,
      reason: `허용된 값(${allowedValues.join(", ")}) 중이 아닙니다: ${JSON.stringify(value)}`,
    };
  }
  return null;
}

export function judgeEventStructural(
  matchedEvents: RunEvent[],
  properties: TaxonomyPropertyLite[],
): StructuralViolation[] {
  const violations: StructuralViolation[] = [];
  for (const prop of properties) {
    const observed = matchedEvents.map((event) => event.raw_properties[prop.technical_name]);
    const missingCount = observed.filter((value) => value === undefined || value === null).length;
    if (prop.is_required && missingCount > 0) {
      const emptyCount = matchedEvents.filter(
        (event) =>
          prop.technical_name in event.raw_properties &&
          (event.raw_properties[prop.technical_name] === undefined ||
            event.raw_properties[prop.technical_name] === null),
      ).length;
      violations.push({
        property: prop.technical_name,
        reason:
          missingCount === matchedEvents.length
            ? emptyCount > 0
              ? "필수 프로퍼티 값이 비어 있습니다"
              : "필수 프로퍼티가 로그에 없습니다"
            : `전체 ${matchedEvents.length}건 중 ${missingCount}건에서 필수 프로퍼티가 없거나 비어 있습니다`,
      });
    }
    const values = observed.filter((value) => value !== undefined && value !== null);
    for (const value of values) {
      const violation = checkValue(value, prop.technical_name, prop.data_type, prop.allowed_values);
      if (violation) violations.push(violation);
    }
  }

  const knownNames = new Set(properties.map((p) => p.technical_name));
  const unknownProperties = new Map<string, unknown>();
  for (const e of matchedEvents) {
    for (const [key, value] of Object.entries(e.raw_properties)) {
      if (!knownNames.has(key) && !unknownProperties.has(key)) unknownProperties.set(key, value);
    }
  }
  for (const [property, sampleValue] of unknownProperties) {
    violations.push({
      property,
      reason: "택소노미에 정의되지 않은 프로퍼티입니다",
      kind: "unknown_property",
      sampleValue,
    });
  }

  return violations;
}

export function judgeAttributeStructural(
  value: unknown,
  attribute: TaxonomyAttributeLite,
): StructuralViolation[] {
  const violation = checkValue(
    value,
    attribute.technical_name,
    attribute.data_type,
    attribute.allowed_values,
  );
  return violation ? [violation] : [];
}

export type RuleTarget =
  | { kind: "event"; id: string; technicalName: string }
  | { kind: "custom_attribute"; id: string; technicalName: string };

export type RuleEvidenceBundle = {
  ruleDescription: string;
  targets: Array<
    | { kind: "event"; technicalName: string; runEvents: RunEvent[] }
    | { kind: "custom_attribute"; technicalName: string; snapshots: AttributeSnapshot[] }
  >;
};

export function collectRuleEvidence(
  rule: { description: string | null; targets: RuleTarget[] },
  data: { runEvents: RunEvent[]; snapshots: AttributeSnapshot[] },
): RuleEvidenceBundle {
  return {
    ruleDescription: rule.description ?? "",
    targets: rule.targets.map((t) =>
      t.kind === "event"
        ? {
            kind: "event" as const,
            technicalName: t.technicalName,
            runEvents: matchEventLogs(t.id, data.runEvents),
          }
        : {
            kind: "custom_attribute" as const,
            technicalName: t.technicalName,
            snapshots: data.snapshots.filter((s) => hasCapturedValue(s, t.technicalName)),
          },
    ),
  };
}
