# Per-User Auth (Real Login + Email Invites) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared auto-login (single hardcoded `AUTO_LOGIN_USER_ID`) with real per-user email+password accounts, plus an admin-driven email-invite flow that auto-joins a workspace the moment the invited email signs up.

**Architecture:** Two Supabase Auth routes (`/login`, `/signup`) gate a real session check in `_authenticated/route.tsx`. A new `workspace_invites` table holds pending invites; a `profiles` `AFTER INSERT` trigger consumes matching invites the instant a brand-new user's profile row is created (i.e. at first signup), converting them into real `workspace_members` rows. `profiles.email` is populated server-side from `auth.users` (never client-supplied) so admins can see who they're inviting/who's already a member.

**Tech Stack:** TanStack Start / React, Supabase (Postgres + Auth), TanStack Query, shadcn/ui, sonner (toasts). No automated test runner exists in this repo (no `test` script, no test files) — verification is via direct SQL assertions against the linked dev database for the migration layer, and `tsc`/`lint`/`build` + manual browser testing for the UI layer, per this project's existing conventions.

---

## Before you start: DB access convention

Some steps run SQL against the linked Supabase project (ref `ilciucbaonbzikghfebk`, region `ap-southeast-2`) through the session pooler, because this network cannot reach the project's direct (IPv6) connection string. **The DB password is not stored anywhere in this repo or in any prior conversation output — you must ask the human operator for it when you reach Task 1.** Never type the raw password into a chat message or a command that gets logged; use this file-handoff pattern:

1. Ask the operator to run, in their own terminal:
   ```
   echo -n 'their-actual-password' > /tmp/qa_workspace_db_pass.txt
   ```
2. Then run commands like this, which read the password via command substitution so it never appears in your own output:
   ```bash
   cd ~/Projects/qa-workspace
   PWFILE=/tmp/qa_workspace_db_pass.txt
   DB_PASS=$(cat "$PWFILE")
   DB_URL="postgresql://postgres.ilciucbaonbzikghfebk:${DB_PASS}@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres"
   supabase db query --db-url "$DB_URL" "select 1;"
   unset DB_PASS
   ```
3. After the LAST step that needs DB access in this plan, delete the file: `rm -f /tmp/qa_workspace_db_pass.txt`.

Every task below that touches the database repeats the `DB_URL` construction so each task's steps are self-contained and copy-pasteable.

---

### Task 1: Migration — `profiles.email` + email invites + auto-join trigger

**Files:**
- Create: `supabase/migrations/20260730010000_workspace_invites_and_profile_email.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- profiles.email is populated server-side from auth.users, never from client input.
ALTER TABLE public.profiles ADD COLUMN email text;

CREATE OR REPLACE FUNCTION public.ensure_profile(_display_name text DEFAULT NULL)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; _email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (auth.uid(), COALESCE(NULLIF(btrim(_display_name), ''), 'New user'), _email)
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(NULLIF(btrim(_display_name), ''), public.profiles.display_name),
    email = COALESCE(public.profiles.email, _email)
  RETURNING * INTO p;
  RETURN p;
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;

-- Pending email invites: workspace_id + email -> role, consumed at first signup.
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);
GRANT SELECT, INSERT, DELETE ON public.workspace_invites TO authenticated;
GRANT ALL ON public.workspace_invites TO service_role;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY wi_select ON public.workspace_invites FOR SELECT TO authenticated USING (public.can_admin_ws(workspace_id));
CREATE POLICY wi_insert ON public.workspace_invites FOR INSERT TO authenticated WITH CHECK (public.can_admin_ws(workspace_id) AND invited_by = auth.uid());
CREATE POLICY wi_delete ON public.workspace_invites FOR DELETE TO authenticated USING (public.can_admin_ws(workspace_id));

CREATE OR REPLACE FUNCTION public.tg_normalize_invite_email() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END; $$;
CREATE TRIGGER workspace_invites_normalize_email BEFORE INSERT OR UPDATE ON public.workspace_invites
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_invite_email();

-- Consume matching invites the moment a brand-new profile is created (= first signup).
-- Fires only on true INSERT, not on ensure_profile's ON CONFLICT DO UPDATE path,
-- so an existing user re-running ensure_profile never re-triggers this.
CREATE OR REPLACE FUNCTION public.tg_consume_workspace_invites() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    SELECT wi.workspace_id, NEW.id, wi.role
    FROM public.workspace_invites wi
    WHERE wi.email = lower(btrim(NEW.email))
    ON CONFLICT DO NOTHING;

    DELETE FROM public.workspace_invites WHERE email = lower(btrim(NEW.email));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_consume_invites AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_consume_workspace_invites();
```

- [ ] **Step 2: Ask the operator for the DB password (see "Before you start")**

Do not proceed until `/tmp/qa_workspace_db_pass.txt` exists on the operator's machine.

- [ ] **Step 3: Apply the migration**

```bash
cd ~/Projects/qa-workspace
PWFILE=/tmp/qa_workspace_db_pass.txt
DB_PASS=$(cat "$PWFILE")
DB_URL="postgresql://postgres.ilciucbaonbzikghfebk:${DB_PASS}@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres"
supabase db push --db-url "$DB_URL" --yes
unset DB_PASS
```

Expected: output lists exactly one migration — `20260730010000_workspace_invites_and_profile_email.sql` — and ends with `"message":"Finished supabase db push."`. If it reports an error but a re-run of the specific failing `CREATE`/`ALTER` statement via `supabase db query` shows the object already exists, that statement already succeeded — use `supabase migration repair --status applied 20260730010000 --db-url "$DB_URL"` instead of re-pushing (see the migration-repair pattern used earlier in this project's setup).

- [ ] **Step 4: Verify the schema landed correctly**

```bash
cd ~/Projects/qa-workspace
PWFILE=/tmp/qa_workspace_db_pass.txt
DB_PASS=$(cat "$PWFILE")
DB_URL="postgresql://postgres.ilciucbaonbzikghfebk:${DB_PASS}@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres"
supabase db query --db-url "$DB_URL" "select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by column_name;"
supabase db query --db-url "$DB_URL" "select table_name from information_schema.tables where table_schema='public' and table_name='workspace_invites';"
supabase db query --db-url "$DB_URL" "select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='profiles' and not t.tgisinternal;"
unset DB_PASS
```

Expected:
- First query's rows include `email` alongside `avatar_url`, `created_at`, `display_name`, `id`, `updated_at`.
- Second query returns one row: `workspace_invites`.
- Third query's rows include both `trg_profiles_updated` and `profiles_consume_invites`.

- [ ] **Step 5: Delete the password file if this is the only DB-touching task you're doing right now**

```bash
rm -f /tmp/qa_workspace_db_pass.txt
```

(Skip this if you're continuing straight to a later task that also needs DB access — keep it until the whole plan is done, then delete it.)

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/qa-workspace
git add supabase/migrations/20260730010000_workspace_invites_and_profile_email.sql
git commit -m "feat: add workspace_invites table, profiles.email, invite auto-join trigger"
```

---

### Task 2: Remove auto-login, add a real session guard

**Files:**
- Delete: `src/lib/auto-login.functions.ts`
- Delete: `src/lib/auto-session.ts`
- Modify: `src/lib/auth.tsx` (full rewrite)
- Modify: `src/routes/_authenticated/route.tsx` (full rewrite)

- [ ] **Step 1: Delete the auto-login files**

```bash
cd ~/Projects/qa-workspace
rm src/lib/auto-login.functions.ts src/lib/auto-session.ts
```

- [ ] **Step 2: Rewrite `src/lib/auth.tsx`**

Replace the entire file with:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setProfile(null);
    });
    supabase.auth
      .getSession()
      .then(({ data: d }) => setSession(d.session))
      .finally(() => setLoading(false));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const fallbackName =
      (session?.user.user_metadata?.display_name as string | undefined) ??
      session?.user.email?.split("@")[0] ??
      "New user";
    supabase
      .rpc("ensure_profile", { _display_name: fallbackName })
      .then(({ data }) => {
        if (!cancelled && data) setProfile(data as unknown as Profile);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, session?.user.email, session?.user.user_metadata?.display_name]);

  async function refreshProfile() {
    if (!userId) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, email")
      .eq("id", userId)
      .maybeSingle();
    if (data) setProfile(data);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
```

- [ ] **Step 3: Rewrite `src/routes/_authenticated/route.tsx`**

Replace the entire file with:

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    return {};
  },
  component: () => <Outlet />,
});
```

- [ ] **Step 4: Type-check**

```bash
cd ~/Projects/qa-workspace
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors mentioning `auto-session`, `auto-login`, `auth.tsx`, or `_authenticated/route.tsx`. (Errors in unrelated files you haven't touched yet are expected until later tasks land — ignore those for now, but there should be none in these four files.)

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/qa-workspace
git add -A -- src/lib/auth.tsx src/routes/_authenticated/route.tsx
git rm src/lib/auto-login.functions.ts src/lib/auto-session.ts
git commit -m "feat: replace shared auto-login with a real Supabase session guard"
```

---

### Task 3: Shared auth page layout

**Files:**
- Create: `src/components/app/auth-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          {footer}
        </CardFooter>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/Projects/qa-workspace
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors in `src/components/app/auth-card.tsx`.

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/qa-workspace
git add src/components/app/auth-card.tsx
git commit -m "feat: add shared AuthCard layout for login/signup pages"
```

---

### Task 4: `/login` route

**Files:**
- Create: `src/routes/login.tsx`

- [ ] **Step 1: Write the route**

```tsx
import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthCard } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "로그인 — Trackspec" },
      { name: "description", content: "회사 이메일로 로그인해요." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/workspaces" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) return toast.error(errorMessage(error, "로그인에 실패했어요"));
    navigate({ to: "/workspaces" });
  }

  return (
    <AuthCard
      title="로그인"
      description="회사 이메일과 비밀번호로 로그인해요."
      footer={
        <>
          계정이 없으신가요?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            가입하기
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="login-email">이메일</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">비밀번호</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || !email.trim() || !password}>
          {busy ? "로그인 중…" : "로그인"}
        </Button>
      </form>
    </AuthCard>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/Projects/qa-workspace
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors in `src/routes/login.tsx`. TanStack Router's file-based route generator (`routeTree.gen.ts`) regenerates automatically when the dev server runs — no manual step needed, but if `Link to="/signup"` shows a type error, run `npm run dev` once (it regenerates the route tree on start) then re-run `tsc`.

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/qa-workspace
git add src/routes/login.tsx
git commit -m "feat: add /login route"
```

---

### Task 5: `/signup` route

**Files:**
- Create: `src/routes/signup.tsx`

- [ ] **Step 1: Write the route**

```tsx
import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthCard } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "가입 — Trackspec" },
      { name: "description", content: "회사 이메일로 가입해요." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/workspaces" });
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("비밀번호가 서로 달라요");
      return;
    }
    setBusy(true);
    const { error } = await signUp(email.trim(), password);
    setBusy(false);
    if (error) return toast.error(errorMessage(error, "가입에 실패했어요"));
    navigate({ to: "/workspaces" });
  }

  return (
    <AuthCard
      title="가입하기"
      description="회사 이메일로 가입하면 이메일 확인 없이 바로 로그인돼요."
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            로그인
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="signup-email">이메일</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-password">비밀번호</Label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-confirm-password">비밀번호 확인</Label>
          <Input
            id="signup-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={busy || !email.trim() || !password || !confirmPassword}
        >
          {busy ? "가입 중…" : "가입하기"}
        </Button>
      </form>
    </AuthCard>
  );
}
```

Note: there is no password-reset flow in this app (out of scope per the design doc), so the confirm-password field is the only safeguard against a typo locking someone out — do not remove it.

- [ ] **Step 2: Type-check**

```bash
cd ~/Projects/qa-workspace
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors in `src/routes/signup.tsx`.

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/qa-workspace
git add src/routes/signup.tsx
git commit -m "feat: add /signup route"
```

---

### Task 6: Working sign-out button

**Files:**
- Modify: `src/components/app/top-bar.tsx`

- [ ] **Step 1: Add a sign-out item to the user dropdown menu**

In `src/components/app/top-bar.tsx`, add `useNavigate` to the router import and destructure `signOut` from `useAuth()`:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
```

```tsx
export function TopBar({ children }: { children?: React.ReactNode }) {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }
```

Then add `DropdownMenuItem` for sign-out right after the existing "내 프로필" item, before `</DropdownMenuContent>`:

```tsx
          <DropdownMenuItem asChild>
            <Link to="/account">내 프로필</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut}>로그아웃</DropdownMenuItem>
        </DropdownMenuContent>
```

The full file after this change:

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShieldCheck, UserRound } from "lucide-react";

export function TopBar({ children }: { children?: React.ReactNode }) {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-4 border-b bg-card px-4">
      <div className="flex min-w-0 items-center gap-4">
        <Link to="/workspaces" className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" />
          Trackspec
        </Link>
        <div className="min-w-0">{children}</div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <UserRound className="size-4" />
            <span className="max-w-[12rem] truncate">{profile?.display_name ?? user?.email}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {user?.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/workspaces">워크스페이스</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/account">내 프로필</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut}>로그아웃</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd ~/Projects/qa-workspace
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors in `src/components/app/top-bar.tsx`.

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/qa-workspace
git add src/components/app/top-bar.tsx
git commit -m "feat: wire up a working sign-out button"
```

---

### Task 7: `usePendingInvites` query hook + email on the members list

**Files:**
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: Add `email` to `useMembers`' select**

In `useMembers` (existing function in `src/lib/queries.ts`), change the select and its generic type to include `email`:

```ts
export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: ["members", workspaceId],
    queryFn: async () =>
      unwrap<
        Array<{
          id: string;
          role: WorkspaceRole;
          user_id: string;
          created_at: string;
          profiles: { display_name: string; avatar_url: string | null; email: string | null } | null;
        }>
      >(
        await db
          .from("workspace_members")
          .select("id, role, user_id, created_at, profiles(display_name, avatar_url, email)")
          .eq("workspace_id", workspaceId)
          .order("created_at"),
      ),
  });
}
```

- [ ] **Step 2: Add the `WorkspaceInvite` type and hook**

Add this type near the other type definitions (after the `ActivityLog` type, before `const db = supabase as any;`):

```ts
export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  created_at: string;
};
```

Add this hook near `useMembers` (right after it):

```ts
export function usePendingInvites(workspaceId: string) {
  return useQuery({
    queryKey: ["invites", workspaceId],
    queryFn: async () =>
      unwrap<WorkspaceInvite[]>(
        await db
          .from("workspace_invites")
          .select("id, workspace_id, email, role, invited_by, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false }),
      ),
  });
}
```

- [ ] **Step 3: Type-check**

```bash
cd ~/Projects/qa-workspace
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors in `src/lib/queries.ts`.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/qa-workspace
git add src/lib/queries.ts
git commit -m "feat: add usePendingInvites hook and show member email"
```

---

### Task 8: Invite UI in workspace settings

**Files:**
- Modify: `src/routes/_authenticated/w/$wsId/settings.tsx`

- [ ] **Step 1: Show each member's email in the members table**

Find this block inside the members `<TableBody>`:

```tsx
                  <TableCell>
                    <span className="font-medium">{m.profiles?.display_name || "알 수 없는 사용자"}</span>
                    {isSelf ? <span className="ml-2 text-xs text-muted-foreground">나</span> : null}
                  </TableCell>
```

Replace it with:

```tsx
                  <TableCell>
                    <div>
                      <span className="font-medium">{m.profiles?.display_name || "알 수 없는 사용자"}</span>
                      {isSelf ? <span className="ml-2 text-xs text-muted-foreground">나</span> : null}
                    </div>
                    {m.profiles?.email ? (
                      <div className="text-xs text-muted-foreground">{m.profiles.email}</div>
                    ) : null}
                  </TableCell>
```

- [ ] **Step 2: Update imports**

Add `usePendingInvites` to the existing `@/lib/queries` import (line 32) so it reads:

```tsx
import { db, useMembers, usePendingInvites } from "@/lib/queries";
```

Add a `Dialog` import (not yet imported in this file) alongside the existing `AlertDialog` import block:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
```

- [ ] **Step 3: Add invite state and handlers inside `SettingsPage`**

Right after the existing `const [busy, setBusy] = useState(false);` line, add:

```tsx
  const { data: invites } = usePendingInvites(wsId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("viewer");
  const [inviteBusy, setInviteBusy] = useState(false);
```

Right after the existing `removeMember` function, add:

```tsx
  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    const { error } = await db.from("workspace_invites").insert({
      workspace_id: wsId,
      email: inviteEmail.trim(),
      role: inviteRole,
      invited_by: user!.id,
    });
    setInviteBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("초대했어요");
    setInviteEmail("");
    setInviteRole("viewer");
    setInviteOpen(false);
    qc.invalidateQueries({ queryKey: ["invites", wsId] });
  }

  async function cancelInvite(inviteId: string) {
    const { error } = await db.from("workspace_invites").delete().eq("id", inviteId);
    if (error) return toast.error(errorMessage(error));
    toast.success("초대를 취소했어요");
    qc.invalidateQueries({ queryKey: ["invites", wsId] });
  }
```

- [ ] **Step 4: Replace the static invite placeholder block**

Find this block (currently right after the members `<Table>` closes, inside the "멤버" `Panel`):

```tsx
        <div className="border-t p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            초대
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            이메일 초대는 다음 단계에서 지원돼요. 지금은 팀원이 가입한 뒤 여기에서 권한을 지정하면 돼요.
            관리자는 언제든 멤버 권한을 바꿀 수 있어요.
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {WORKSPACE_ROLES.map((r) => (
              <div key={r} className="rounded-sm border bg-surface px-3 py-2">
                <dt className="text-xs font-semibold">{ROLE_LABEL[r]}</dt>
                <dd className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</dd>
              </div>
            ))}
          </dl>
        </div>
```

Replace it with:

```tsx
        <div className="border-t p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              초대
            </h3>
            {isAdmin ? (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    이메일로 초대
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={sendInvite}>
                    <DialogHeader>
                      <DialogTitle>이메일로 초대하기</DialogTitle>
                      <DialogDescription>
                        입력한 이메일로 가입하면 자동으로 이 워크스페이스에 합류해요.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="invite-email">이메일</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          required
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="teammate@company.com"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="invite-role">권한</Label>
                        <Select
                          value={inviteRole}
                          onValueChange={(v) => setInviteRole(v as WorkspaceRole)}
                        >
                          <SelectTrigger id="invite-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WORKSPACE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                        취소
                      </Button>
                      <Button type="submit" disabled={inviteBusy || !inviteEmail.trim()}>
                        {inviteBusy ? "초대하는 중…" : "초대"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          {(invites ?? []).length > 0 ? (
            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead>이메일</TableHead>
                  <TableHead>권한</TableHead>
                  <TableHead>초대일</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invites ?? []).map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>{ROLE_LABEL[inv.role]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(inv.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin ? (
                        <Button variant="ghost" size="sm" onClick={() => cancelInvite(inv.id)}>
                          취소
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">
              대기 중인 초대가 없어요. 팀원의 이메일로 초대하면 그 이메일로 가입하는 즉시 자동으로
              합류해요.
            </p>
          )}

          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {WORKSPACE_ROLES.map((r) => (
              <div key={r} className="rounded-sm border bg-surface px-3 py-2">
                <dt className="text-xs font-semibold">{ROLE_LABEL[r]}</dt>
                <dd className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</dd>
              </div>
            ))}
          </dl>
        </div>
```

- [ ] **Step 5: Type-check**

```bash
cd ~/Projects/qa-workspace
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors in `src/routes/_authenticated/w/$wsId/settings.tsx`.

- [ ] **Step 6: Lint and build**

```bash
cd ~/Projects/qa-workspace
npm run lint
npm run build
```

Expected: both succeed with no errors. (These are this repo's only automated gates — there is no test script.)

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/qa-workspace
git add src/routes/_authenticated/w/\$wsId/settings.tsx
git commit -m "feat: add email invite UI to workspace settings"
```

---

### Task 9: End-to-end manual verification

There is no automated test suite in this repo, and the invite-consumption trigger genuinely requires a live Supabase Auth session (`auth.uid()` only resolves inside a real JWT-authenticated request, not a raw SQL session) — so this final verification must be done by hand in the browser, per this project's UI-testing convention.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
cd ~/Projects/qa-workspace
npm run dev
```

Expected: server starts (default `http://localhost:3000` or the port Vite prints).

- [ ] **Step 2: Unauthenticated redirect**

In a browser, visit `http://localhost:<port>/w/anything` while signed out (clear cookies/local storage or use a private window).
Expected: redirected to `/login`.

- [ ] **Step 3: Sign up with no invite**

On `/signup`, create an account with a throwaway email (e.g. `test1+<random>@yourcompany.com`) and a password of 6+ characters, matching confirm field.
Expected: no email-confirmation screen appears (Confirm email is off) — you land directly on `/workspaces` with an empty state ("아직 워크스페이스가 없어요").

- [ ] **Step 4: Create a workspace and invite a second address**

Click "새 워크스페이스", create one. Go to its 설정 (settings) page → 멤버 panel → "이메일로 초대", invite `test2+<random>@yourcompany.com` as `editor`.
Expected: toast "초대했어요", the invite appears in the pending-invites table with role "편집자".

- [ ] **Step 5: Sign up as the invited address and confirm auto-join**

Sign out (via the top-right user menu → 로그아웃 → confirms redirect to `/login`). Sign up fresh with the exact invited email (`test2+<random>@yourcompany.com`).
Expected: after signup, `/workspaces` shows the workspace from Step 4 with role "편집자" — no manual step needed. Back in the first account's settings page, the pending invite is gone and this user now appears in the members table.

- [ ] **Step 6: Cancel-invite path**

From the first account, invite a third throwaway address, then click "취소" before signing up as that address.
Expected: invite disappears from the pending list; if you later sign up with that email, it does NOT get a workspace (lands on the empty-state `/workspaces` page).

- [ ] **Step 7: Case-insensitive invite matching**

From the first account, invite `Test5+<random>@YourCompany.com` (mixed case) as `viewer`. Sign out, then sign up using the all-lowercase form of the same address (`test5+<random>@yourcompany.com`).
Expected: the invite still matches and auto-joins with role "뷰어" — case and incidental whitespace in the invited email must not prevent the match.

- [ ] **Step 8: Clean up the DB password file if you haven't already**

```bash
rm -f /tmp/qa_workspace_db_pass.txt
```

- [ ] **Step 9: Final commit (if any manual fixes were made during verification)**

```bash
cd ~/Projects/qa-workspace
git status
```

If clean, no commit needed — the feature is done. If you made fixes while testing, commit them with a message describing what broke and why.
