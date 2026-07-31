# 핸드오프 — Trackspec 디자인 작업 (2026-07-31, 이어서 작업)

작업 위치: `/Users/aimed/Projects/qa-workspace/.worktrees/taxonomy-qa-redesign`
브랜치: `feature/taxonomy-qa-redesign` (원격 `origin` = `https://github.com/MartineeCRM/qa-workspace.git`)
로컬 dev 서버: `npm run dev` → `http://localhost:8081`

---

## ⚠️ 지금 커밋 안 된 변경사항 (먼저 확인 필요)

이전 핸드오프에 있던 변경사항은 이미 커밋됨(`0fb1948 Match taxonomy screen to reference design`). 이번 세션에서 "다음 순서" 2번 항목(상태/정렬 select, 페이지네이션 푸터)을 추가로 구현했고, 아래 파일이 **아직 커밋되지 않은 상태**로 남아 있어요 (사용자 명시 요청 없이는 커밋하지 않았어요):

```
M  src/components/app/taxonomy-tab.tsx        (상태/정렬 네이티브 select, 페이지네이션 추가)
?? src/components/ui/native-select.tsx        (신규 파일 — 네이티브 select 프리미티브)
```

`npx tsc --noEmit`, `npm run build` 둘 다 클린 상태로 확인됨. **화면 스크린샷 검증은 못 함** — 이 세션에서 agent-browser에 저장된 로그인 세션이 없어서 로그인 페이지에서 멈췄음(비밀번호 미보유, 추측하지 않음). 다음에 재개할 때 로그인 후 실제 동작(select 필터링, 더 보기 버튼) 확인 필요.

---

## 배경 — 이 작업이 왜 시작됐나

사용자가 최종 디자인 레퍼런스로 **"Trackspec Taxonomy.html"**이라는 Bundler 포맷 HTML 목업을 채팅에 직접 붙여넣었음. 지시사항: "agent-browser로 localhost:8081(실제 앱)을 열어서 현재 모습을 스크린샷 찍고, 이 html과 나란히 비교해서 뭐가 다른지 정리한 다음, 실제 앱 코드를 이 html의 스타일(여백/타이포/색/정렬)에 맞게 고쳐줘."

**2026-07-31 후속 세션에서 원본을 다시 붙여넣어줌** — 이제 `docs/design-reference/trackspec-taxonomy.html`에 저장해둠(사람이 읽을 수 있는 템플릿만 추출, 원본의 실행 가능한 React 번들 로더/gzip 자산은 뺐음 — 디자인 참고용으로는 정적 마크업이면 충분하고, 거대한 base64 블롭을 손으로 옮기다 깨질 위험도 피함). 원본 목업 안의 한글 텍스트 일부가 mojibake로 깨져 있어서 완벽 복원은 못 했지만, 아래 표와 "다음 순서" 항목에 이미 확인된 정확한 문자열은 반영해둠.

아래 "레퍼런스 스타일 값"은 그 목업에서 뽑아낸 정확한 수치들 — 원본이 없어도 이 문서만으로 계속 맞춰나갈 수 있게 정리해둠.

---

## 완료된 것

### 1) 디자인 토큰 (`src/styles.css`)
- `:root`/`.dark`의 `--foreground`/`--muted-foreground`/`--sidebar-*` 등을 기존 인디고 계열(hue ~245)에서 레퍼런스의 틸 계열(hue ~213–218)로 미세 조정. 배경/보더/카드 색은 이미 레퍼런스와 거의 일치했었음 (교체가 아니라 미세 조정이었다는 걸 스크린샷 비교로 확인 후 진행).
- `--radius: 0.375rem`로 통일 (카드 `rounded-xl` → `rounded-lg`).
- Pretendard 폰트 로드 (`src/routes/__root.tsx`에 CDN 링크 추가, `--font-sans`에 포함).

### 2) 타이포/프리미티브 (`src/components/app/layout-parts.tsx`)
- `PageHeader` h1: `26px/700/-0.02em`.
- 신규 `SectionHeader` (페이지 내 섹션 타이틀용, `22px/700/-0.02em`).
- `Stat` 컴포넌트 재작성: `icon` optional, `hint`/`delta`/`progress` prop 추가. `delta.tone==="up"`은 하드코딩 색 대신 기존 `--published-foreground` 토큰 재사용.

### 3) `SegmentedControl` 신규 컴포넌트 (`src/components/ui/segmented-control.tsx`)
- `bg-muted` 트랙 + 흰 배경 활성 pill. `taxonomy.tsx`의 "이벤트·속성 / 검증 규칙" 뷰 전환에 적용 (기존 Radix Tabs 대체).

### 4) 택소노미 화면 (`taxonomy.tsx` 라우트)
- 커버리지 Stat을 **실제 데이터**로 계산: `totalSlots = items.length * environments.length`, `verifiedSlots = qa_item_status에서 verified 개수`. `delta`는 히스토리 데이터가 없어서 **의도적으로 안 넣음** (조작된 수치를 보여주지 않기 위해).
- 나머지 3개 타일(이벤트/프로퍼티/어트리뷰트)은 아이콘 제거, 숫자만.
- 바깥 wrapper: `mx-auto max-w-[1240px] p-6 space-y-5` (합의된 "화면 골격 규칙").

### 5) 툴바/리스트 카드 (`taxonomy-tab.tsx`, `taxonomy-import.tsx`) — 이번 세션 핵심 작업
- **툴바 2개 드롭다운으로 통합**: `TaxonomyImport` = "가져오기 ▾" 하나로 (파일 업로드 + CSV/JSON/YAML 예시가 메뉴 항목), "이벤트 추가"/"사용자 속성 추가" = "+ 추가 ▾" 프라이머리 버튼 하나로. 화면당 primary 버튼 1개 규칙 준수.
- 상시 노출 안내 배너 제거.
- **검색 + 서브탭을 리스트 카드 헤더 안으로 이동**: "이벤트 N"/"어트리뷰트 N"은 밑줄(`shadow-[inset_0_-2px_0_...]`) 스타일 서브탭, 오른쪽에 검색창.
- **행 액션**: 연필/추가 아이콘 각각 노출 대신 `RowActions`라는 케밥(⋯) 드롭다운 하나로 통합, `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`으로 hover(+키보드 focus)에서만 노출. 삭제는 메뉴 안 destructive 항목 → 클릭 시 controlled `AlertDialog`로 확인.
- 토글 스위치 옆에 "측정 중"/"미측정" 텍스트 라벨 추가.

agent-browser로 실제 로그인 세션에서 스크린샷 확인 완료 (드롭다운 내용물, 케밥 메뉴 동작, hover reveal 전부 정상). 스크린샷은 세션 스크래치패드에 있었지만 세션 종료 시 사라짐 — 필요하면 재캡처.

---

## 레퍼런스 스타일 값 (원본 HTML 대체 참고용)

레퍼런스가 실제로 쓴 색/치수 (hex → 나중에 oklch로 변환해서 토큰에 반영함):

| 요소 | 값 |
|---|---|
| 사이드바 배경 | `#2A5159` |
| 사이드바 비활성 텍스트 | `#75A5C7` / 활성 `#fff` |
| accent (primary) | `#2E6C92`, hover `#24587A` |
| 페이지 배경 | `#F5F9FD` |
| 카드 보더 | `#DCE6EE` |
| 제목 텍스트 | `#1F3F46` |
| 본문/muted 텍스트 | `#6E8A91` |
| 콘텐츠 wrapper | `max-width:1240px; padding:28px 32px 80px` |
| 카드 라운드 | `10px` |
| 카드 헤더 padding | `14px 16px 14px 20px` |
| 행 padding | `16px 20px`, 구분선 `#EAF1F7` (카드 보더보다 옅음) |
| 프로퍼티 개수 배지 | 작은 사각 태그 (`border-radius:4px`), pill 아님 |
| 토글 pill | `34×20`, on 시 `#2E6C92` |

---

## 아직 안 한 것 (다음 순서)

1. **다른 화면으로 디자인 규칙 확산** (사용자 컨펌 대기 중, 여전히 보류) — 개요(`index.tsx`), QA 환경별 탭(`qa/$stageSlug.tsx`), 설정·멤버 화면에 동일하게: `SegmentedControl` 사용, 카드 헤더 검색 패턴, hover 전용 행 액션 + 케밥, 드롭다운 툴바 통합, `mx-auto max-w-[1240px] p-6 space-y-5` 골격, 그리고 이번에 추가한 상태/정렬 select + 페이지네이션 패턴도 포함.
2. ~~레퍼런스엔 있지만 아직 구현 안 한 기능 격차~~ → **이번 세션에서 완료** (원본 재확인 후 옵션 문구/기준을 레퍼런스와 정확히 맞춤):
   - ✅ 리스트 카드 헤더에 "상태"(전체 상태/측정 중/**중지됨**) + "정렬"(**이름순**/**최근 수정순**(`updated_at` 기준)/**프로퍼티 많은순**) 네이티브 select 2개 추가. 새 `src/components/ui/native-select.tsx` 프리미티브로 구현 (Radix `SelectTrigger`와 높이 `h-[34px]`/보더/라운드/폰트 맞춤). 기본 선택값은 "이름순"(레퍼런스의 `<select>`에 `selected` 속성이 없어서 첫 옵션이 기본값).
   - ✅ 리스트 하단 페이지네이션 푸터: `이벤트/어트리뷰트 {총개수}개 중 {표시개수}개 표시 중이에요` + "더 보기" 버튼. **페이지당 20개로 유지함** — 레퍼런스 문구는 "81개 중 6개 표시"지만, 그 "6"은 목업의 JS가 예시로 하드코딩한 이벤트가 딱 6개였을 뿐 의도된 페이지 크기로 보이지 않음(실제 81개 이벤트에 6개씩이면 "더 보기"를 너무 많이 눌러야 함) — 20으로 판단, 필요하면 조정 가능.
   - ⚠️ **용어 불일치 발견, 사용자 확인 필요**: 상태 select의 비활성 옵션은 레퍼런스대로 "중지됨"으로 넣었는데, 같은 화면의 행 토글 라벨은 (이전 세션에 이미 커밋된) "미측정"을 씀. 같은 `is_active` 필드를 가리키는 두 용어라 헷갈릴 수 있음 — 아직 임의로 통일하지 않았으니 다음에 어느 쪽으로 맞출지 확인해 주세요.
   - (의도적 보류) 커버리지 delta, "마지막 수정" 메타 라인 — 실제 데이터 없어서 안 넣음. 나중에 실제 히스토리 트래킹이 생기면 추가 검토.
   - 참고: 검색창 placeholder는 기존 코드가 "이벤트·Property·어트리뷰트 검색…"을 쓰는데 레퍼런스는 "이벤트·속성 검색"임 — 오늘 스코프 밖이라 안 건드렸음, 다음에 문구 통일할 때 참고.

---

## 별도 트랙 — 승인된 설계, 구현 대기 중 (디자인 작업과 무관, 참고용)

`docs/superpowers/specs/2026-07-31-bulk-edit-shared-event-properties-design.md`에 **사용자 승인 완료**된 스펙이 있음: 이벤트 프로퍼티 수정 시 같은 기술 이름을 가진 다른 이벤트의 프로퍼티에도 선택적으로 일괄 적용하는 기능. 다음 단계는 `writing-plans` 스킬로 구현 계획 작성 → 구현. 디자인 작업과는 독립적인 트랙이라 순서 상관없이 나중에 이어가도 됨.

---

## 재개 체크리스트

```bash
cd /Users/aimed/Projects/qa-workspace/.worktrees/taxonomy-qa-redesign
git status                    # 위 커밋 안 된 diff 확인
npm run dev                   # localhost:8081
npx tsc --noEmit && npm run build   # 변경 후 항상 확인
```

로그인: `yoomin.jeong@martinee.io` (비밀번호는 이 문서에 남기지 않음 — 필요하면 사용자에게 재확인).
실 고객 프로젝트: 신세계 DF (SSG_DF), workspace `38bbad58-...`, project `59a62862-...`.
