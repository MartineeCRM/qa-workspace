import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthCard } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === "string" &&
      (search.redirect.startsWith("/share/") || search.redirect.startsWith("/taxonomy-studio"))
        ? search.redirect
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "가입 — QA Workspace" },
      { name: "description", content: "회사 이메일로 가입해요." },
    ],
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ href: search.redirect ?? "/workspaces" });
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();
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
    const { data, error } = await signUp(email.trim(), password);
    setBusy(false);
    if (error) return toast.error(authErrorMessage(error, "가입에 실패했어요"));
    if (!data.session) {
      toast.info(
        "이메일의 가입 확인 링크를 눌러주세요. 메일이 없다면 로그인 화면에서 다시 보낼 수 있어요.",
      );
      return;
    }
    navigate({ href: redirectTo ?? "/workspaces" });
  }

  return (
    <AuthCard
      title="가입하기"
      description="초대받은 이메일로 가입해주세요. 이메일 인증이 필요하면 가입 후 안내해드려요."
      footer={
        <>
          이미 계정이 있으신가요?{" "}
          <Link
            to="/login"
            search={{ redirect: redirectTo }}
            className="font-medium text-primary hover:underline"
          >
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
