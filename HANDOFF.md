# 핸드오프 — 개요(Overview) 탭 커버리지 재설계

상태: 시작 전. 아직 브랜치 안 팠음 — 이 문서 보고 새로 딸 것.
직전 완료 작업: `개발 QA`/`운영 QA` 탭 라운드 › 세션 › 항목 재구성 (`docs/superpowers/plans/2026-08-03-dev-qa-workflow-redesign.md`, main에 머지 완료, origin에 push됨).

## 문제

`개요` 탭(`src/routes/_authenticated/w/$wsId/p/$projectId/index.tsx`, `ProjectOverview` 컴포넌트)의 QA 환경별 실시간 커버리지 숫자가 더 이상 갱신되지 않는다. 사용자가 개발 QA 라운드를 전부 삭제해봤는데도 개요 화면 숫자는 그대로였다.

이건 회귀가 아니라 사전에 승인된 트레이드오프다 — 라운드/세션/항목 재구성 작업 중 legacy 코드를 제거하면서 생긴 부작용이고, "레거시 제거하고 개요 탭은 일단 멈춤"으로 사용자가 명시적으로 승인했다.

## 원인 (정확히 어디가 문제인지)

- 커버리지 계산 자체(`buildCoverageItems`, `environmentCoverage`, 둘 다 `src/lib/queries.ts:506-588`)는 지금도 매번 최신 택소노미 기준으로 재계산된다 — 이 부분은 고장 안 났음.
- 문제는 이 계산이 참조하는 `qa_item_status` 테이블(`useProjectItemStatuses`, `src/lib/queries.ts:435`)에 이제 아무도 안 쓴다는 것. 원래는 삭제된 `qa-rounds-panel.tsx`/`qa-result-panel.tsx`(라운드/세션/항목 재구성 작업의 마지막 태스크에서 제거)가 유일하게 이 테이블에 쓰던 코드였다.
- 새 워크플로우(`qa_rounds` → `qa_sessions` → `qa_round_checklist_items` → `qa_checklist_item_results`, disposition 포함)는 `qa_item_status`를 전혀 안 건드린다. 그래서 개요 화면은 legacy 데이터가 얼려진 스냅샷만 계속 보여주는 중이다.

## 고쳐야 할 부분

`ProjectOverview`가 `useProjectItemStatuses` + `environmentCoverage`로 커버리지·이슈 목록(`팔로업이 필요한 QA 이슈` 패널)을 만든다. 이 데이터 소스를 새 스키마 기준으로 바꿔야 한다.

## 결정해야 할 것 (아직 안 정함 — 여기서부터 시작)

두 방향이 있고 둘 다 일리 있어서 미리 골라놓지 않았다:

**방향 A — `qa_item_status`에 다시 쓰기 시작**
새 워크플로우가 disposition이 바뀔 때마다(`useSetDisposition`, `useCarryOverItems` 등, `src/lib/qa-rounds-queries.ts`) `qa_item_status`에도 upsert하도록 추가. 개요 쪽 코드(`queries.ts`, `index.tsx`)는 그대로 둘 수 있어서 구현 범위는 작다. 다만 상태를 두 곳에서 유지해야 해서 나중에 또 어긋날 여지가 있다 — 정확히 이번에 겪은 것과 같은 종류의 drift.

**방향 B — 개요가 새 스키마를 직접 읽도록 재작성**
`environmentCoverage`를 새 테이블(각 checklist item의 가장 최근 `qa_checklist_item_results.final_status` + `qa_round_checklist_items.disposition`) 기준으로 다시 짠다. `qa_item_status` 테이블/훅은 결국 삭제 대상. 구현 범위는 더 크지만 상태가 한 곳에만 존재하게 된다.

개인 의견: B가 낫다고 봄 — `qa_item_status`를 계속 이중 관리하면 이번과 같은 drift 버그가 또 날 가능성이 높다. 다만 이건 사용자가 최종 결정할 부분이고, 아직 그 결정을 안 한 상태로 이 핸드오프를 씀.

## 참고할 기존 코드

- `useRoundDispositionSummary`, `useChecklistItemRoundHistory` (`src/lib/qa-rounds-queries.ts`) — 이미 라운드 단위 disposition 집계 로직이 있어서, 방향 B로 갈 때 프로젝트/환경 단위로 확장하는 식으로 재사용할 수 있을지 볼 것.
- `EnvironmentCoverage`/`CoverageItem` 타입(`src/lib/queries.ts:498-561`)과 `CoverageBar` 컴포넌트(`src/components/app/coverage.tsx`) — 개요 화면이 기대하는 셰입이니, 방향 B로 가더라도 이 셰입은 유지하는 게 화면 쪽 변경을 최소화한다.
- `qa_round_checklist_items`는 여러 세션/라운드에 걸쳐 이월(carry-over)되면서 이어지므로, "이 이벤트/속성이 지금 이 환경에서 통과 상태인가"를 판단하려면 가장 최근 라운드·세션의 결과만 봐야 한다 — 과거 라운드 결과까지 다 합치면 안 됨.

## 작업 방식 참고

- 직전 작업은 워크트리(`~/Projects/qa-workspace/.worktrees/<브랜치명>`) + `subagent-driven-development` 방식으로 진행했다. 비슷하게 가도 되고, 이번 건 상대적으로 범위가 작아서 워크트리 없이 브랜치만 따도 될 것 같다.
- 테스트 계정: yoomin.jeong@martinee.io. agent-browser 로그인 프로필로 `qa-workspace-test`가 이미 저장돼 있음 (`agent-browser auth login qa-workspace-test`로 재로그인 가능, 비밀번호는 `.env.test-auth`에 로컬 저장돼 있고 git엔 안 올라감).
- 테스트 프로젝트: 워크스페이스 "CRM" → 프로젝트 "신세계 DF"(SSG_DF, 테스트용으로 사용자 확인됨).
- dev 서버는 보통 `http://localhost:8080`에 이미 떠 있음 (`npm start`).

## 참고 — 이번 세션에서 별도로 발견/수정한 것 (개요 작업과 무관, 이미 main에 반영됨)

라운드/세션/항목 재구성 머지 이후 실사용하면서 발견된 버그들을 개요 작업 전에 먼저 고쳤다:
- 라운드 0개일 때 빈 화면 → "새 라운드 시작" 버튼 (`31bd5de`)
- 에러 토스트가 친절한 메시지 대신 raw Postgres 에러를 보여주던 문제 (`887c98b`)
- 항목 뷰: Rule 판정인데 "AI 판정"으로 표시, 줄바꿈 안 됨, 근거 로그가 늘 비어있던 버그, 근거 로그 디자인 개선 (`ac64f1f`, `d18b4d5`)
- 택소노미에 없는 이벤트 프로퍼티가 조용히 통과되던 문제 → 위반으로 잡고 "택소노미에 추가" 버튼 제공 (`ed36e06`)

아직 안 고친 것 (사용자 확인만 받고 미적용):
- 체크리스트 패널 안내 문구 "지난 라운드에서 이월된 항목은 자동으로 담겨요"가 실제 동작(버튼 클릭 필요)과 안 맞음 — `src/components/app/qa-session-checklist-panel.tsx:132-133`.
