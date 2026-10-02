import type { ActivityLog } from "./queries";

const entityLabels: Record<string, string> = {
  workspaces: "워크스페이스",
  projects: "프로젝트",
  taxonomy_events: "이벤트",
  taxonomy_attributes: "택소노미 속성",
  taxonomy_event_properties: "이벤트 프로퍼티",
  taxonomy_custom_attributes: "사용자 어트리뷰트",
  taxonomy_custom_attribute_properties: "어트리뷰트 하위 프로퍼티",
  taxonomy_categories: "택소노미 카테고리",
  validation_rules: "검증규칙",
  qa_uploads: "검증 로그",
  qa_rounds: "검증 차수",
  tracking_contracts: "트래킹 계약",
  contract_versions: "계약 버전",
  tracking_definitions: "트래킹 정의",
};

export function formatActivitySummary(entry: ActivityLog): string {
  // Historical customer comments carry the external author's name only in the summary.
  if (entry.entity_type === "qa_comment") {
    return entry.summary
      .replace(/\s*님이 /, " 님이 ")
      .replace(/댓글을 남겼어요\.$/, "댓글을 남겼습니다.");
  }
  const actorName =
    typeof entry.metadata?.actor_name === "string"
      ? entry.metadata.actor_name
      : entry.actor?.display_name?.trim();
  const actor = actorName
    ? `${actorName} 님이`
    : entry.actor_user_id
      ? "이름 없는 사용자 님이"
      : "시스템이";
  const name =
    typeof entry.metadata?.entity_name === "string"
      ? entry.metadata.entity_name
      : entry.summary.match(/"(.*)"/)?.[1];
  const label = entityLabels[entry.entity_type] ?? "항목";
  const action = { insert: "등록했습니다", update: "수정했습니다", delete: "삭제했습니다" }[
    entry.action_type
  ];
  const fields =
    typeof entry.metadata?.changed_fields === "string"
      ? entry.metadata.changed_fields
      : entry.summary.match(/수정 \((.*)\)$/)?.[1];
  const particleWord = name && /[가-힣]$/.test(name) ? name : label;
  const lastCode = particleWord.charCodeAt(particleWord.length - 1);
  const particle =
    lastCode >= 0xac00 && lastCode <= 0xd7a3 && (lastCode - 0xac00) % 28 === 0 ? "를" : "을";
  return `${actor} ${label}${name ? ` "${name}"` : ""}${particle} ${action ?? "변경했습니다"}.${fields ? ` 변경 항목: ${fields}.` : ""}`;
}
