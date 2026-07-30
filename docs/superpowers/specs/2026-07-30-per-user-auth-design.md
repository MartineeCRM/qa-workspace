# 실제 팀원별 로그인 도입 설계

- 날짜: 2026-07-30
- 상태: 승인됨 (구현 계획 단계로 진행)

## 배경

현재 `_authenticated` 영역은 하드코딩된 `AUTO_LOGIN_USER_ID` 한 명으로 모든 방문자를 자동 로그인시킨다
([src/lib/auto-login.functions.ts](../../../src/lib/auto-login.functions.ts),
[src/lib/auto-session.ts](../../../src/lib/auto-session.ts)).
`workspace_members.role`, `activity_logs.actor_user_id` 등 DB 구조는 멀티유저를 전제하지만,
실제로는 접속하는 모든 팀원이 같은 사용자로 기록되어 권한 구분과 활동 이력이 무의미하다.

이 문서는 이를 이메일+비밀번호 기반의 실제 개인 계정 로그인으로 교체하는 설계를 다룬다.

## 목표

- 팀원 각자가 회사 메일로 가입해서 자신의 계정으로 접속한다.
- 이메일 인증(확인 메일 클릭) 절차는 없다 — 가입 즉시 로그인된다.
- 가입 자체는 어떤 이메일이든 가능하다. 워크스페이스 접근은 멤버십으로만 통제한다(도메인 제한 없음).
- 관리자가 팀원 이메일로 미리 초대해두면, 그 이메일로 가입하는 순간 자동으로 워크스페이스 멤버가 된다.
- 기존 공유 계정으로 만들어진 데이터는 건드리지 않는다. 새 계정들은 새 워크스페이스를 만들어 사용한다.
- 비밀번호 재설정(찾기) 기능은 이번 범위에서 제외한다.

## 비범위 (Out of scope)

- 비밀번호 재설정/찾기 플로우
- 기존 공유 계정 데이터의 소유권 이전·마이그레이션
- 이메일 도메인 화이트리스트
- SSO/OAuth 소셜 로그인

## 아키텍처

### 1. 인증 흐름

- `/login`, `/signup` 라우트를 신설한다 (인증 불필요 영역, `__root` 하위 `_authenticated` 밖).
  - `/signup`: 이메일 + 비밀번호 입력 → `supabase.auth.signUp()` → 성공 시 세션이 즉시 생성되어 홈으로 이동.
  - `/login`: 이메일 + 비밀번호 입력 → `supabase.auth.signInWithPassword()`.
- `src/lib/auto-login.functions.ts`, `src/lib/auto-session.ts`를 삭제한다.
- `src/lib/auth.tsx`(`AuthProvider`)에서 `ensureSession()` 호출을 제거하고, 단순히
  `supabase.auth.getSession()` + `onAuthStateChange`만으로 세션을 추적한다.
  `signOut`은 그대로 유지, `signUp`/`signIn` 함수를 추가로 노출한다.
- `src/routes/_authenticated/route.tsx`의 `beforeLoad`를 다음으로 교체한다:
  세션이 없으면 `/login`으로 `redirect`. (`ensureSession` 자동 로그인 대신 진짜 인증 게이트가 된다.)
- **외부 설정(코드 밖)**: Supabase 프로젝트(`ninvyceivmjvdkansump`)의
  Authentication → Providers → Email에서 "Confirm email"을 꺼야 한다.
  이 설정은 Supabase 대시보드에서 사용자가 직접 변경해야 하며, 이 리포지토리의 코드나 마이그레이션으로는
  제어할 수 없다.

### 2. 프로필에 이메일 저장

- `profiles` 테이블에 `email text` 컬럼을 추가한다.
- `ensure_profile` RPC가 호출될 때(최초 프로필 생성 시) `auth.users.email`에서 값을 읽어 채운다.
  이메일은 클라이언트가 파라미터로 넘기지 않고 서버(SECURITY DEFINER 함수)가 `auth.uid()`로
  `auth.users`에서 직접 조회한다 — 클라이언트가 임의 이메일을 주장할 수 없도록.
- 멤버 목록(`useMembers`, settings 페이지)에 이메일을 표시해 "누가 누구인지" 식별 가능하게 한다.

### 3. 이메일 초대 (사전 초대 → 가입 시 자동 합류)

새 테이블:

```sql
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);
```

- RLS: `can_admin_ws(workspace_id)`인 사용자만 select/insert/delete 가능 (`workspace_members`와 동일 패턴).
- 이메일은 저장 전 소문자로 정규화(`lower(btrim(email))`)한다.
- **초대 소비 트리거**: `profiles` 테이블에 `AFTER INSERT` 트리거를 추가한다.
  새 프로필이 생성되면(=최초 가입), 해당 사용자의 이메일과 대소문자 무시 일치하는
  `workspace_invites` 행을 찾아 각각에 대해:
  1. `workspace_members`에 `(workspace_id, user_id=NEW.id, role)`로 insert
  2. 해당 `workspace_invites` 행 삭제
- 이 트리거는 `SECURITY DEFINER`로 만들어 기존 `tg_workspace_owner`, `tg_log_activity`와 같은 패턴을 따른다.

### 4. Settings 페이지 UI 변경

`src/routes/_authenticated/w/$wsId/settings.tsx`의 "멤버" 패널에 추가:

- "이메일로 초대" 버튼 → 다이얼로그(이메일 입력 + 역할 선택) → `workspace_invites` insert
- "대기 중인 초대" 목록(이메일, 역할, 초대일, 취소 버튼) — 관리자에게만 노출
- 기존 "이메일 초대는 다음 단계에서 지원돼요" 안내 문구 제거

### 5. 기존 자동 로그인 코드 정리

- `src/lib/auto-login.functions.ts` 삭제
- `src/lib/auto-session.ts` 삭제
- `src/lib/auth.tsx`에서 `ensureSession` import 제거
- `src/routes/_authenticated/route.tsx`에서 `ensureSession` import 제거, 실제 세션 가드로 교체

## 데이터 흐름 요약

```
가입(signUp) → auth.users 행 생성 (Confirm email 꺼져 있어 즉시 활성)
            → 클라이언트가 ensure_profile() 호출 → profiles 행 upsert(email 포함)
            → profiles AFTER INSERT 트리거 → workspace_invites에서 매칭되는 행 조회
            → 매칭되면 workspace_members insert + workspace_invites 삭제
            → 클라이언트는 useMyMemberships()로 새로 생긴 워크스페이스 멤버십을 바로 확인 가능
```

## 에러 처리

- `signUp` 실패(이미 가입된 이메일 등): Supabase 에러 메시지를 토스트로 표시 (`errorMessage` 헬퍼 재사용).
- `signInWithPassword` 실패(잘못된 비밀번호 등): 동일하게 토스트.
- 초대 이메일과 실제 가입 이메일 대소문자/공백 차이로 인한 미스매치 방지: 저장·비교 양쪽에서 정규화.
- 초대 대상 이메일이 이미 가입되어 있는 상태에서 초대한 경우(=이미 profiles 존재): 이번 범위에서는
  트리거가 신규 가입(`AFTER INSERT`) 시점에만 동작하므로 자동 합류되지 않는다. 관리자는 이 경우
  기존 UI(멤버 아님 → 직접 role 부여 불가)로는 처리할 수 없다는 한계가 있으나, 실제 사용 시나리오상
  "초대 먼저, 가입은 나중"이 기본 흐름이라 우선순위 낮음으로 두고 다음 단계 과제로 남긴다.

## 테스트 계획

- 가입 → 즉시 로그인되어 `/workspaces`로 이동하는지
- 초대 없이 가입한 사용자는 빈 워크스페이스 목록을 보는지
- 관리자가 이메일 초대 후 해당 이메일로 가입하면 자동으로 멤버가 되고 지정한 role이 적용되는지
- 초대 취소 후 가입하면 멤버가 되지 않는지
- 로그아웃 후 `/login`으로 리다이렉트되는지, 세션 없이 `_authenticated` 하위 접근 시 `/login`으로 가는지
- 대소문자가 다른 이메일(`Foo@Bar.com` 초대 후 `foo@bar.com`으로 가입)로도 매칭되는지

## 남은 질문 (다음 단계 과제, 이번 구현에는 불포함)

- 이미 가입된 사용자를 이메일로 초대하는 경우의 처리 (현재는 신규 가입자만 자동 합류)
- 비밀번호 재설정 플로우
- 기존 공유 계정 데이터 이관 여부
