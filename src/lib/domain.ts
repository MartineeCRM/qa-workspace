export const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "소유자",
  admin: "관리자",
  editor: "편집자",
  viewer: "뷰어",
};

export const ROLE_DESCRIPTION: Record<WorkspaceRole, string> = {
  owner: "워크스페이스 삭제까지 포함한 모든 권한을 가져요.",
  admin: "워크스페이스 설정, 멤버, 프로젝트를 관리해요.",
  editor: "택소노미와 검증 규칙, QA 결과를 만들고 수정해요.",
  viewer: "워크스페이스의 모든 내용을 읽기 전용으로 볼 수 있어요.",
};

export function canEdit(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "editor";
}
export function canAdmin(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export const DATA_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "datetime",
  "array",
  "object",
] as const;
export type DataType = (typeof DATA_TYPES)[number];

export const RULE_TYPES = [
  "required_collection",
  "required_value",
  "data_type",
  "allowed_values",
  "numeric_range",
  "string_pattern",
  "event_attribute_consistency",
  "cross_event_consistency",
  "temporal_consistency",
  "custom",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const RULE_TYPE_LABEL: Record<RuleType, string> = {
  required_collection: "필수 수집",
  required_value: "필수 값",
  data_type: "데이터 타입",
  allowed_values: "허용 값",
  numeric_range: "숫자 범위",
  string_pattern: "문자열 패턴",
  event_attribute_consistency: "이벤트·속성 일관성",
  cross_event_consistency: "이벤트 간 일관성",
  temporal_consistency: "시간 순서 일관성",
  custom: "커스텀",
};

export const RULE_TYPE_HINT: Record<RuleType, string> = {
  required_collection: "해당 항목이 수집 로그에 반드시 나타나야 해요.",
  required_value: "해당 필드가 특정 값과 정확히 일치해야 해요.",
  data_type: "수집된 값이 지정한 데이터 타입이어야 해요.",
  allowed_values: "수집된 값이 정해진 목록 안에 있어야 해요.",
  numeric_range: "수집된 숫자가 지정한 범위 안에 들어와야 해요.",
  string_pattern: "수집된 문자열이 정규식 패턴과 맞아야 해요.",
  event_attribute_consistency: "한 속성이 다른 속성과 서로 어긋나지 않아야 해요.",
  cross_event_consistency: "두 이벤트 사이에서 같은 속성 값이 유지돼야 해요.",
  temporal_consistency: "한 이벤트가 다른 이벤트 이후 정해진 시간 안에 발생해야 해요.",
  custom: "JSON으로 직접 정의하는 고급 규칙이에요. 실행은 다음 단계에서 지원돼요.",
};

/**
 * 규칙 설정(JSON) 예시.
 * 이 JSON은 사람이 읽는 메모가 아니라 분석 엔진과 AI가 그대로 읽어서 실행하는 소스예요.
 * 그래서 키 이름과 구조를 임의로 바꾸지 말고 예시 형태를 유지해 주세요.
 */
export const RULE_CONFIG_EXAMPLE: Record<RuleType, Record<string, unknown>> = {
  required_collection: { min_occurrences: 1, within_upload: true },
  required_value: { expected_value: "KRW", case_sensitive: true },
  data_type: { expected_type: "number", coerce: false },
  allowed_values: { values: ["card", "bank_transfer", "point"], allow_null: false },
  numeric_range: { min: 0, exclusive_min: true, max: 10000000 },
  string_pattern: { pattern: "^ORD-[0-9]{10}$", flags: "" },
  event_attribute_consistency: {
    source_attribute: "amount",
    comparison: "equals",
    target_attribute: "total_price",
  },
  cross_event_consistency: {
    source_event: "add_to_cart",
    target_event: "purchase",
    shared_attribute: "item_id",
  },
  temporal_consistency: {
    preceding_event: "begin_checkout",
    following_event: "purchase",
    max_seconds: 1800,
  },
  custom: {
    description: "AI가 해석할 수 있도록 자연어 조건과 참고 필드를 함께 적어주세요.",
    expression: "amount > 0 AND payment_method IS NOT NULL",
    fields: ["amount", "payment_method"],
  },
};

export const SEVERITIES = ["critical", "warning", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "치명",
  warning: "경고",
  info: "정보",
};

export const PASS_CONDITIONS = [
  "all_records",
  "minimum_pass_rate",
  "maximum_failure_count",
] as const;
export type PassCondition = (typeof PASS_CONDITIONS)[number];
export const PASS_CONDITION_LABEL: Record<PassCondition, string> = {
  all_records: "모든 레코드 통과",
  minimum_pass_rate: "최소 통과율",
  maximum_failure_count: "최대 실패 건수",
};

/** QA 환경 안의 항목별 검증 상태예요. 환경은 상태만 저장하고 규칙은 갖지 않아요. */
export const ITEM_STATUSES = ["not_started", "verified", "failed", "blocked"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  not_started: "미시작",
  verified: "검증 완료",
  failed: "실패",
  blocked: "블로킹",
};

export const DEFAULT_STAGE_SLUGS = ["dev", "prod"] as const;

export function titleize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function slugify(value: string) {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `stage-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatPercent(value: number) {
  return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}

export function errorMessage(error: unknown, fallback = "문제가 발생했어요") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  const anyErr = error as { message?: string; details?: string; hint?: string };
  return anyErr.message || anyErr.details || anyErr.hint || fallback;
}

export function authErrorMessage(error: unknown, fallback = "문제가 발생했어요") {
  const msg = errorMessage(error, fallback);
  if (msg === "Invalid login credentials") return "이메일 또는 비밀번호가 올바르지 않아요";
  return msg;
}
