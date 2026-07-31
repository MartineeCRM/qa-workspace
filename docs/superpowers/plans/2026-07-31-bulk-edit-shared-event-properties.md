# 이벤트 프로퍼티 일괄 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `AttributeDialog`에서 이벤트 프로퍼티를 수정할 때, 같은 `technical_name`을 가진 다른 이벤트의 프로퍼티들도 체크박스로 선택해 한 번에 동일하게 반영할 수 있게 한다.

**Architecture:** `AttributeDialog`가 새 prop `eventProperties`를 받아 같은 이름의 "형제(sibling)" 프로퍼티를 계산하고, 체크박스 목록 UI를 렌더링한 뒤, `submit()`에서 기존의 `.update(payload).eq("id", attribute.id)` 단일 업데이트를 `.update(basePayload).in("id", targetIds)` 형태의 단일 쿼리로 교체한다. 형제가 없으면 `targetIds`가 `[attribute.id]` 하나뿐이라 기존과 동일하게 동작한다 — 별도 분기 없이 기존 단일 수정 케이스를 자연스럽게 포함한다.

**Tech Stack:** TanStack Start / React, Supabase JS client(`db`), Tailwind v4, Radix UI(`Checkbox`, `Dialog`). 이 프로젝트는 자동화된 테스트 스위트가 없어 수동 QA(agent-browser) 중심으로 검증한다.

**참고 문서:** [docs/superpowers/specs/2026-07-31-bulk-edit-shared-event-properties-design.md](../specs/2026-07-31-bulk-edit-shared-event-properties-design.md)

---

## File Structure

이번 작업은 파일 1개(`src/components/app/taxonomy-tab.tsx`)만 수정한다. 새 파일은 만들지 않는다 — `AttributeDialog`는 이미 이 파일 안에 정의된 로컬 컴포넌트이고, 이 기능은 그 컴포넌트의 내부 로직 확장이라 별도 파일로 분리할 이유가 없다.

- Modify: `src/components/app/taxonomy-tab.tsx`
  - `AttributeDialog` 컴포넌트 (현재 739~908행 부근): props에 `eventProperties` 추가, 형제 계산 + 체크박스 상태, 체크박스 UI 섹션, `submit()` 로직.
  - `<AttributeDialog ...>` 호출부 (현재 423행 부근, `TaxonomyTab` 컴포넌트 내부): `eventProperties={eventProperties}` prop 추가.

---

### Task 1: `AttributeDialog`에 `eventProperties` prop 연결

**Files:**
- Modify: `src/components/app/taxonomy-tab.tsx:423-431` (호출부)
- Modify: `src/components/app/taxonomy-tab.tsx:739-755` (컴포넌트 시그니처)

- [ ] **Step 1: 호출부에서 `eventProperties` prop 전달**

`src/components/app/taxonomy-tab.tsx`에서 다음 블록을 찾는다:

```tsx
      {attrDialog ? (
        <AttributeDialog
          projectId={projectId}
          userId={user?.id ?? ""}
          events={events}
          attribute={attrDialog.attribute}
          eventId={attrDialog.eventId}
          onClose={() => setAttrDialog(null)}
          onSaved={refresh}
        />
      ) : null}
```

다음으로 교체한다 (`eventProperties={eventProperties}` 한 줄 추가):

```tsx
      {attrDialog ? (
        <AttributeDialog
          projectId={projectId}
          userId={user?.id ?? ""}
          events={events}
          eventProperties={eventProperties}
          attribute={attrDialog.attribute}
          eventId={attrDialog.eventId}
          onClose={() => setAttrDialog(null)}
          onSaved={refresh}
        />
      ) : null}
```

(`TaxonomyTab`은 이미 `eventProperties`를 자신의 props로 받고 있으므로 새로 가져올 것은 없다.)

- [ ] **Step 2: `AttributeDialog` 함수 시그니처에 prop 추가**

다음 블록을 찾는다:

```tsx
function AttributeDialog({
  projectId,
  userId,
  events,
  attribute,
  eventId,
  onClose,
  onSaved,
}: {
  projectId: string;
  userId: string;
  events: TaxonomyEvent[];
  attribute: AnyAttribute | null;
  eventId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
```

다음으로 교체한다:

```tsx
function AttributeDialog({
  projectId,
  userId,
  events,
  eventProperties,
  attribute,
  eventId,
  onClose,
  onSaved,
}: {
  projectId: string;
  userId: string;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  attribute: AnyAttribute | null;
  eventId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
```

- [ ] **Step 3: 타입 체크로 시그니처 변경이 깨진 곳 없는지 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (이 시점엔 아직 `siblings` 등을 안 썼으니 새 prop이 그냥 안 쓰이는 것에 대한 에러도 없어야 함 — TS는 미사용 함수 파라미터를 기본적으로 에러로 잡지 않음)

- [ ] **Step 4: 커밋**

```bash
git add src/components/app/taxonomy-tab.tsx
git commit -m "Pass eventProperties into AttributeDialog"
```

---

### Task 2: 형제 프로퍼티 계산 + 체크박스 선택 상태

**Files:**
- Modify: `src/components/app/taxonomy-tab.tsx` (Task 1에서 수정한 `AttributeDialog` 본문 시작 부분)

- [ ] **Step 1: `useMemo` import 확인**

파일 최상단 import를 확인한다:

```tsx
import { useEffect, useMemo, useState } from "react";
```

`useMemo`가 이미 import되어 있다 (파일 상단에서 `TaxonomyTab`이 이미 쓰고 있음) — 추가 작업 없음.

- [ ] **Step 2: 형제 목록 계산과 체크 상태를 `AttributeDialog` 본문에 추가**

다음 블록을 찾는다 (Task 1에서 수정한 시그니처 바로 아래):

```tsx
  const [parent, setParent] = useState(
    attribute && "event_id" in attribute ? attribute.event_id : (eventId ?? "none"),
  );
  const isProperty = parent !== "none";
  const [technicalName, setTechnicalName] = useState(attribute?.technical_name ?? "");
```

다음으로 교체한다 (`isProperty` 선언 다음, `technicalName` state 앞에 형제 계산 로직을 끼워 넣음):

```tsx
  const [parent, setParent] = useState(
    attribute && "event_id" in attribute ? attribute.event_id : (eventId ?? "none"),
  );
  const isProperty = parent !== "none";

  const siblings = useMemo(() => {
    if (!attribute || !isProperty) return [];
    return eventProperties.filter(
      (p) => p.technical_name === attribute.technical_name && p.id !== attribute.id,
    );
  }, [attribute, isProperty, eventProperties]);

  const eventNameById = useMemo(
    () => new Map(events.map((e) => [e.id, e.technical_name])),
    [events],
  );

  const [checkedSiblings, setCheckedSiblings] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(siblings.map((s) => [s.id, true])),
  );

  function toggleAllSiblings(value: boolean) {
    setCheckedSiblings(Object.fromEntries(siblings.map((s) => [s.id, value])));
  }

  const [technicalName, setTechnicalName] = useState(attribute?.technical_name ?? "");
```

여기서 `siblings`는 `useState`의 lazy initializer 안에서 딱 한 번(마운트 시점)만 읽힌다. 다이얼로그는 매번 새로 열릴 때(부모의 `{attrDialog ? <AttributeDialog .../> : null}` 패턴으로 언마운트/재마운트) `attribute`가 고정되므로, 이 초기값 계산만으로 충분하고 별도 `useEffect` 동기화는 필요 없다.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (이 시점에는 `siblings`/`checkedSiblings`/`toggleAllSiblings`/`eventNameById`가 아직 JSX에서 안 쓰여서 "선언했지만 사용 안 함" ESLint 경고가 날 수 있음 — 이는 Task 3에서 JSX를 추가하면 해결되므로 지금은 무시한다. `tsc --noEmit`은 미사용 지역 변수를 기본적으로 에러로 잡지 않으므로 통과해야 한다.)

- [ ] **Step 4: 커밋**

```bash
git add src/components/app/taxonomy-tab.tsx
git commit -m "Compute sibling event properties for bulk-edit checklist"
```

---

### Task 3: "다른 이벤트에도 적용" 체크박스 UI 섹션 렌더링

**Files:**
- Modify: `src/components/app/taxonomy-tab.tsx` (`AttributeDialog`의 JSX, `필수` 스위치 블록 바로 다음)
- Import 추가 필요: `Checkbox` 컴포넌트

- [ ] **Step 1: `Checkbox` import 추가**

파일 상단 import 블록에서 다음 줄을 찾는다:

```tsx
import { Switch } from "@/components/ui/switch";
```

바로 아래에 추가한다:

```tsx
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
```

- [ ] **Step 2: 체크박스 섹션을 필수 스위치 블록 다음에 추가**

`AttributeDialog`의 JSX에서 다음 블록을 찾는다:

```tsx
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">필수</p>
              <p className="text-xs text-muted-foreground">항상 수집돼야 하는 속성이에요.</p>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving}>
            {attribute ? "변경 저장" : isProperty ? "Property 추가" : "어트리뷰트 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`</div>` (필수 스위치 블록 바로 다음, `<DialogFooter>` 이전)에 새 섹션을 끼워 넣어 다음으로 교체한다:

```tsx
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">필수</p>
              <p className="text-xs text-muted-foreground">항상 수집돼야 하는 속성이에요.</p>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>
          {siblings.length > 0 ? (
            <div className="space-y-2 rounded-md border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">다른 이벤트에도 적용 ({siblings.length}개)</p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAllSiblings(true)}
                  >
                    전체 선택
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAllSiblings(false)}
                  >
                    전체 해제
                  </Button>
                </div>
              </div>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {siblings.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`sibling-${s.id}`}
                      checked={checkedSiblings[s.id] ?? true}
                      onCheckedChange={(v) =>
                        setCheckedSiblings((prev) => ({ ...prev, [s.id]: v === true }))
                      }
                    />
                    <Label htmlFor={`sibling-${s.id}`} className="mono-token text-sm font-normal">
                      {eventNameById.get(s.event_id) ?? "—"}
                    </Label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving}>
            {attribute ? "변경 저장" : isProperty ? "Property 추가" : "어트리뷰트 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`siblings`는 신규 추가 모드(`attribute === null`)나 사용자 속성 편집(`isProperty === false`)일 때 항상 빈 배열이므로, 이 섹션은 Task 2의 계산 로직만으로 자동으로 숨겨진다 — 별도 조건 분기가 필요 없다.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `npm run build`
Expected: 빌드 성공 (경고 없이 완료)

- [ ] **Step 4: 커밋**

```bash
git add src/components/app/taxonomy-tab.tsx
git commit -m "Render bulk-apply checklist in AttributeDialog"
```

---

### Task 4: `submit()`을 단일 bulk update 쿼리로 교체

**Files:**
- Modify: `src/components/app/taxonomy-tab.tsx` (`AttributeDialog`의 `submit` 함수)

- [ ] **Step 1: `submit()` 교체**

다음 블록을 찾는다:

```tsx
  async function submit() {
    if (!technicalName.trim()) return toast.error("기술 이름은 필수예요");
    setSaving(true);
    const allowedValues = allowed
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const basePayload = {
      technical_name: technicalName.trim(),
      display_name: displayName.trim() || null,
      description: description.trim() || null,
      data_type: dataType,
      is_required: required,
      allowed_values: allowedValues.length ? allowedValues : null,
    };
    const table = isProperty ? "taxonomy_event_properties" : "taxonomy_custom_attributes";
    const payload = isProperty
      ? { ...basePayload, event_id: parent }
      : { ...basePayload, project_id: projectId };
    const { error } = attribute
      ? await db.from(table).update(payload).eq("id", attribute.id)
      : await db.from(table).insert({ ...payload, created_by: userId });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(attribute ? "속성을 수정했어요" : "택소노미에 속성을 추가했어요");
    onSaved();
    onClose();
  }
```

다음으로 교체한다:

```tsx
  async function submit() {
    if (!technicalName.trim()) return toast.error("기술 이름은 필수예요");
    setSaving(true);
    const allowedValues = allowed
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const basePayload = {
      technical_name: technicalName.trim(),
      display_name: displayName.trim() || null,
      description: description.trim() || null,
      data_type: dataType,
      is_required: required,
      allowed_values: allowedValues.length ? allowedValues : null,
    };
    const table = isProperty ? "taxonomy_event_properties" : "taxonomy_custom_attributes";

    if (attribute && isProperty) {
      const checkedSiblingIds = siblings
        .filter((s) => checkedSiblings[s.id] ?? true)
        .map((s) => s.id);
      const targetIds = [attribute.id, ...checkedSiblingIds];
      const { error } = await db.from(table).update(basePayload).in("id", targetIds);
      setSaving(false);
      if (error) return toast.error(errorMessage(error));
      toast.success(
        checkedSiblingIds.length > 0
          ? `속성을 수정했어요 (이벤트 ${1 + checkedSiblingIds.length}개에 적용)`
          : "속성을 수정했어요",
      );
      onSaved();
      onClose();
      return;
    }

    const payload = isProperty
      ? { ...basePayload, event_id: parent }
      : { ...basePayload, project_id: projectId };
    const { error } = attribute
      ? await db.from(table).update(payload).eq("id", attribute.id)
      : await db.from(table).insert({ ...payload, created_by: userId });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(attribute ? "속성을 수정했어요" : "택소노미에 속성을 추가했어요");
    onSaved();
    onClose();
  }
```

새 첫 번째 분기(`attribute && isProperty`)는 "기존 이벤트 프로퍼티 수정"의 모든 경우(형제가 있든 없든)를 처리한다 — 형제가 없으면 `targetIds`가 `[attribute.id]` 하나뿐이라 기존 동작과 동일하다. `event_id`는 이 분기에서 `basePayload`에 포함하지 않는다 — 수정 중엔 `parent`(이벤트 선택 Select)가 `disabled={!!attribute}`라 항상 `attribute.event_id`와 같은 값이고, 애초에 형제마다 `event_id`가 다르므로 일괄 페이로드에 넣으면 안 된다.

두 번째 분기(기존 코드 그대로)는 "신규 추가"와 "사용자 속성 수정/추가"만 남아서 처리한다.

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/app/taxonomy-tab.tsx
git commit -m "Bulk-apply event property edits to checked sibling events"
```

---

### Task 5: 수동 QA (agent-browser) + 최종 확인

이 프로젝트는 자동화 테스트 스위트가 없으므로, 설계 문서의 "테스트 관점" 절에 정의된 시나리오를 실제 로그인된 앱에서 `agent-browser`로 직접 확인한다.

**Files:** 없음 (검증만 수행)

- [ ] **Step 1: dev 서버 기동 확인**

Run: `npm run dev` (이미 떠 있다면 생략)
Expected: `http://localhost:8081`에서 응답

- [ ] **Step 2: 여러 이벤트에 걸친 프로퍼티 수정 → 형제 목록이 뜨는지 확인**

`agent-browser`로 로그인 세션에서 신세계 DF 프로젝트의 택소노미 화면을 열고, `platform`처럼 여러 이벤트에 존재하는 프로퍼티를 하나 골라 수정 다이얼로그를 연다.

Expected: "다른 이벤트에도 적용 (N개)" 섹션이 체크박스 목록과 함께 나타나고, 모든 체크박스가 기본으로 체크되어 있다.

- [ ] **Step 3: 일부만 체크 해제하고 저장 → 체크 해제한 이벤트는 그대로, 나머지는 바뀌는지 확인**

목록에서 이벤트 하나를 체크 해제하고, 표시 이름이나 설명을 바꿔서 저장한다. 이후 체크 해제했던 이벤트의 프로퍼티를 다시 열어 값이 안 바뀌었는지, 체크했던 다른 이벤트들은 새 값으로 바뀌었는지 확인한다.

Expected: 체크 해제한 이벤트의 프로퍼티는 원래 값 그대로. 체크된 나머지는 전부 새 값으로 바뀜. 저장 후 토스트 메시지에 "이벤트 N개에 적용"이 표시됨.

- [ ] **Step 4: 형제 없는 프로퍼티 → 섹션 안 뜨는지 확인**

한 이벤트에만 존재하는 프로퍼티(예: 그 이벤트 고유의 속성)를 수정 다이얼로그로 연다.

Expected: "다른 이벤트에도 적용" 섹션이 아예 렌더링되지 않음. 저장 시 토스트는 기존과 동일하게 "속성을 수정했어요" (개수 표시 없이).

- [ ] **Step 5: 신규 프로퍼티 추가 모드 → 섹션 안 뜨는지 확인**

이벤트 하나를 골라 "Property 추가"로 새 프로퍼티 추가 다이얼로그를 연다.

Expected: 형제 섹션이 뜨지 않음 (애초에 `attribute`가 `null`이라 계산 자체가 스킵됨).

- [ ] **Step 6: 사용자 속성 수정 → 섹션 안 뜨는지 확인**

어트리뷰트 탭에서 기존 사용자 속성(커스텀 어트리뷰트) 하나를 수정 다이얼로그로 연다.

Expected: 형제 섹션이 뜨지 않음 (`isProperty === false`).

- [ ] **Step 7: 최종 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `npm run build`
Expected: 빌드 성공

---

## Self-Review

- **스펙 커버리지:** 매칭 기준(technical_name only) → Task 2. 자동 트리거(수정 다이얼로그 안, attribute 있고 isProperty인 경우만) → Task 2/3. 기본 전체 체크 → Task 2 lazy initializer. 전체 선택/해제 버튼 → Task 3. 스크롤 가능한 목록(`max-h-48 overflow-y-auto`) → Task 3. 단일 update 쿼리(`.in("id", targetIds)`) → Task 4. 기술 이름 변경도 함께 반영 → Task 4 (`basePayload.technical_name` 포함). 신규 생성 미포함 → Task 4 두 번째 분기. 완료 토스트 메시지 문구 → Task 4. 수동 QA 시나리오 6가지 → Task 5. 전부 커버됨. 스펙에 있는데 태스크가 없는 항목 없음.
- **플레이스홀더 스캔:** "TBD"/"나중에"/"적절히 처리" 같은 표현 없음. 모든 스텝에 실제 코드/커맨드가 있음.
- **타입 일관성:** `AttributeDialog` props(`eventProperties: TaxonomyEventProperty[]`), `siblings`(`TaxonomyEventProperty[]`), `checkedSiblings`(`Record<string, boolean>`), `eventNameById`(`Map<string, string>`) 이름이 Task 2~4에서 동일하게 유지됨. `toggleAllSiblings`, `checkedSiblingIds`도 Task 2와 Task 4 사이에 동일한 이름으로 이어짐.
