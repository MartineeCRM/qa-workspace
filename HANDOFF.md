# 핸드오프 — Trackspec 디자인 작업 (2026-07-31, 이어서 작업)

작업 위치: `/Users/aimed/Projects/qa-workspace/.worktrees/taxonomy-qa-redesign`
브랜치: `feature/taxonomy-qa-redesign` (원격 `origin` = `https://github.com/MartineeCRM/qa-workspace.git`)
로컬 dev 서버: `npm run dev` → `http://localhost:8081`

---

## ⚠️ 지금 커밋 안 된 변경사항 (먼저 확인 필요)

`native-select.tsx` 추가 + 첫 select/페이지네이션 작업은 `f45469a`로 이미 커밋됨. 그 이후 사용자 피드백으로 수정한 내용과, 별도로 발견된 커버리지 계산 버그 수정이 **아직 커밋되지 않은 상태**로 남아 있어요 (사용자 명시 요청 없이는 커밋하지 않았어요):

```
M  src/components/app/taxonomy-tab.tsx                              (상태 select "포함/미포함"으로 변경, "프로퍼티 많은순" 정렬 제거)
M  src/routes/.../$projectId/route.tsx                              (상단 탭 활성 표시를 파란색→검은색 밑줄로 수정)
M  src/routes/.../$projectId/taxonomy.tsx                            (커버리지 Stat 계산 버그 수정 — 아래 참고)
```

`npx tsc --noEmit`, `npm run build` 둘 다 클린 상태로 확인됨(2026-08-01 기준 재확인). **화면 스크린샷 검증은 여전히 못 함** — agent-browser에 저장된 로그인 세션이 없어서 로그인 페이지에서 멈췄음(비밀번호 미보유, 추측하지 않음).

⚠️ **동시 작업 주의**: 이 워크트리에서 다른 Claude Code 세션이 병행으로 `bulk-edit-shared-event-properties` 기능을 작업 중이었고(`0861f6a`~`22def01` 커밋, 이미 main 아님 이 브랜치에 커밋 완료), 파일 저장 타이밍이 겹쳐서 `taxonomy-tab.tsx`/`route.tsx` 편집이 몇 차례 서로 되돌리는 충돌이 있었음(지금은 다시 반영하고 tsc/build로 확인 완료). 재개 시 다른 세션이 같은 파일을 또 건드리고 있는지 `ps aux | grep claude`로 한번 확인해보는 게 안전함.

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
- 나머지 3개 타일(이벤트/프로퍼티/어트리뷰트)은 아이콘 제거, 숫자만.
- 바깥 wrapper: `mx-auto max-w-[1240px] p-6 space-y-5` (합의된 "화면 골격 규칙").
- ⚠️ **"검증 커버리지" 계산 버그 발견 및 수정 (2026-07-31 후속)**: 한때 `totalSlots = items.length * environments.length`(택소노미 항목 수 × QA 환경 수), `verifiedSlots = qa_item_status에서 verified 개수`로 퍼센트 Stat을 계산한 적이 있었음 — "각 환경이 전체 택소노미를 독립적으로 검증해야 한다"는 전제였는데, 실제로는 이 화면이 보여줘야 하는 건 환경별 진척도가 아니라 **택소노미 자체의 규모**(총 몇 개 항목이 정의돼 있는지)라 잘못된 지표였음. 환경별 실제 검증 진척도는 이미 프로젝트 개요 페이지와 각 QA 환경 페이지에서 환경별로 정확히 계산돼 나오고 있어서 여기서 중복 계산할 필요가 없었음. **수정**: `<Stat label="전체 커버리지" value={items.length} />`로 되돌림 — 퍼센트/progress bar/`useEnvironments`·`useProjectItemStatuses` 호출 전부 제거. 이 회귀와 어제 세션 있었던 "라운드/체크리스트 선택 버그"는 타이밍상 겹쳤을 뿐 서로 무관한 별개 이슈.

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
2. ~~레퍼런스엔 있지만 아직 구현 안 한 기능 격차~~ → **완료** (사용자 피드백 반영해서 최종 확정):
   - ✅ 리스트 카드 헤더에 "상태"(전체 상태/**포함**/**미포함**) + "정렬"(**이름순**/**최근 수정순**, `updated_at` 기준) 네이티브 select 2개 추가. 새 `src/components/ui/native-select.tsx` 프리미티브로 구현 (Radix `SelectTrigger`와 높이 `h-[34px]`/보더/라운드/폰트 맞춤). 기본 선택값은 "이름순".
     - 상태 옵션은 처음엔 레퍼런스 원문 그대로 "측정 중"/"중지됨"으로 넣었는데, 사용자가 "포함/미포함"으로 바꿔달라고 해서 그렇게 확정함 (행 토글 라벨 "측정 중"/"미측정"과는 여전히 다른 용어라 참고).
     - "프로퍼티 많은순" 정렬은 레퍼런스에 있었지만 사용자가 "정렬기준이 되지 못한다"고 판단해서 **삭제함** — 관련 카운트 정렬 로직(`getPropertyCount`)도 코드에서 제거.
   - ✅ 리스트 하단 페이지네이션 푸터: `이벤트/어트리뷰트 {총개수}개 중 {표시개수}개 표시 중이에요` + "더 보기" 버튼. **페이지당 20개로 유지함** — 레퍼런스 문구는 "81개 중 6개 표시"지만, 그 "6"은 목업의 JS가 예시로 하드코딩한 이벤트가 딱 6개였을 뿐 의도된 페이지 크기로 보이지 않음(실제 81개 이벤트에 6개씩이면 "더 보기"를 너무 많이 눌러야 함) — 20으로 판단, 필요하면 조정 가능.
   - ✅ **상단 프로젝트 탭(개요/택소노미/개발 QA/운영 QA) 활성 표시 수정** (`route.tsx`의 `TabLink`): 레퍼런스는 현재 탭을 검은색(`#1F3F46`, 제목 텍스트와 동일) 밑줄 + semibold로 표시하는데, 실제 코드는 파란색(`border-primary`) 밑줄 + medium이었음. `border-foreground text-foreground font-semibold`로 수정, 비활성 탭도 `font-medium`으로 맞춤.
   - (의도적 보류) 커버리지 delta, "마지막 수정" 메타 라인 — 실제 데이터 없어서 안 넣음. 나중에 실제 히스토리 트래킹이 생기면 추가 검토.
   - 참고: 검색창 placeholder는 기존 코드가 "이벤트·Property·어트리뷰트 검색…"을 쓰는데 레퍼런스는 "이벤트·속성 검색"임 — 스코프 밖이라 안 건드렸음, 다음에 문구 통일할 때 참고.

---

## 별도 트랙 — bulk-edit (디자인 작업과 무관, 참고용)

이벤트 프로퍼티 수정 시 같은 기술 이름을 가진 다른 이벤트의 프로퍼티에도 선택적으로 일괄 적용하는 기능. 이 워크트리에서 **다른 세션이 병행 작업 → 구현 완료 및 커밋됨**: `0861f6a`(체크리스트용 형제 프로퍼티 계산) → `cf8c703`(`AttributeDialog`에 체크리스트 렌더) → `22def01`(체크된 형제 이벤트에 일괄 적용). 계획 문서는 `docs/superpowers/plans/2026-07-31-bulk-edit-shared-event-properties.md`. 디자인 작업과 독립적인 트랙이라 지금은 신경 안 써도 됨 — main 병합 시 같이 딸려감.

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
