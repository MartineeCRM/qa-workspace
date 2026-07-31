# 이벤트 프로퍼티 일괄 수정 설계

- 날짜: 2026-07-31
- 상태: 승인됨 (구현 계획 단계로 진행)

## 배경

`taxonomy_event_properties`는 이벤트별로 완전히 독립된 행으로 저장된다
([src/lib/queries.ts](../../../src/lib/queries.ts) `TaxonomyEventProperty`,
[src/components/app/taxonomy-tab.tsx](../../../src/components/app/taxonomy-tab.tsx) `AttributeDialog`).
같은 기술 이름(`technical_name`)을 가진 프로퍼티가 여러 이벤트에 반복해서 붙는 경우가 실제로 흔한데
(예: `platform`, `page_language`가 신세계 DF 프로젝트의 이벤트 81개 중 다수에 존재),
지금은 하나를 수정해도 나머지는 전혀 영향을 받지 않아 전부 각각 열어서 고쳐야 한다.

이 문서는 `AttributeDialog`에서 이벤트 프로퍼티를 수정할 때, 같은 이름을 가진 다른 이벤트의
프로퍼티에도 선택적으로 동일하게 적용하는 기능의 설계를 다룬다.

## 목표

- 이벤트 프로퍼티 수정 다이얼로그에서, 같은 기술 이름을 가진 다른 이벤트의 프로퍼티가 있으면
  자동으로 체크리스트가 나타난다.
- 기본은 전체 체크(전부 적용) 상태이며, 사용자가 원하는 항목만 체크 해제해 제외할 수 있다.
- 저장 시 체크된 이벤트들의 동일 이름 프로퍼티에 지금 수정한 내용(표시 이름/설명/데이터 타입/필수
  여부/허용 값, 그리고 기술 이름 자체)이 동일하게 반영된다.

## 비범위 (Out of scope)

- 이 프로퍼티가 아직 없는 다른 이벤트에 새로 추가하는 기능
- 사용자 속성(`taxonomy_custom_attributes`) — 프로젝트당 1행이라 애초에 중복이 없다
- "신규 추가" 모드(기존 프로퍼티가 아닌 새 프로퍼티를 만들 때)에서의 일괄 적용
- 커스텀 어트리뷰트 필드(`taxonomy_custom_attribute_properties`)의 일괄 적용

## 매칭 기준

`technical_name` 문자열이 동일하면 "같은 프로퍼티"로 간주한다. 현재 데이터 타입, 필수 여부 등이
서로 달라도 무관하게 묶는다 — 오히려 이 불일치를 한 번에 정리할 수 있게 하는 것이 이 기능의 목적
중 하나다. 활성/비활성(`is_active`) 여부와도 무관하게 포함한다.

## UI 설계

`AttributeDialog`는 **기존 이벤트 프로퍼티를 수정하는 경우에만**(즉 `attribute`가 있고
`isProperty`가 `true`인 경우에만) 아래 계산을 수행한다:

```
siblings = eventProperties.filter(
  p => p.technical_name === attribute.technical_name && p.id !== attribute.id
)
```

`siblings.length > 0`이면 다이얼로그 하단에 새 섹션을 렌더링한다:

```
다른 이벤트에도 적용 (12개)
[전체 선택]  [전체 해제]
┌─────────────────────────┐
│ ☑ login_viewed          │
│ ☑ purchase_completed    │
│ ☑ product_viewed        │
│ ...                     │  (스크롤 가능, max-h 지정)
└─────────────────────────┘
```

- 각 행은 `Checkbox` + 이벤트의 `technical_name` (mono-token 스타일)로 표시한다.
- 상태는 다이얼로그 로컬 state `Record<string, boolean>` (sibling property id → checked)로 관리하고,
  다이얼로그가 열릴 때 전체 `true`로 초기화한다.
- "전체 선택"/"전체 해제" 버튼은 이 state를 일괄 토글한다.
- 목록이 길어질 수 있으므로(예: `platform`이 수십 개 이벤트에 걸친 경우) 컨테이너에
  `max-h-48 overflow-y-auto` 정도를 적용한다.

`AttributeDialog`는 이 계산을 위해 `eventProperties: TaxonomyEventProperty[]`를 새 prop으로
받아야 한다 (현재는 `events`만 받고 있음). 호출부인 `TaxonomyTab`은 이미 `eventProperties`를
상위에서 갖고 있으므로 그대로 넘기면 된다.

## 데이터 처리

`submit()`에서 기존처럼 `basePayload`(표시 이름/설명/데이터 타입/필수 여부/허용 값)를 만들고,
여기에 새로 입력한 `technical_name`도 포함해 다음과 같이 한 번의 update로 처리한다:

```ts
const targetIds = [attribute.id, ...checkedSiblingIds];
const { error } = await db
  .from("taxonomy_event_properties")
  .update({ ...basePayload, technical_name: technicalName.trim() })
  .in("id", targetIds);
```

- 여러 번의 개별 update 호출 대신 **단일 update 쿼리**로 처리한다 (원자성이 더 좋고, 왕복도 줄어든다).
- 기술 이름을 바꾸는 경우 체크된 다른 이벤트의 프로퍼티도 같은 새 이름으로 바뀐다 — "같은 개념"으로
  묶어서 다루는 것이므로 이름 통일도 함께 간다는 것이 사용자 확인을 받은 의도다.
- `event_id`는 각 행마다 다르므로 이 update에 포함하지 않는다 (그대로 유지).
- 신규 생성(`attribute`가 `null`)이거나 사용자 속성을 다루는 경우, 이 로직 전체를 건너뛰고 기존
  단일 행 update/insert 경로를 그대로 사용한다.

## 완료 메시지

체크된 형제 프로퍼티가 1개 이상이면 토스트 메시지에 적용된 이벤트 수를 포함한다:

- 형제 없음 또는 전부 체크 해제: 기존 그대로 "속성을 수정했어요"
- 체크된 형제가 N개 있으면: `"속성을 수정했어요 (이벤트 ${1 + N}개에 적용)"`

## 테스트 관점

- 이 프로젝트는 별도 단위 테스트 스위트가 없으므로(수동 QA 중심), 구현 후 다음을 `agent-browser`로
  수동 검증한다:
  - 여러 이벤트에 걸친 프로퍼티(예: `platform`)를 수정 → 다이얼로그에 형제 목록이 뜨는지
  - 일부만 체크 해제하고 저장 → 체크 해제한 이벤트의 프로퍼티는 그대로인지, 나머지는 바뀌었는지
  - 형제가 없는 프로퍼티(이벤트 하나에만 존재)를 수정 → 섹션 자체가 안 뜨는지
  - 신규 프로퍼티 추가 모드 → 섹션이 안 뜨는지
  - 사용자 속성 수정 → 섹션이 안 뜨는지
  - `npx tsc --noEmit`, `npm run build` 클린 확인
