# QA Workspace Design System Handoff

> Claude Design 또는 다른 디자인 도구에 이 파일과 `src/styles.css`를 함께 전달하세요.
>
> **Single source of truth:** [`src/styles.css`](../src/styles.css)

## Claude Design에 전달할 지시문

QA Workspace의 기존 디자인 시스템을 기반으로 화면을 설계해주세요.

1. `src/styles.css`의 토큰을 디자인 시스템의 정본으로 사용합니다.
2. 기존 토큰을 비슷한 색상으로 임의 치환하거나 새로운 팔레트로 재해석하지 않습니다.
3. 시안의 색상, 타이포그래피, radius, 상태 표현은 가능한 한 아래의 토큰 이름으로 명시합니다.
4. 새 토큰이 반드시 필요하다면 기존 토큰에 섞지 말고 `Proposed tokens`로 별도 제안합니다.
5. 현재 QA 상세 화면에 남아 있는 hex 하드코딩은 디자인 시스템이 아니라 레거시입니다. 이를 복제하지 않습니다.
6. 장식적인 대시보드보다 정보 위계, 검증 상태, 근거 로그의 가독성을 우선합니다.
7. 산출물에는 사용한 토큰, 컴포넌트, 상태별 표현을 함께 명시합니다.

---

## 1. Product context

QA Workspace는 이벤트 택소노미와 실제 수집 로그를 비교하는 내부 B2B QA 도구입니다.

주요 사용자는 다음과 같습니다.

- 택소노미를 정의하고 관리하는 분석 담당자
- 이벤트와 프로퍼티를 구현하는 개발자
- Android, iOS, Web 환경에서 로그를 검증하는 QA 담당자
- 이슈를 확인하고 댓글과 상태를 남기는 고객사 담당자

화면의 가장 중요한 역할은 “예쁜 대시보드”가 아니라 다음 질문에 빠르게 답하는 것입니다.

- 무엇을 검증했는가?
- 무엇이 통과했고 무엇이 이슈인가?
- 아직 검증하지 않은 것은 무엇인가?
- 실제 수신 값과 택소노미 정의가 어떻게 다른가?
- 누가 어떤 이슈를 확인하고 처리하고 있는가?

## 2. Visual direction

### Keywords

- Professional internal B2B tool
- Calm and precise
- Evidence-first
- Dense but readable
- Restrained color
- Clear status hierarchy

### General appearance

- 옅은 회청색 화면 배경 위에 흰색 패널을 배치합니다.
- 짙은 청회색 텍스트와 얇은 중성 테두리를 사용합니다.
- 파란색은 주요 행동과 통과 상태에 사용합니다.
- 빨간색은 오류와 실제 이슈에만 사용합니다.
- 상태값은 색으로 강조하고, 출처 정보는 회색 텍스트로 낮춥니다.
- 큰 radius, 과한 그라데이션, 장식적인 그림자, 소비자용 SaaS 스타일은 피합니다.

## 3. Source of truth

### Code stack

- Tailwind CSS 4
- CSS custom properties using OKLCH
- Radix UI primitives
- shadcn/ui-style components
- class-variance-authority
- Lucide icons

### Primary files

| Purpose                     | Source                                |
| --------------------------- | ------------------------------------- |
| Global tokens and utilities | `src/styles.css`                      |
| Shared layout components    | `src/components/app/layout-parts.tsx` |
| Status badges               | `src/components/app/badges.tsx`       |
| Base UI components          | `src/components/ui/*`                 |
| Coverage visualization      | `src/components/app/coverage.tsx`     |

`src/styles.css`와 충돌하는 내용이 있다면 언제나 `src/styles.css`를 우선합니다.

## 4. Color tokens

모든 색상은 역할 기반 semantic token으로 사용합니다. 화면 시안에서도 가능하면 hex 값 대신 토큰 이름을 표기합니다.

### Light mode

| Token                       | OKLCH                    | Role                    |
| --------------------------- | ------------------------ | ----------------------- |
| `background`                | `oklch(0.977 0.005 250)` | 전체 화면 배경          |
| `foreground`                | `oklch(0.33 0.038 214)`  | 기본 텍스트             |
| `card`                      | `oklch(1 0 0)`           | 패널과 카드             |
| `card-foreground`           | `oklch(0.33 0.038 214)`  | 카드 텍스트             |
| `popover`                   | `oklch(1 0 0)`           | 팝오버와 메뉴           |
| `primary`                   | `oklch(0.53 0.088 244)`  | 주요 행동, 링크, 통과   |
| `primary-foreground`        | `oklch(0.99 0.003 250)`  | primary 위 텍스트       |
| `secondary`                 | `oklch(0.947 0.012 245)` | 보조 버튼과 영역        |
| `muted`                     | `oklch(0.955 0.006 248)` | 비활성·미검증 배경      |
| `muted-foreground`          | `oklch(0.59 0.032 215)`  | 설명과 메타데이터       |
| `accent`                    | `oklch(0.947 0.012 245)` | hover와 선택 보조 배경  |
| `destructive`               | `oklch(0.55 0.18 27)`    | 오류, 이슈, 삭제        |
| `border`                    | `oklch(0.9 0.012 245)`   | 기본 테두리             |
| `input`                     | `oklch(0.89 0.014 245)`  | 입력 필드 테두리        |
| `ring`                      | `oklch(0.53 0.088 244)`  | 키보드 포커스           |
| `surface`                   | `oklch(0.977 0.005 250)` | 행 hover와 약한 표면    |
| `surface-strong`            | `oklch(0.947 0.012 245)` | 테이블 헤더와 강조 표면 |
| `draft`                     | `oklch(0.93 0.03 90)`    | 미시작 상태 배경        |
| `draft-foreground`          | `oklch(0.44 0.09 74)`    | 미시작 상태 텍스트      |
| `published`                 | `oklch(0.92 0.06 148)`   | 완료 상태 배경          |
| `published-foreground`      | `oklch(0.45 0.15 146)`   | 완료 상태 텍스트        |
| `deprecated`                | `oklch(0.93 0.006 250)`  | 비활성·제외 상태        |
| `critical`                  | `oklch(0.55 0.21 27)`    | 치명 오류               |
| `warning`                   | `oklch(0.62 0.14 72)`    | 확인 필요               |
| `info`                      | `oklch(0.53 0.088 244)`  | 정보와 AI 확인 필요     |
| `sidebar`                   | `oklch(0.39 0.042 213)`  | 워크스페이스 사이드바   |
| `sidebar-foreground`        | `oklch(0.85 0.026 217)`  | 사이드바 기본 텍스트    |
| `sidebar-accent`            | `oklch(0.45 0.042 213)`  | 사이드바 선택·hover     |
| `sidebar-accent-foreground` | `oklch(0.99 0.003 250)`  | 선택된 사이드바 텍스트  |

다크 모드 값은 `src/styles.css`의 `.dark` 블록을 그대로 사용합니다. 현재 제품 시안은 라이트 모드를 우선합니다.

## 5. Typography

### Font families

| Role                  | Font                              |
| --------------------- | --------------------------------- |
| UI and Korean body    | `Pretendard Variable`, Pretendard |
| Latin fallback        | `IBM Plex Sans`                   |
| Technical identifiers | `JetBrains Mono`                  |

### Type scale

| Role            | Size |  Weight | Notes                        |
| --------------- | ---: | ------: | ---------------------------- |
| Page title      | 26px |     700 | `-0.02em` tracking           |
| Section title   | 22px |     700 | `-0.02em` tracking           |
| Stat value      | 30px |     700 | tabular numbers              |
| Panel title     | 14px |     600 | 짧고 직접적인 명칭           |
| Body            | 14px | 400–500 | 기본 UI 텍스트               |
| Supporting text | 12px |     400 | 출처, 설명, 시간             |
| Badge           | 11px |     600 | 상태값에만 사용              |
| Technical token | 13px | 400–600 | 이벤트·프로퍼티·어트리뷰트명 |

### Technical identifiers

다음 값에는 `mono-token` 스타일을 사용합니다.

- 이벤트명
- 이벤트 프로퍼티명
- 어트리뷰트명
- 타입명
- 실제 로그의 키
- 숫자·분모가 중요한 지표

## 6. Shape, elevation, and spacing

### Radius

기본 radius는 `0.375rem`입니다.

| Token       | Value | Typical usage     |
| ----------- | ----: | ----------------- |
| `radius-sm` |   3px | 작은 상태 칩      |
| `radius-md` |   5px | 버튼과 입력 필드  |
| `radius-lg` |   6px | 패널과 카드       |
| `radius-xl` |  10px | 제한적으로만 사용 |

### Elevation

- 기본 패널은 얇은 border와 `shadow-panel`을 사용합니다.
- 모달을 제외하면 강한 그림자를 사용하지 않습니다.
- 계층은 그림자보다 배경, border, 들여쓰기, 타이포그래피로 표현합니다.

### Spacing

4px 단위의 Tailwind spacing을 기본으로 사용합니다.

- 페이지 외곽: 24px
- 주요 섹션 간격: 20px
- 패널 헤더: 12px vertical / 16px horizontal
- 패널 본문: 12–16px
- 컨트롤 간격: 8px
- 밀도 높은 표 행: 8–12px vertical

## 7. Core components

### PageHeader

- 화면 전체 제목과 설명을 담당합니다.
- 우측에는 화면 전체에 영향을 주는 행동만 둡니다.
- 페이지마다 임의의 제목 크기를 만들지 않습니다.

### Panel

- `card` 배경, `border`, `radius-lg`, `shadow-panel`을 사용합니다.
- 패널 헤더와 본문 사이에는 border를 둡니다.
- 제목은 14px semibold, 설명은 12px muted입니다.

### Stat

- 라벨과 작은 아이콘을 상단에 둡니다.
- 값은 30px bold와 tabular number를 사용합니다.
- 의미 없는 장식용 아이콘이나 색상은 추가하지 않습니다.

### Buttons

| Variant       | Usage                          |
| ------------- | ------------------------------ |
| `default`     | 화면의 주요 행동 하나          |
| `secondary`   | 보조 행동                      |
| `outline`     | 중립적인 조작                  |
| `ghost`       | 반복 행 안의 가벼운 행동       |
| `destructive` | 삭제 또는 되돌리기 어려운 행동 |
| `link`        | 화면 이동                      |

한 영역에 primary 버튼을 여러 개 배치하지 않습니다.

### Badges and metadata

- 상태값만 색이 있는 badge로 표현합니다.
- QA 환경, 플랫폼, 세션, 라운드 같은 출처는 badge로 만들지 않습니다.
- 출처는 작은 회색 텍스트로 `개발 QA · Android · 1차`처럼 표시합니다.
- 상태 badge는 대상 이름 바로 옆에 배치합니다.

### Tables

- 헤더는 11px uppercase, semibold, letter spacing을 사용합니다.
- 데이터 키는 mono font를 사용합니다.
- 오류가 있는 실제 값은 빨간색과 semibold로 직접 강조합니다.
- 행 전체를 강한 빨간색으로 채우지 않습니다.
- 근거 로그 하이라이트는 약 30% 이하의 투명한 배경을 사용합니다.

## 8. Status language and color

상태값과 출처를 섞지 않습니다.

| Status         | Meaning                                 | Visual treatment       |
| -------------- | --------------------------------------- | ---------------------- |
| 통과           | 수집·타입·형식·의미 검증 통과           | primary 또는 published |
| AI 확인 필요   | 오류보다 통과에 가까우나 사람 확인 필요 | info blue              |
| 이슈 있음      | 아직 논의로 확인되지 않은 오류          | destructive red        |
| 확인 필요      | 논의와 판단이 필요한 상태               | warning amber          |
| 개발 수정 중   | 수정 작업 진행 중                       | info blue              |
| 다음 검증 대기 | 수정됐으며 다음 라운드 검증 필요        | published green        |
| 미검증         | 아직 판정하지 않음                      | muted gray             |

아이콘도 상태에 맞춰 변경합니다.

- 이슈 있음: circle alert
- 확인 필요: messages
- 개발 수정 중: wrench
- 다음 검증 대기: circle check
- 모든 상태에 동일한 경고 삼각형을 사용하지 않습니다.

## 9. Coverage visualization

커버리지는 업무 진행과 품질을 분리해서 보여줍니다.

### Definitions

- `reviewed = passed + issue`
- `validation progress = reviewed / total`
- `pass rate = passed / total`

### Display

```text
환경       검증 결과 분포                                      진행률   통과율
iOS 154   [ blue: passed ][ red: issue ][ gray: not reviewed ]   38.3%    3.9%
```

- 파란 영역은 통과한 대상입니다.
- 빨간 영역은 검증했고 이슈가 발견된 대상입니다.
- 회색 영역은 아직 검증하지 않은 대상입니다.
- 통과율은 막대의 파란 구간과 동일하게 `통과 ÷ 전체`로 계산합니다.
- 빨간색 자체가 검증 진행률은 아닙니다. 파란색과 빨간색의 합이 검증 진행률입니다.
- 환경 전체와 플랫폼 행의 막대·퍼센트 열은 같은 x 좌표에 정렬합니다.
- 전체 건수만 상시 표시하고, 통과·이슈·미검증 건수와 분수는 툴팁으로 제공합니다.

## 10. Information hierarchy

QA 결과 상세 화면은 다음 순서를 유지합니다.

1. 검증 대상과 현재 판정
2. 판정 요약
3. 근거 로그와 연관 로그
4. 실제 수신 값과 택소노미 정의 대조
5. 이슈 등록과 댓글

이벤트와 어트리뷰트는 상위 검증 대상입니다.

- 이벤트 아래에는 이벤트 프로퍼티가 옵니다.
- object 또는 array of object 어트리뷰트 아래에는 어트리뷰트 하위 필드가 옵니다.
- 상위 검증 대상과 하위 필드를 동일한 시각적 위계로 표현하지 않습니다.

## 11. Product vocabulary

다음 용어를 일관되게 사용합니다.

| Concept                | Korean label                  |
| ---------------------- | ----------------------------- |
| Event                  | 이벤트                        |
| Event property         | 이벤트 프로퍼티 또는 프로퍼티 |
| Custom attribute       | 어트리뷰트                    |
| Nested attribute field | 어트리뷰트 하위 필드          |
| Taxonomy               | 택소노미                      |
| Evidence log           | 근거 로그                     |
| Related log            | 연관 로그                     |

이 프로젝트에서는 이벤트에 딸린 값을 `속성`이나 `어트리뷰트`라고 부르지 않습니다. 반드시 `프로퍼티`라고 부릅니다. `어트리뷰트`는 custom attribute만 의미합니다.

## 12. Do and don't

### Do

- `src/styles.css`의 semantic token을 사용합니다.
- 상태값과 출처 정보의 위계를 분리합니다.
- 긴 로그는 줄바꿈, 접기/펼치기, 스크롤로 읽을 수 있게 만듭니다.
- 오류가 발생한 정확한 값이나 필드를 강조합니다.
- 테이블 열 너비는 정보 중요도와 데이터 길이에 맞게 설정합니다.
- 키보드 focus ring과 충분한 텍스트 대비를 유지합니다.

### Don't

- 기존 QA 상세 화면의 hex 값을 디자인 토큰으로 복사하지 않습니다.
- 모든 정보를 chip으로 만들지 않습니다.
- 모든 오류에 같은 경고 아이콘을 사용하지 않습니다.
- 통과율과 검증 진행률을 하나의 숫자로 합치지 않습니다.
- 큰 radius, 과도한 그림자, gradient 장식을 추가하지 않습니다.
- 프로퍼티와 어트리뷰트 용어를 혼용하지 않습니다.
- 실제 로그보다 AI 설명을 더 높은 위계에 배치하지 않습니다.

## 13. Legacy styling to normalize

다음 파일에는 전역 토큰이 아닌 hex 하드코딩이 남아 있습니다. 이 값들은 디자인 시스템의 정본이 아닙니다.

- `src/components/app/qa-item-view.tsx`
- `src/components/app/qa-item-spec-diff.tsx`
- `src/components/app/qa-session-checklist-panel.tsx`
- `src/components/app/qa-session-analysis-panel.tsx`
- `src/components/app/qa-session-results-panel.tsx`
- `src/routes/_authenticated/w/$wsId/p/$projectId/issues.tsx`
- `src/routes/share/$token.tsx`

새 시안에서는 이 파일들의 시각적 의도를 유지하되, 색상은 `src/styles.css`의 semantic token으로 매핑합니다.

## 14. Expected design deliverables

Claude Design이 새 화면이나 수정안을 만들 때 다음 내용을 함께 제공합니다.

1. 화면의 정보 구조
2. 사용한 기존 token 목록
3. 사용한 공통 component 목록
4. 상태별 표현 표
5. desktop과 narrow viewport 대응
6. 기존 시스템에 없는 값이 있다면 `Proposed tokens`
7. 레거시 하드코딩을 그대로 사용한 부분이 없는지 확인 결과
