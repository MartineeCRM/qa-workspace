# 핸드오프 — 개발 QA 탭 라운드/세션/항목 워크플로우 재구성 (2026-08-03)

작업 위치: `/Users/aimed/Projects/qa-workspace/.worktrees/dev-qa-workflow-redesign`
브랜치: `feature/dev-qa-workflow-redesign` (origin에는 아직 안 올라감, main엔 아직 머지 안 됨)
플랜: `docs/superpowers/plans/2026-08-03-dev-qa-workflow-redesign.md` (13개 Task, self-review 포함)
실행 방식: superpowers:subagent-driven-development — Task마다 (구현 subagent → spec 준수 리뷰 subagent → 코드 품질 리뷰 subagent) 3단계

이 파일은 이전에 `feature/taxonomy-qa-redesign` 작업용 핸드오프였다가 그 브랜치가 main에 머지되면서 이 새 워크트리에도 그대로 딸려온 파일이다 — 아래 내용으로 완전히 덮어썼다. 그 작업(택소노미 화면 재구성)은 이미 끝나서 main에 들어가 있으니 신경 쓸 필요 없다.

배경: `~/Downloads/design_handoff_dev_qa_workflow 2/README.md` + `QA 워크플로우 v3.dc.html` 디자인 핸드오프를 받아서, 개발 QA 탭의 평행한 3탭(라운드/업로드·분석 기록/검증 결과)을 라운드 › 세션 › 항목 3단 드릴다운 + 브레드크럼 구조로 재구성하는 작업. 사용자가 "서브에이전트 기반(옵션 1)"으로 진행하기로 확정한 상태에서 시작함.

---

## 지금까지 한 일

### 완료 (Task 1 — DB 마이그레이션)
- `supabase/migrations/20260803010000_add_checklist_disposition_and_carryover.sql` 커밋 `a11fd9d`.
- `qa_round_checklist_items`에 `disposition`/`carried_from_item_id`/`assigned_to`/`disposed_by`/`disposed_at` 컬럼 + 인덱스 + 새 UPDATE RLS 정책. `qa_discussions.checklist_item_result_id`에 UNIQUE 제약 추가.
- spec 준수 리뷰 ✅ 통과, 코드 품질 리뷰 ✅ 통과(Important: 실제 DB에 적용 전 `qa_discussions` 중복 행 있는지 사전 확인 권장 — 코드 변경이 아니라 배포 전 체크리스트 성격, 블로킹 아님. Minor: `ADD CONSTRAINT ... UNIQUE`가 이 저장소의 관례인 `CREATE UNIQUE INDEX ..._uq`와 스타일이 다름 — 기능은 동일, 굳이 안 고쳐도 됨).
- **다음 작업자가 할 일 없음. 이 태스크는 완결.**

### 진행 중, 미해결 버그 있음 (Task 2 — 순수 로직 `qa-workflow.ts`)
- 커밋 `154d0f3` — `src/lib/qa-workflow.ts`, `src/lib/qa-workflow.test.ts` 생성, `vitest.config.ts`에 `vite-tsconfig-paths` 플러그인 추가(이건 정상적이고 필요한 수정 — 유지할 것).
- **아직 spec 준수 리뷰도, 코드 품질 리뷰도 안 돌렸음.**
- **버그: `buildMergedTimeline`의 스냅샷 diff row 타임스탬프 anchoring이 잘못됨.**
  - 지금 코드(`qa-workflow.ts`의 `buildMergedTimeline` 안, `snapshotRows.push(...)` 부분)는 diff row의 `occurredAt`을 **이전** 스냅샷의 `captured_at`(또는 `requested_at`)에 고정한다.
  - 이건 내가(플랜 작성자) 플랜에 적어준 테스트(`qa-workflow.test.ts`)가 자체 모순이었기 때문에 생긴 일이다: 테스트는 `["cart_item_count", "cart_item_added"]` 순서(diff row가 이벤트보다 먼저)를 기대했는데, 정작 디자인 문서(README "2-3. 분석 패널" 목업 데이터)의 실제 예시 순서는 반대다:
    ```
    22:03:11 스냅샷 cart_item_count `0`
    22:04:02 이벤트 cart_viewed
    22:05:18 이벤트 cart_item_added   ← 이게 22:06:52보다 먼저 와야 정상
    22:06:52 스냅샷 cart_item_count `0 → 1`   ← diff row는 "현재(나중)" 스냅샷 시각에 찍힘
    ```
  - 즉 **올바른 anchoring은 "현재(나중) 스냅샷의 captured_at"**이다 (최초 플랜 Step 3 레퍼런스 코드가 실은 맞았음). Task 2 구현 subagent는 내가 준 틀린 테스트를 통과시키려고 구현을 반대 방향(이전 스냅샷 anchoring)으로 "고쳐서" 커밋했고, 본인도 이 anchoring 선택이 다른 사람 검토가 필요하다고 스스로 리포트에 남겼다(정확한 우려였음, 실제로 문제가 있었다).
  - 내가 그 구현 subagent에게 정정 지시(이어서: 현재 스냅샷 anchoring으로 되돌리고, 테스트 기대값을 `["cart_item_added", "cart_item_count"]`로 고치라는 내용)를 보내려던 참에 **사용자가 그 도구 호출을 취소**했고, 그 상태로 대화가 끊겼다. **정정은 아직 반영 안 됐다.**

---

## 다음에 할 일 (순서대로)

1. **Task 2 버그부터 고친다.** `src/lib/qa-workflow.ts`의 `buildMergedTimeline`에서 diff row의 `occurredAt`을 `previous.captured_at ?? previous.requested_at` 대신 `snapshot.captured_at`(현재/나중 스냅샷)으로 되돌린다. `src/lib/qa-workflow.test.ts`의 `"orders rows chronologically..."` 테스트에서 `rows.map((r) => r.name)`의 기대값을 `["cart_item_count", "cart_item_added"]` → `["cart_item_added", "cart_item_count"]`로, 그 아래 `rows[0]`/`rows[1]` 매칭도 순서에 맞게 수정한다. `npx vitest run` 전체와 `npx tsc --noEmit`으로 재검증 후 커밋(기존 `154d0f3`에 amend하거나 새 fix 커밋 — 아직 리뷰 전이라 amend가 더 깔끔함).
2. 고친 뒤 **Task 2의 spec 준수 리뷰 → 코드 품질 리뷰**를 순서대로 돌린다 (Task 1 때와 동일한 2단계 프로세스, `subagent-driven-development` 스킬의 `spec-reviewer-prompt.md`/`code-quality-reviewer-prompt.md` 템플릿 사용).
3. Task 3~13을 플랜 문서(`docs/superpowers/plans/2026-08-03-dev-qa-workflow-redesign.md`) 순서대로 이어서 진행한다. 각 Task마다: 구현 subagent 디스패치(플랜에서 해당 Task 전문 + Context 섹션을 복사해 프롬프트로 제공, subagent가 플랜 파일을 직접 읽게 하지 말 것) → 완료되면 spec 준수 리뷰 subagent → 통과하면 코드 품질 리뷰 subagent(품질 리뷰는 `superpowers:code-reviewer` subagent type 사용) → 둘 다 통과하면 TodoWrite에서 해당 Task를 completed로 표시하고 다음 Task로.
   - Task 7(세션 뷰 셸)은 Task 8~10(체크리스트/수집/분석 패널)이 끝나야 실제로 컴파일된다 — 플랜에 이미 명시돼 있음, 순서대로 진행하면 문제없음.
   - Task 11에서 Task 6의 라운드 지표 카드(세션 하나만 있던 것)를 4장으로 복원한다 — 플랜에 이미 반영돼 있음.
4. Task 13(레거시 컴포넌트 삭제 + 전체 회귀 확인)까지 끝나면, 플랜엔 명시 안 돼 있지만 `subagent-driven-development` 스킬 자체의 마지막 단계로 **전체 구현에 대한 최종 코드 리뷰 subagent**를 한 번 더 돌리고, 그다음 **`superpowers:finishing-a-development-branch`** 스킬로 넘어가 merge/PR 여부를 사용자와 정한다.

## 진행 상황 추적

이 세션의 TodoWrite에 13개 Task가 등록돼 있고 Task 1은 completed, Task 2는 in_progress로 표시돼 있었다(대화가 끊기기 전 상태) — 세션이 이어지면 이 목록을 그대로 참고하되, 위 "다음에 할 일"의 버그 수정이 Task 2 완료의 전제 조건이라는 걸 반영해서 갱신할 것.

## 참고

- 로그인 정보(테스트용 워크스페이스 CRM / 프로젝트 신세계 DF)는 사용자에게 직접 물어볼 것 — 하드코딩 금지.
- 이 브랜치는 아직 origin에 push 안 됐고 main에도 안 합쳐졌다. 다른 브랜치/워크트리는 이전 세션에서 이미 다 정리됐고 지금은 main + 이 워크트리만 존재한다.
