# 핸드오프 — 개발 QA 탭 라운드/세션/항목 워크플로우 재구성 (2026-08-03, 완료)

작업 위치: `/Users/aimed/Projects/qa-workspace/.worktrees/dev-qa-workflow-redesign`
브랜치: `feature/dev-qa-workflow-redesign` (origin에는 아직 안 올라감, main엔 아직 머지 안 됨)
플랜: `docs/superpowers/plans/2026-08-03-dev-qa-workflow-redesign.md` (13개 Task, 전부 완료)

## 상태: 13개 태스크 전부 구현 + 코드 리뷰 + 실제 로그인 E2E 검증까지 완료

`개발 QA`/`운영 QA` 탭을 평행한 3탭(라운드/업로드·분석 기록/검증 결과) 구조에서 라운드 › 세션 › 항목 3단 드릴다운 + 브레드크럼 구조로 재구성하는 작업. 전체 흐름(라운드 생성 → 세션 생성 → 체크리스트 추가 → 스냅샷/CSV 수집 → 분석 → 판정 결과 → 항목별 처리·논의 → 다음 차수 이월)을 실제 로그인해서 눈으로 확인했고, 전부 정상 동작한다.

## 구현 과정에서 찾아서 고친 실제 버그 3개

1. **라우트 경로 컨벤션 실수 (Task 6에서 발견)** — 플랜의 `<Link>`/`redirect` 예시 코드가 TanStack Router의 route-ID 형태(`/_authenticated/w/$wsId/...`)를 `to` 값으로 썼는데, 실제로는 fullPath 형태(`/w/$wsId/...`, `_authenticated` 접두사 없음)여야 한다. 이미 커밋된 Task 5 코드에도 같은 실수가 있어서 같이 고쳤다(`8c13fa5`). 플랜 문서 자체도 Task 11/12 예시까지 전부 고쳐놨다(`da756cc`, `1c51daf`).
2. **`viewingStep` stale 버그 (Task 7, Critical)** — 세션 전환 시 컴포넌트가 리마운트되지 않아 스텝퍼가 이미 끝난 세션의 이전 단계를 보여주거나, 반대로 방금 만든 세션에서 존재하지 않는 단계 패널이 렌더링될 수 있었다. `useEffect` 동기화 + 렌더 시점 clamp(`Math.min(viewingStep, currentStep)`)로 고쳤다(`652010b`, 코드 리뷰에서 정확한 시나리오까지 재현 검증함).
3. **"분석 돌리기" 버튼이 아예 없었음 (Task 13 수동 E2E에서 발견)** — 예전 시스템은 CSV 업로드 시 자동으로 판정까지 돌았는데, 새 설계의 수집 패널(Task 9)은 CSV만 올리고 판정(`useAnalyzeChecklist`)은 아무도 안 불렀다. 디자인 문서엔 이 버튼이 있어야 한다고 적혀 있었는데 Task 7 레퍼런스 코드에 넣는 걸 빠뜨렸었다. 세션 뷰 헤더에 추가해서 고쳤다(`48a8bac`).

## 배포 관련 — 반드시 알아야 할 것

**Task 1의 마이그레이션 파일은 작성만 되고 실제 Supabase DB엔 한동안 적용이 안 돼 있었다.** `supabase db push --dry-run`이 "프로젝트 연결 안 됨" 에러를 냈던 걸 그때는 "샌드박스 환경이라 그런가보다" 하고 넘어갔는데, 실은 진짜 문제였다. 이것 때문에 라운드 지표(통과/미해결 오류/다음 차수 이월)가 항상 0으로 보이고, 항목 뷰의 "라운드 이력"이 항상 비어있고, "이 항목 처리" 버튼들이 조용히(에러 토스트도 없이) 실패하는 상태였다.

**세션 도중에 사용자가 새 Supabase 개인 액세스 토큰을 발급해서 `~/.supabase/access-token`에 저장했고, 그걸로 Supabase Management API(`https://api.supabase.com/v1/projects/{ref}/database/query`)를 직접 호출해서 두 마이그레이션(`20260803010000_add_checklist_disposition_and_carryover.sql`, `20260803020000_add_qa_sessions_round_name_uq.sql`)을 실제 DB(`ilciucbaonbzikghfebk`, qa-workspace 프로젝트)에 적용 완료했다.** `supabase link`는 이 토큰으로도 "Unauthorized" 에러가 나서 안 됐지만(권한 범위 문제로 추정), Management API 직접 호출은 됐다 — 나중에 비슷한 상황이면 이 방법을 참고할 것. 컬럼/인덱스/정책 전부 SQL로 직접 조회해서 존재 확인했고, 그 뒤 로그인해서 라운드 지표·라운드 이력·처리 버튼·이월 자동 생성·논의 댓글까지 전부 실제로 동작하는 걸 확인했다.

## 남은 일 (선택)

- 플랜의 `subagent-driven-development` 실행 방식은 전체 구현 끝나면 "최종 코드 리뷰 subagent 1회 → `finishing-a-development-branch` 스킬로 merge/PR 결정"을 제안한다. 아직 이 두 단계는 안 밟았다 — 사용자와 다음 대화에서 이어서 하면 된다.
- 개요 탭의 프로젝트 전체 커버리지 숫자는 이번 작업으로 더 이상 갱신되지 않는다(사용자가 사전에 승인한 트레이드오프, 회귀 아님).
- `docs/design-reference/`, `~/Downloads/design_handoff_dev_qa_workflow 2/` 원본 디자인 파일은 참고용으로 그대로 둠, 코드에 영향 없음.

## 참고

- 로그인 정보는 사용자에게 직접 물어볼 것 — 하드코딩 금지. 테스트는 워크스페이스 "CRM" / 프로젝트 "신세계 DF"(SSG_DF, 테스트용 프로젝트로 사용자 확인됨)에서 함.
- 이 브랜치는 아직 origin에 push 안 됐고 main에도 안 합쳐졌다.
