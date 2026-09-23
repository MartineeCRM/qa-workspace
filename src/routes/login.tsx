import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthCard } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage, isAllowedAuthRedirect } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: isAllowedAuthRedirect(search.redirect) ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "로그인 — QA Workspace" },
      { name: "description", content: "회사 이메일로 로그인해요." },
    ],
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ href: search.redirect ?? "/workspaces" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function resendConfirmation() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
      if (error) return toast.error(authErrorMessage(error));
      toast.success("가입 확인 메일을 다시 요청했어요. 받은편지함과 스팸함을 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) {
      setNeedsConfirmation(error.code === "email_not_confirmed");
      return toast.error(authErrorMessage(error, "로그인에 실패했어요"));
    }
    navigate({ href: redirectTo ?? "/workspaces" });
  }

  return (
    <AuthCard
      title="로그인"
      description="회사 이메일과 비밀번호로 로그인해요."
      footer={
        <>
          계정이 없으신가요?{" "}
          <Link
            to="/signup"
            search={{ redirect: redirectTo }}
            className="font-medium text-primary hover:underline"
          >
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
        {needsConfirmation && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy || !email.trim()}
            onClick={() => void resendConfirmation()}
          >
            가입 확인 메일 다시 보내기
          </Button>
        )}
      </form>
    </AuthCard>
  );
}
