# CSV 업로드 → qa_run_events 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QA 환경 페이지의 CSV 업로드가 (1) 반드시 세션을 지정해야 동작하고, (2) 업로드된 모든 행을 `qa_run_events`에 원본 그대로 저장하며, (3) `PROPERTIES` 같은 JSON 뭉침 컬럼의 개별 속성을 검증/실패 판정에 제대로 반영하도록 만든다.

**Architecture:** `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx` 한 파일 안에서 4가지를 순서대로 바꾼다 — CSV 업로드 버튼을 `activeSessionId`(이미 있는 페이지 상태)로 게이팅, 시간/유저 컬럼 인식과 누락 시 전체 중단, `PROPERTIES` 컬럼 JSON 파싱을 통한 속성 판정 교체, 그리고 파싱된 각 행을 `qa_run_events`에 insert. 기존 `qa_item_status`/`qa_analysis_runs` 쓰기 로직은 유지한다.

**Tech Stack:** TanStack Start / React, Supabase JS client(`db`), Tailwind v4. `qa_run_events`의 Row/Insert 타입은 `src/integrations/supabase/types.ts`에 이미 생성되어 있어 새 타입 정의가 필요 없다. 자동화된 테스트 스위트가 없어 수동 QA(agent-browser) 중심으로 검증한다.

**참고 문서:** [docs/superpowers/specs/2026-08-01-qa-run-events-ingestion-design.md](../specs/2026-08-01-qa-run-events-ingestion-design.md)

---

## File Structure

이번 작업은 파일 1개만 수정한다. 새 파일은 만들지 않는다 — `qa_run_events`의 TypeScript 타입은 이미 `src/integrations/supabase/types.ts`에 자동 생성되어 있고(`Row`/`Insert`/`Update`, `qa_session_id`/`event_id`/`raw_event_name`/`occurred_at`/`external_user_id`/`raw_properties` 필드 전부 포함), `src/lib/queries.ts`에 별도 훅을 추가할 필요가 없다 — 이번 스펙은 "조회 화면"을 비범위로 명시했으므로 쓰기(`insert`)만 하면 되고, `db.from("qa_run_events").insert(rows)`는 기존 `db.from("qa_analysis_runs").insert(...)` 패턴과 동일하게 타입 체크된다.

- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx`
  - CSV 업로드 버튼 (299~326행 부근): `activeSessionId` 게이팅 추가.
  - `EVENT_COLUMNS` 상수 옆 (107행 부근): `TIME_COLUMNS`/`USER_COLUMNS`/`PROPERTIES_COLUMNS` 상수 추가.
  - `runAnalysis` 함수 (225~297행): 컬럼 검증, 속성 판정 교체, `qa_run_events` insert 추가.

---

### Task 1: CSV 업로드 버튼을 세션 선택에 게이팅

**Files:**
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx:299-326`

- [ ] **Step 1: 업로드 버튼과 설명 문구 교체**

다음 블록을 찾는다:

```tsx
      <PageHeader
        title={stage.name}
        description={
          stage.description ??
          "이 환경은 현재 택소노미를 검증해요. 검증 상태만 저장하고, 자체 규칙은 갖지 않아요."
        }
        actions={
          editable ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> CSV 올리고 분석하기
              </Button>
            </>
          ) : null
        }
      />
```

다음으로 교체한다:

```tsx
      <PageHeader
        title={stage.name}
        description={
          stage.description ??
          (activeSessionId
            ? "이 환경은 현재 택소노미를 검증해요. 검증 상태만 저장하고, 자체 규칙은 갖지 않아요."
            : "이 환경은 현재 택소노미를 검증해요. CSV를 올리려면 라운드 탭에서 세션을 먼저 골라주세요.")
        }
        actions={
          editable ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <Button
                size="sm"
                disabled={busy || !activeSessionId}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" /> CSV 올리고 분석하기
              </Button>
            </>
          ) : null
        }
      />
```

`stage.description`이 이미 설정된 QA 환경(대부분의 실사용 환경)에서는 이 안내 문구가 안 보인다 — 그런 경우를 위해 Task 2에서 `handleFile` 자체에도 세션 미선택 시 에러를 내는 방어 코드를 추가한다(버튼이 비활성화돼 있어도, disabled 버튼을 우회해 `handleFile`이 직접 호출될 경로는 없지만 방어적으로 넣는다).

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add "src/routes/_authenticated/w/\$wsId/p/\$projectId/qa/\$stageSlug.tsx"
git commit -m "Gate CSV upload button on active QA session"
```

---

### Task 2: 시간/유저 컬럼 인식 + 누락 시 업로드 중단

**Files:**
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx:107` (상수)
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx:193-297` (`handleFile`/`runAnalysis`)

- [ ] **Step 1: 컬럼 상수 추가**

다음 줄을 찾는다:

```tsx
const EVENT_COLUMNS = ["event", "event_name", "eventname", "name"];
```

바로 아래에 추가한다:

```tsx
const EVENT_COLUMNS = ["event", "event_name", "eventname", "name"];
const TIME_COLUMNS = ["time", "timestamp", "occurred_at", "event_time"];
const USER_COLUMNS = ["user_id", "external_user_id", "userid", "distinct_id"];
const PROPERTIES_COLUMNS = ["properties", "props", "raw_properties"];
```

- [ ] **Step 2: `handleFile`에 세션 방어 코드 + `runAnalysis`에 컬럼 검증 추가**

다음 블록을 찾는다:

```tsx
  async function handleFile(file: File) {
    if (!stage) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        toast.error("CSV에 데이터 행이 없어요");
        return;
      }
      const { data: upload, error: uploadError } = await db
        .from("qa_uploads")
        .insert({
          project_id: projectId,
          qa_environment_id: stage.id,
          file_name: file.name,
          row_count: parsed.rows.length,
          uploaded_by: user?.id ?? null,
        })
        .select()
        .single();
      if (uploadError) throw uploadError;

      await runAnalysis(parsed, upload.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runAnalysis(parsed: ParsedCsv, uploadId: string | null) {
    if (!stage) return;
    const eventColumn = parsed.headers.find((h) => EVENT_COLUMNS.includes(h.toLowerCase()));
    const seenEvents = new Set<string>();
    const seenAttributes = new Set<string>();
```

다음으로 교체한다:

```tsx
  async function handleFile(file: File) {
    if (!stage) return;
    if (!activeSessionId) {
      toast.error("CSV를 올리려면 라운드 탭에서 세션을 먼저 골라주세요");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        toast.error("CSV에 데이터 행이 없어요");
        return;
      }
      const timeColumn = parsed.headers.find((h) => TIME_COLUMNS.includes(h.toLowerCase()));
      const userColumn = parsed.headers.find((h) => USER_COLUMNS.includes(h.toLowerCase()));
      if (!timeColumn) {
        toast.error("시간 컬럼을 찾을 수 없어요 — TIME 같은 컬럼이 있어야 해요");
        return;
      }
      if (!userColumn) {
        toast.error("유저 구분 컬럼을 찾을 수 없어요 — USER_ID 같은 컬럼이 있어야 해요");
        return;
      }
      const { data: upload, error: uploadError } = await db
        .from("qa_uploads")
        .insert({
          project_id: projectId,
          qa_environment_id: stage.id,
          file_name: file.name,
          row_count: parsed.rows.length,
          uploaded_by: user?.id ?? null,
        })
        .select()
        .single();
      if (uploadError) throw uploadError;

      await runAnalysis(parsed, upload.id, timeColumn, userColumn);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runAnalysis(
    parsed: ParsedCsv,
    uploadId: string | null,
    timeColumn: string,
    userColumn: string,
  ) {
    if (!stage) return;
    const eventColumn = parsed.headers.find((h) => EVENT_COLUMNS.includes(h.toLowerCase()));
    const seenEvents = new Set<string>();
    const seenAttributes = new Set<string>();
```

시간/유저 컬럼 검증은 `handleFile`에서 하고(파싱 직후, `qa_uploads` insert보다 먼저) — 이렇게 하면 컬럼이 없을 때 `qa_uploads`에도 아무것도 안 남는다(스펙의 "아무 테이블에도 안 남긴다" 요구사항). `runAnalysis`는 이제 이미 검증된 `timeColumn`/`userColumn`을 인자로 받는다 — Task 4에서 이 값을 `qa_run_events` insert에 쓴다.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (이 시점에는 `timeColumn`/`userColumn` 파라미터가 `runAnalysis` 본문에서 아직 안 쓰여서 미사용 파라미터 경고가 날 수 있음 — Task 4에서 해결됨. `noUnusedParameters`는 이 프로젝트 tsconfig에서 꺼져 있으므로(다른 파일 리뷰에서 이미 확인됨) `tsc` 에러는 안 남)

- [ ] **Step 4: 커밋**

```bash
git add "src/routes/_authenticated/w/\$wsId/p/\$projectId/qa/\$stageSlug.tsx"
git commit -m "Require time/user columns before running CSV analysis"
```

---

### Task 3: PROPERTIES 컬럼 JSON 파싱으로 속성 판정 교체 (버그 수정)

**Files:**
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx` (`runAnalysis`의 속성 인식 루프)

- [ ] **Step 1: 속성 인식 루프 교체**

다음 블록을 찾는다 (Task 2에서 수정한 `runAnalysis` 시그니처 바로 아래):

```tsx
    const eventColumn = parsed.headers.find((h) => EVENT_COLUMNS.includes(h.toLowerCase()));
    const seenEvents = new Set<string>();
    const seenAttributes = new Set<string>();

    for (const row of parsed.rows) {
      const eventName = eventColumn ? row[eventColumn] : "";
      if (eventName) seenEvents.add(eventName);
      for (const header of parsed.headers) {
        if (header === eventColumn) continue;
        if ((row[header] ?? "") === "") continue;
        seenAttributes.add(`${eventName}::${header}`);
        seenAttributes.add(`::${header}`);
      }
    }
```

다음으로 교체한다:

```tsx
    const eventColumn = parsed.headers.find((h) => EVENT_COLUMNS.includes(h.toLowerCase()));
    const propertiesColumn = parsed.headers.find((h) =>
      PROPERTIES_COLUMNS.includes(h.toLowerCase()),
    );
    const seenEvents = new Set<string>();
    const seenAttributes = new Set<string>();

    function safeJsonParse(raw: string): Record<string, unknown> | null {
      try {
        const value = JSON.parse(raw);
        return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }

    for (const row of parsed.rows) {
      const eventName = eventColumn ? row[eventColumn] : "";
      if (eventName) seenEvents.add(eventName);
      if (propertiesColumn) {
        const parsedProperties = safeJsonParse(row[propertiesColumn] ?? "");
        if (parsedProperties) {
          for (const key of Object.keys(parsedProperties)) {
            seenAttributes.add(`${eventName}::${key}`);
            seenAttributes.add(`::${key}`);
          }
        }
      } else {
        for (const header of parsed.headers) {
          if (header === eventColumn) continue;
          if ((row[header] ?? "") === "") continue;
          seenAttributes.add(`${eventName}::${header}`);
          seenAttributes.add(`::${header}`);
        }
      }
    }
```

`propertiesColumn`이 있으면 그 컬럼만 JSON으로 해석해서 개별 속성명을 뽑고, 없으면 기존 방식(각 컬럼 자체를 속성으로 취급)을 그대로 쓴다. JSON 파싱이 실패하는 행(`safeJsonParse`가 `null` 반환)은 그 행의 속성 인식만 건너뛴다 — 이벤트 이름 인식(`seenEvents`)이나 Task 4의 원본 저장에는 영향 없다.

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add "src/routes/_authenticated/w/\$wsId/p/\$projectId/qa/\$stageSlug.tsx"
git commit -m "Parse JSON-blob property columns for attribute verification"
```

---

### Task 4: qa_run_events에 원본 행 저장

**Files:**
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx` (`runAnalysis` 끝부분, `qa_analysis_runs` insert 다음)

- [ ] **Step 1: `qa_run_events` insert 추가**

다음 블록을 찾는다:

```tsx
    const verified = rows.filter((r) => r.status === "verified").length;
    const { error: runError } = await db.from("qa_analysis_runs").insert({
      project_id: projectId,
      qa_environment_id: stage.id,
      upload_id: uploadId,
      status: "completed",
      completed_at: new Date().toISOString(),
      created_by: user?.id ?? null,
      summary: {
        rows: parsed.rows.length,
        taxonomy_items: items.length,
        verified,
        failed: rows.length - verified,
        rules_applied: rules.filter((r) => r.is_enabled).length,
      },
    });
    if (runError) throw runError;

    qc.invalidateQueries({ queryKey: ["item-status", projectId] });
    qc.invalidateQueries({ queryKey: ["uploads", stage.id] });
    qc.invalidateQueries({ queryKey: ["runs", stage.id] });
    toast.success(`분석을 마쳤어요 — 전체 ${items.length}개 중 ${verified}개가 검증됐어요`);
  }
```

다음으로 교체한다:

```tsx
    const verified = rows.filter((r) => r.status === "verified").length;
    const { error: runError } = await db.from("qa_analysis_runs").insert({
      project_id: projectId,
      qa_environment_id: stage.id,
      upload_id: uploadId,
      status: "completed",
      completed_at: new Date().toISOString(),
      created_by: user?.id ?? null,
      summary: {
        rows: parsed.rows.length,
        taxonomy_items: items.length,
        verified,
        failed: rows.length - verified,
        rules_applied: rules.filter((r) => r.is_enabled).length,
      },
    });
    if (runError) throw runError;

    const eventByTechnicalName = new Map(events.map((e) => [e.technical_name, e.id]));
    const runEventRows = parsed.rows.map((row) => {
      const eventName = eventColumn ? row[eventColumn] : "";
      return {
        qa_session_id: activeSessionId,
        event_id: eventByTechnicalName.get(eventName) ?? null,
        raw_event_name: eventName,
        occurred_at: new Date(row[timeColumn]).toISOString(),
        external_user_id: row[userColumn],
        raw_properties:
          (propertiesColumn ? safeJsonParse(row[propertiesColumn] ?? "") : null) ??
          Object.fromEntries(
            parsed.headers
              .filter((h) => h !== eventColumn && h !== timeColumn && h !== userColumn)
              .map((h) => [h, row[h]]),
          ),
      };
    });
    const { error: runEventsError } = await db.from("qa_run_events").insert(runEventRows);
    if (runEventsError) throw runEventsError;

    qc.invalidateQueries({ queryKey: ["item-status", projectId] });
    qc.invalidateQueries({ queryKey: ["uploads", stage.id] });
    qc.invalidateQueries({ queryKey: ["runs", stage.id] });
    toast.success(`분석을 마쳤어요 — 전체 ${items.length}개 중 ${verified}개가 검증됐어요`);
  }
```

`eventByTechnicalName`은 컴포넌트에 이미 있는 `events`(택소노미 이벤트 목록, `useTaxonomyEvents`로 가져옴)를 `technical_name → id`로 매핑한 것이다. CSV의 이벤트 이름이 택소노미에 없으면 `event_id`는 `null`로 남는다.

`raw_properties`는 `propertiesColumn`이 있으면 그 값을 JSON으로 해석한 객체(파싱 실패 시 `null`)를 쓰고, `propertiesColumn`이 없거나 파싱에 실패하면 이벤트/시간/유저 컬럼을 뺀 나머지 컬럼들을 key-value로 묶은 객체를 쓴다 — Task 3에서 만든 `safeJsonParse`를 그대로 재사용한다(같은 함수 스코프 안에 있으므로 별도 export 불필요).

- [ ] **Step 2: 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add "src/routes/_authenticated/w/\$wsId/p/\$projectId/qa/\$stageSlug.tsx"
git commit -m "Store raw CSV rows in qa_run_events on analysis"
```

---

### Task 5: 수동 QA (agent-browser) + 최종 확인

자동화 테스트가 없으므로, 설계 문서의 "테스트 관점" 절에 정의된 시나리오를 실제 로그인된 앱에서 `agent-browser`로 직접 확인한다.

**Files:** 없음 (검증만 수행)

- [ ] **Step 1: dev 서버 기동 확인**

Run: `npm run dev` (이미 떠 있다면 생략)
Expected: `http://localhost:8081`에서 응답

- [ ] **Step 2: 세션 미선택 상태에서 버튼 비활성화 확인**

로그인 후 QA 환경 페이지로 이동해서, 라운드 탭에서 세션을 고르지 않은 초기 상태의 "CSV 올리고 분석하기" 버튼 상태를 확인한다.

Expected: 버튼이 비활성화(disabled)돼 있다. `stage.description`이 없는 환경이라면 안내 문구도 "세션을 먼저 골라주세요"로 바뀌어 있다.

- [ ] **Step 3: 세션 선택 후 버튼 활성화 확인**

라운드 탭에서 세션을 만들거나 골라 `activeSessionId`가 채워지게 한다.

Expected: "CSV 올리고 분석하기" 버튼이 활성화된다.

- [ ] **Step 4: 실제 형태의 CSV 업로드 → qa_run_events 저장 확인**

`EVENT_ID,USER_ID,TIME,NAME,PROPERTIES` 헤더를 가진 CSV 파일(PROPERTIES 컬럼에 JSON 문자열)을 업로드한다.

Expected: 업로드가 성공 토스트로 끝난다. Supabase에서 `qa_run_events` 테이블을 조회했을 때(`db query` 등으로) CSV 행 수만큼 새 행이 생겨 있고, 각 행의 `occurred_at`이 TIME 컬럼 값과 일치, `external_user_id`가 USER_ID 컬럼 값과 일치, `raw_event_name`이 NAME 컬럼 값과 일치, `raw_properties`가 PROPERTIES 컬럼의 JSON을 파싱한 객체와 일치한다. 택소노미에 등록된 이벤트 이름을 가진 행은 `event_id`가 채워져 있고, 등록 안 된 이름은 `event_id`가 `null`이다.

- [ ] **Step 5: 시간 컬럼 없는 CSV 업로드 → 전체 중단 확인**

TIME(또는 동의어) 컬럼이 없는 CSV를 업로드한다.

Expected: 에러 토스트("시간 컬럼을 찾을 수 없어요...")가 뜨고, `qa_uploads`/`qa_item_status`/`qa_analysis_runs`/`qa_run_events` 어디에도 새 행이 안 생겼는지 확인한다(업로드 탭의 "업로드" 목록에 새 파일이 안 보이는 것으로 간접 확인 가능).

- [ ] **Step 6: PROPERTIES 안의 개별 속성이 검증/실패 판정에 반영되는지 확인**

Step 4에서 업로드한 CSV의 PROPERTIES 안에 있던 속성(예: `platform`)이 택소노미에 등록돼 있다면, "검증 결과" 탭에서 그 속성이 "검증됨" 상태로 표시되는지 확인한다.

- [ ] **Step 7: 최종 타입 체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `npm run build`
Expected: 빌드 성공

---

## Self-Review

- **스펙 커버리지:** 세션 지정 강제(Task 1, 2) → 커버됨. 모든 행 저장(Task 4) → 커버됨. PROPERTIES JSON 해석 + 기존 버그 수정(Task 3) → 커버됨. 시간/유저 컬럼 누락 시 전체 중단(Task 2) → 커버됨. `event_id` 매칭(Task 4) → 커버됨. 비범위로 명시한 조회 UI, 구버전 통합, 매칭 안 된 행 경고 UI는 태스크에 없음 — 의도대로. 수동 QA 시나리오 전부(Task 5) → 스펙의 "테스트 관점" 6개 항목과 1:1 대응.
- **플레이스홀더 스캔:** "나중에"/"적절히 처리" 없음. 모든 스텝에 실제 코드가 있음.
- **타입 일관성:** `timeColumn`/`userColumn`이 Task 2에서 `runAnalysis` 파라미터로 추가되고, Task 4에서 그대로 쓰임. `propertiesColumn`/`safeJsonParse`가 Task 3에서 정의되고 Task 4에서 재사용됨 — 이름이 전부 일치. `eventByTechnicalName`은 Task 4에서만 쓰이는 지역 변수로 이름 충돌 없음.
