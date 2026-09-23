import { expect, it } from "vitest";
import { formatActivitySummary } from "./activity";
import type { ActivityLog } from "./queries";

const entry: ActivityLog = {
  id: "log-1",
  workspace_id: "ws-1",
  project_id: "project-1",
  actor_user_id: "user-1",
  entity_type: "validation_rules",
  entity_id: "rule-1",
  action_type: "insert",
  summary: 'Validation Rules "출국정보등록" insert',
  created_at: "2026-09-17T00:00:00Z",
  actor: { display_name: "홍길동" },
};

it("localizes historical English activity and preserves names", () => {
  expect(formatActivitySummary(entry)).toBe('홍길동 님이 검증규칙 "출국정보등록"을 등록했습니다.');
  expect(formatActivitySummary({ ...entry, action_type: "delete" })).toContain("삭제했습니다.");
});

it("uses saved actor and entity names and shows the changed fields", () => {
  expect(
    formatActivitySummary({
      ...entry,
      entity_type: "taxonomy_event_properties",
      action_type: "update",
      metadata: {
        actor_name: "수정자",
        entity_name: "purchase.price",
        changed_fields: "데이터 타입, 설명, 예시값",
      },
    }),
  ).toBe(
    '수정자 님이 이벤트 프로퍼티 "purchase.price"를 수정했습니다. 변경 항목: 데이터 타입, 설명, 예시값.',
  );
});

it("keeps external comment authors and handles missing authors", () => {
  expect(
    formatActivitySummary({
      ...entry,
      entity_type: "qa_comment",
      actor_user_id: null,
      summary: "고객님이 purchase.price에 댓글을 남겼어요.",
    }),
  ).toBe("고객 님이 purchase.price에 댓글을 남겼습니다.");
  expect(formatActivitySummary({ ...entry, actor: null })).toContain("이름 없는 사용자 님이");
  expect(formatActivitySummary({ ...entry, actor: null, actor_user_id: null })).toContain(
    "시스템이",
  );
});
