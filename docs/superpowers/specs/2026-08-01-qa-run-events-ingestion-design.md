# CSV 업로드 → qa_run_events 연동 설계

- 날짜: 2026-08-01
- 상태: 승인됨 (구현 계획 단계로 진행)

## 배경

QA 환경 페이지(`src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx`)의 "CSV 올리고
분석하기" 기능은 지금 업로드된 CSV의 각 행(이벤트)을 개별 저장하지 않고, 택소노미 항목별
검증됨/실패 집계만 `qa_item_status`에 upsert한 뒤 원본 행 데이터는 버린다.

한편 스키마엔 `qa_run_events`라는 테이블이 이미 있다 — 이벤트 하나하나를 세션(`qa_session_id`)·
택소노미 이벤트(`event_id`)와 연결해 원본 그대로 저장하도록 만들어진 구조인데, 앱 코드 어디에서도
읽거나 쓰지 않는 완전히 미구현 상태였다. 사용자가 실제 이벤트 유저로그(CSV)를 업로드했는데 여기에
아무것도 안 쌓이는 걸 확인하면서 이 작업이 시작됐다.

실제 사용자의 CSV 파일을 확인한 결과 헤더는 `EVENT_ID,USER_ID,TIME,NAME,PROPERTIES` 형태이고,
`PROPERTIES` 컬럼엔 개별 속성들이 JSON 문자열로 뭉쳐 들어있다. 이 형태를 확인하는 과정에서 **기존
검증/실패 집계 로직의 버그**도 함께 발견했다 — 지금 로직은 CSV의 각 컬럼명을 그대로 속성 이름으로
취급하기 때문에, `PROPERTIES`처럼 값이 JSON으로 뭉쳐있는 컬럼은 "PROPERTIES라는 속성이 있다"로만
인식되고 그 안의 `platform`, `page_title` 같은 개별 속성은 전혀 인식되지 않는다. 이 버그도 이번
작업에서 함께 고친다 — 어차피 이번 작업이 PROPERTIES를 JSON으로 해석하는 로직을 새로 만들어야 하고,
그 결과를 검증/실패 판정에도 그대로 재사용하면 되기 때문에 별도로 나눌 이유가 없다.

## 목표

- CSV를 올릴 때 반드시 특정 QA 세션을 지정하게 만든다.
- CSV의 모든 행을 원본 그대로 `qa_run_events`에 저장한다 (택소노미에 등록 안 된 이벤트 이름도
  포함해서 전부 저장 — 나중에 로그를 보면서 오타/신규 이벤트를 직접 확인할 수 있어야 하므로).
- CSV에 개별 속성이 담긴 컬럼(예: `PROPERTIES`)이 있으면 JSON으로 해석해서, 그 안의 개별 속성명
  기준으로 검증됨/실패 판정을 한다 (기존 버그 수정).
- 시간·유저 구분 컬럼이 없는 CSV는 업로드 자체를 에러로 막는다 — 지금처럼 집계만 절반 성공하는
  애매한 상태를 만들지 않는다.

## 비범위 (Out of scope)

- `qa_run_events`에 쌓인 원본 로그를 화면에서 조회/검색하는 UI — 이번엔 저장까지만 하고, 조회
  화면은 필요할 때 별도로 설계한다.
- `qa_item_status`/`qa_uploads`/`qa_analysis_runs`(구버전 시스템)를 `qa_rounds`/`qa_sessions`
  기반 신버전으로 통합·정리하는 작업 — 사용자가 별도로 대기시킨 더 큰 작업이라 이번 범위에서 뺀다.
  이번 작업은 구버전 집계 로직(`qa_item_status` upsert)을 그대로 유지한 채, 그 옆에 원본 로그
  저장을 추가하는 것뿐이다.
- `qa_run_events.event_id`가 비어있는(택소노미에 없는 이벤트 이름) 행에 대한 별도 알림/경고 UI.

## 세션 선택 UI

지금 "CSV 올리고 분석하기" 버튼(`PageHeader`의 `actions`, `$stageSlug.tsx` 약 311행)은 어느 탭에
있든 항상 눌리는 상태다. 이 페이지엔 이미 `activeSessionId`라는 상태가 있고(`QaRoundsPanel`의
`onActiveSessionChange`로 세팅됨), Braze 어트리뷰트 스냅샷 패널이 정확히 이 값으로 "세션 선택
안 하면 안내만 표시, 선택하면 그 세션 기준으로 동작"하는 패턴을 이미 쓰고 있다
(`{activeSessionId ? <SnapshotPanel .../> : <EmptyState title="선택된 세션이 없어요" .../>}`,
약 413행).

CSV 업로드 버튼도 같은 패턴을 따른다: `disabled={busy || !activeSessionId}`로 바꾸고, 버튼 주변
안내 문구(현재 "이 환경은 현재 택소노미를 검증해요..." 설명)에 세션 미선택 시 "라운드 탭에서
세션을 먼저 골라주세요"를 덧붙인다.

## 컬럼 인식과 에러 처리

지금 이벤트 이름 컬럼을 찾는 방식(`EVENT_COLUMNS = ["event","event_name","eventname","name"]`,
대소문자 무시 대조)과 똑같은 패턴으로 두 개를 더 추가한다:

```ts
const TIME_COLUMNS = ["time", "timestamp", "occurred_at", "event_time"];
const USER_COLUMNS = ["user_id", "external_user_id", "userid", "distinct_id"];
const PROPERTIES_COLUMNS = ["properties", "props", "raw_properties"];
```

`runAnalysis()` 시작 부분에서 헤더 중 시간 컬럼과 유저 컬럼을 찾는다. 둘 중 하나라도 못 찾으면
`toast.error`로 구체적인 이유(예: "시간 컬럼을 찾을 수 없어요 — TIME 같은 컬럼이 있어야 해요")를
보여주고 `runAnalysis()` 전체를 중단한다 — `qa_uploads`/`qa_item_status`/`qa_analysis_runs`/
`qa_run_events` 어디에도 아무것도 안 남긴다.

속성 컬럼(`PROPERTIES_COLUMNS`에 해당하는 헤더)을 찾으면, 각 행에서 그 컬럼의 값을 `JSON.parse`로
해석해 얻은 객체의 key들을 그 행의 "속성 목록"으로 쓴다. JSON 파싱이 실패하는 행이 있으면(깨진
데이터) 그 행의 속성 인식은 건너뛰지만 원본 로그 저장(`qa_run_events` insert)은 그대로 진행한다 —
집계용 파싱 실패가 원본 보관까지 막을 이유는 없다. 속성 컬럼을 못 찾으면 지금 로직 그대로(각
CSV 컬럼 자체를 속성 하나로 취급) 동작한다 — 기존 방식대로 업로드하던 파일과의 호환성을 유지한다.

## qa_run_events 저장

컬럼 검증을 통과하면, CSV의 모든 행에 대해 다음을 만들어 `qa_run_events`에 한 번에 insert한다:

```ts
{
  qa_session_id: activeSessionId,
  event_id: eventByTechnicalName.get(row[nameColumn]) ?? null,
  raw_event_name: row[nameColumn],
  occurred_at: new Date(row[timeColumn]).toISOString(),
  external_user_id: row[userColumn],
  raw_properties: propertiesColumn
    ? (safeJsonParse(row[propertiesColumn]) ?? {})
    : Object.fromEntries(
        parsed.headers
          .filter((h) => h !== nameColumn && h !== timeColumn && h !== userColumn)
          .map((h) => [h, row[h]]),
      ),
}
```

`eventByTechnicalName`은 이미 컴포넌트에 있는 `events`(택소노미 이벤트 목록)를
`technical_name`으로 매핑해 만든다. 이름이 일치하지 않으면 `event_id`는 `null`로 남는다(비범위
항목에서 밝혔듯, 이런 행에 대한 경고 UI는 이번엔 안 만든다).

기존 `qa_item_status` upsert와 `qa_analysis_runs` insert 로직은 그대로 유지하되, 속성 판정 부분만
위의 "속성 컬럼이 있으면 JSON에서 뽑은 key 기준으로" 로직으로 교체한다.

## 테스트 관점

자동화 테스트가 없는 프로젝트라 `agent-browser`로 수동 검증한다:

- 세션 선택 안 하고 CSV 업로드 버튼 확인 → 비활성화 상태이고 안내 문구가 보이는지
- 라운드 탭에서 세션 고른 뒤 업로드 → 버튼이 활성화되는지
- `TIME`/`USER_ID`/`NAME`/`PROPERTIES` 형태의 실제 CSV 업로드 → `qa_run_events`에 행 수만큼
  저장되는지, 각 행의 `occurred_at`/`external_user_id`/`raw_event_name`/`raw_properties`가
  올바른지, 택소노미에 있는 이벤트 이름은 `event_id`가 채워지는지
- 시간 컬럼이 없는 CSV 업로드 → 에러 토스트가 뜨고 아무 테이블에도 안 쓰였는지 확인
- PROPERTIES 안의 개별 속성(`platform` 등)이 택소노미 속성 검증에 제대로 반영되는지 (기존 버그
  수정 확인)
- `npx tsc --noEmit`, `npm run build` 클린 확인
