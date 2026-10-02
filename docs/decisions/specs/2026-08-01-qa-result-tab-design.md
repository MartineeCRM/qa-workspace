# 검증결과 탭 설계 — 로그 업로드 · 3단계 판정(AI 연동) · Result UI

- 날짜: 2026-08-01
- 상태: 승인됨 (구현 계획 단계로 진행)
- 선행 문서: [`2026-07-30-taxonomy-qa-redesign-design.md`](2026-07-30-taxonomy-qa-redesign-design.md)

## 배경

`2026-07-30-taxonomy-qa-redesign-design.md`에서 이미 세션/체크리스트/3단계 판정 모델(`qa_checklist_item_results`)과 논의(discussion) 스키마를 설계·승인했지만, 문서 말미 "남은 질문"에 다음 두 가지를 구현 계획 단계로 명시적으로 미뤄뒀다:

- AI 판정을 수행하는 실제 API 연동 방식
- 진행률/판정 결과를 보여주는 UI 상세 설계

이 문서는 그 두 가지를 구체화한다. 현재 스키마는 이미 준비돼 있지만(`qa_run_events`, `qa_attribute_snapshots`, `qa_checklist_item_results`의 `ai_verdict`/`ai_reasoning`/`ai_evidence`/`failed_layer`), 실제로 이 값을 채우는 로직도, 로그를 `qa_run_events`로 밀어넣는 업로드 기능도, 결과를 보여주는 화면도 전혀 구현되지 않은 상태다.

참고: 선행 문서 작성 이후 스키마가 두 군데 갈라졌다 — ① `qa_round_checklist_items`가 라운드 스코프에서 **세션 스코프**로 이관됐고(`20260731020000_move_checklist_items_to_session.sql`), ② `validation_rules`의 3-컬럼(event/property/custom_attribute) 방식이 **다대다 조인 테이블** `validation_rule_targets`로 재구성됐다(`20260731030000_validation_rule_multi_target.sql`). 이 문서는 현재 실제 스키마를 기준으로 한다.

## 목표

1. 세션 화면에 로그(CSV) 업로드 기능을 추가해 `qa_run_events`를 채운다.
2. 체크리스트 항목마다 3단계 판정(존재 → 구조 → 의미/AI)을 실행해 `qa_checklist_item_results`를 채운다.
3. AI 판정(레이어3)을 실제 Claude API 연동으로 구현한다.
4. 세션 화면에 "검증결과" 탭을 신설해 판정 결과와 근거를 사람이 확인·복사할 수 있게 한다.

## 비범위 (Out of scope)

- 논의(discussion) 스레드 UI — 스키마(`qa_discussions`/`qa_discussion_comments`)는 이미 있으나 이번 작업 범위 아님
- 차수(라운드) 간 자동 승계 로직 — 선행 문서에 설계돼 있으나 별도 작업
- 프로젝트/환경 전체의 진행률 롤업 대시보드 — 이번엔 세션 하나의 결과 화면만 다룸. 선행 문서 10절이 이미 "조인 쿼리로 집계"를 제안해뒀으니, 후속 작업에서 이 화면의 쿼리를 재사용해 만들 수 있음
- 스냅샷을 "이벤트 전/후"에 맞춰 찍도록 안내하는 UX 개선 — 지금 스냅샷 기능은 자유 형식 캡처만 지원. 동기화 판정 정확도에 영향을 주지만 별도 작업으로 분리
- 사람이 판정을 뒤집는 override 신규 UI — 기존 체크리스트 테이블의 "오류로 수정" 버튼(`useOverrideChecklistResult`)이 이미 처리하므로 검증결과 탭에서 중복 구현 안 함

## 아키텍처

### 1. 로그 업로드 → `qa_run_events`

세션 화면(체크리스트/스냅샷 옆)에 "로그 업로드" 버튼을 추가한다. CSV 형식은 선행 문서가 지정한 `EVENT_ID, USER_ID, TIME, NAME, PROPERTIES` 컬럼을 따른다 (`PROPERTIES`는 셀 안에 JSON 문자열).

```
파싱 규칙:
- NAME → taxonomy_events.technical_name과 매칭해 event_id 채움 (매칭 실패 시 event_id는 null로 남기고 raw_event_name만 저장)
- USER_ID → external_user_id
- TIME → occurred_at
- PROPERTIES → raw_properties (JSON.parse, 실패 시 빈 객체 + 파싱 경고 toast)
```

업로드 완료 시 각 행을 `qa_run_events`에 insert(`qa_session_id` 연결)하고, 곧바로 아래 3단계 판정을 그 세션의 체크리스트 전체에 대해 실행한다(기존 QA 환경 페이지의 "CSV 올리고 분석하기"와 동일하게 업로드+분석을 한 액션으로 묶음).

### 2. 3단계 판정 파이프라인

체크리스트 항목(`target_type: 'event' | 'custom_attribute'`)마다 순서대로 평가하고, 실패하면 즉시 확정하고 다음 레이어로 넘어가지 않는다 (AI 호출 최소화 목적도 겸함).

근거(`qa_run_events`/`qa_attribute_snapshots`)는 **이 체크리스트 항목이 속한 세션 하나로 스코프를 한정**한다. (선행 문서는 "라운드 전체 세션을 합친 타임라인"을 제안했지만, 이후 체크리스트 자체가 세션 스코프로 이관됐으므로 — 항목을 고른 세션의 로그/스냅샷만 근거로 쓰는 게 일관적이다. 라운드 전체 합산이 필요해지면 후속 작업에서 별도로 다룬다.)

**레이어 1 — 존재 (결정론적, 코드)**
- `event` 타입: 이 세션의 `qa_run_events`에 `event_id`가 일치하는 행이 1건이라도 있는가
- `custom_attribute` 타입: 이 세션의 `qa_attribute_snapshots` 중 가장 최근 캡처(`status='captured'`, `captured_at` 최댓값)의 `payload`에 해당 키가 있는가
- 없으면 `ai_verdict='not_collected'`, `judged_by='rule'` 확정, 레이어2/3 생략
- **`not_collected`도 "불합격 항목" 탭에 포함한다** (검증결과 탭은 통과/불합격 2탭 — 아직 수집도 안 된 항목은 QA 담당자가 조치해야 할 대상이므로 불합격 쪽으로 분류)

**레이어 2 — 구조 (결정론적, 코드)**
- `event`: 매칭된 `qa_run_events.raw_properties`가 `taxonomy_event_properties`의 `data_type`/`allowed_values`/`is_required`를 만족하는지 (이벤트 자체 + 그 프로퍼티 전부를 한 항목으로 취급)
- `custom_attribute`: 스냅샷 값이 `taxonomy_custom_attributes`의 `data_type`/`allowed_values`를 만족하는지
- 위반 시 `ai_verdict='failed'`, `failed_layer='structural'` 확정, 레이어3 생략
- `judged_by='rule'`

**레이어 3 — 의미 (AI, 비용 발생)**
- 레이어2를 통과했고, 이 항목을 타겟으로 하는 **활성(`is_enabled=true`) 검증 규칙이 있을 때만** 실행
- 규칙이 없으면 레이어2 통과 = 최종 통과, `judged_by='rule'`
- 규칙이 있으면 AI 호출 (아래 3번)

### 3. AI 연동 — TanStack Start 서버 함수

기존 `src/lib/attribute-snapshot.functions.ts`(`fetchBrazeAttributeSnapshot`)와 동일한 패턴을 따른다. Supabase Edge Function은 쓰지 않는다 — 이 프로젝트엔 그 인프라가 없고, TanStack Start 서버 함수가 이미 정착된 방식이기 때문이다.

```ts
// src/lib/ai-judge.functions.ts
export const judgeChecklistItemWithAI = createServerFn({ method: "POST" })
  .validator((data: JudgeInput) => data)
  .handler(async ({ data }): Promise<JudgeResult> => {
    // process.env.ANTHROPIC_API_KEY (서버 전용, VITE_ 접두사 없음 — 클라이언트에 노출 안 됨)
    // Claude API 호출 후 { verdict, reasoning, evidence } 반환
    // DB에 직접 쓰지 않음 — 클라이언트가 받아서 일반 RLS 권한으로 qa_checklist_item_results에 저장
  });
```

**핵심 설계 포인트 — 근거는 "항목 하나"가 아니라 "그 항목에 걸린 규칙의 전체 타겟" 기준으로 모은다.**
`validation_rule_targets`는 다대다라, 규칙 하나가 이벤트+어트리뷰트를 동시에 타겟으로 잡을 수 있다(예: "profile_update 이벤트 이후 membership_grade 어트리뷰트가 같은 값으로 바뀌어야 한다"). 어트리뷰트 체크리스트 항목 하나만 판정하려 해도, 그 항목이 걸린 규칙이 이벤트도 타겟으로 잡고 있다면 **그 이벤트의 `qa_run_events`도 함께** 서버 함수에 근거로 넘겨야 AI가 비교 판단을 할 수 있다.

어트리뷰트 타겟의 경우, 레이어1/2와 달리 **최신 스냅샷 하나가 아니라 이 세션에서 캡처된 스냅샷 전체(시간순)**를 근거로 넘긴다 — 동기화 판정은 "이벤트 전/후로 값이 어떻게 바뀌었는지" 비교가 핵심이라 단일 시점 값만으로는 판단이 안 된다.

```ts
type JudgeInput = {
  ruleDescription: string;
  targets: Array<
    | { kind: "event"; technicalName: string; runEvents: RunEventEvidence[] }
    | { kind: "custom_attribute"; technicalName: string; snapshotValue: unknown }
  >;
};
type JudgeResult =
  | { verdict: "passed" | "failed"; reasoning: string; evidence: unknown }
  | { error: string };
```

**비용 관점**: 레이어1/2를 통과하고 활성 규칙이 걸린 항목만 호출되므로, 구조적으로 판단 가능한 항목(대다수)은 AI를 거치지 않는다.

### 4. 스키마 변경

```sql
ALTER TABLE public.qa_checklist_item_results
  ADD COLUMN judged_by text CHECK (judged_by IN ('rule', 'ai'));
```

그 외 컬럼(`ai_verdict`, `ai_reasoning`, `ai_evidence`, `failed_layer`, `final_status`)은 이미 존재하므로 추가 변경 없음. `.env`에 `ANTHROPIC_API_KEY` 추가(서버 전용).

## UI — 검증결과 탭 (세션 화면 내)

세션 화면의 체크리스트/스냅샷 옆에 "검증결과" 탭을 신설한다. 구조는 아래 와이어프레임으로 검토·승인됨: https://claude.ai/code/artifact/463157ba-a0e1-4a55-96f9-f416731223d2

- **기본 탭 = 불합격 항목** (통과 항목이 기본이 아님 — QA 담당자가 먼저 봐야 하는 건 실패)
- 불합격 목록은 **심각도 순 정렬**: 미수집(`not_collected`, `failed_layer` 없음) → 구조(`failed_layer='structural'`) → 의미(`failed_layer='qualitative'`). 명백한 버그가 AI의 애매한 판단 아래 묻히지 않도록 함
- 마스터-디테일 레이아웃: 왼쪽 리스트(고정폭 ~380px, 항목명·상태 아이콘·`RULE`/`AI` 판정주체 뱃지) / 오른쪽 상세 패널
- 상세 패널: 판정 기준 → 기대값/실제값 → 판단 이유(`ai_reasoning` 또는 규칙 기반 자동 문구) → 근거 로그
- 근거 로그는 다크 코드 블록(검정 배경 · 흰 글씨)으로 표시, 문제 필드/값은 인라인 warning 톤으로 하이라이트. 블록 우상단에 클립보드 아이콘 복사 버튼
- **복사 버튼은 로그만이 아니라 항목명 + 기대값/실제값 + 판단 이유 + 근거 로그를 한 번에 복사** — QA 담당자가 슬랙/지라에 한 번 붙여넣는 것만으로 개발자가 맥락을 전부 알 수 있게 함 (원래 요청의 "개발자에게 바로 붙일 수 있는 형태"의 실제 의도)
- 다중 타겟 규칙으로 판정된 항목은 상세 패널에 "이 항목만으로는 판단 근거가 부족해 연결된 다른 타겟의 로그도 함께 가져왔다"는 안내를 표시
- 뱃지: 통과=녹색(`--published`), 실패=빨강(`--destructive`), 판정주체 `RULE`=중립 회색(`Pill`), `AI`=파란 info 톤(`SeverityBadge` info) — 기존 Trackspec 디자인 토큰 재사용, 새 팔레트 도입 안 함
- 사람이 판정을 override하는 기능은 새로 안 만듦 (기존 체크리스트 테이블의 "오류로 수정" 버튼이 이미 처리)

## 테스트 계획

- CSV 업로드 시 EVENT_ID/USER_ID/TIME/NAME/PROPERTIES가 `qa_run_events`로 올바르게 파싱되는지, NAME 매칭 실패 시 `event_id`가 null로 남고 `raw_event_name`은 보존되는지
- 레이어1에서 미수집 확정 시 레이어2/3이 실행되지 않는지
- 레이어2에서 구조 위반 시 레이어3(AI 호출)이 스킵되는지 — 즉 실패 항목에 불필요한 AI 호출이 나가지 않는지
- 규칙이 없는 항목은 레이어2 통과만으로 최종 통과 처리되는지 (AI 호출 없음)
- 다대다 규칙(이벤트+어트리뷰트 동시 타겟)을 가진 항목을 판정할 때, 서버 함수에 두 타겟의 근거가 모두 전달되는지
- AI 서버 함수가 `qa_checklist_item_results`에 직접 쓰지 않고 결과만 반환하며, 실제 저장은 클라이언트가 일반 RLS 권한으로 수행하는지
- `judged_by`가 rule/ai 각 경로에서 올바르게 기록되는지
- 검증결과 탭 첫 진입 시 "불합격 항목" 탭이 기본으로 활성화되는지
- 불합격 목록이 존재→구조→의미 순으로 정렬되는지
- 복사 버튼이 로그뿐 아니라 항목명/기대값/실제값/판단이유를 포함한 번들을 클립보드에 담는지

## 남은 질문 (다음 단계 과제)

- 프로젝트/환경 전체 진행률 롤업 대시보드 (선행 문서 10절의 집계 쿼리를 재사용해 별도 작업으로)
- 스냅샷 캡처 타이밍(이벤트 전/후) 가이드 UX
- 논의(discussion) 스레드 UI
- 차수 간 자동 승계 로직 UI
