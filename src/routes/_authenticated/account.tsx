import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { TopBar } from "@/components/app/top-bar";
import { PageHeader, Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/queries";
import { errorMessage } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "내 프로필 — Trackspec" },
      { name: "description", content: "표시 이름과 프로필 이미지를 수정해요." },
      { property: "og:title", content: "내 프로필 — Trackspec" },
      { property: "og:description", content: "Trackspec 계정 프로필을 관리해요." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setAvatarUrl(profile.avatar_url ?? "");
    }
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await db
      .from("profiles")
      .update({ display_name: displayName.trim(), avatar_url: avatarUrl.trim() || null })
      .eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    await refreshProfile();
    toast.success("프로필을 수정했어요");
  }

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <PageHeader title="내 프로필" description="다른 워크스페이스 멤버에게 보이는 정보예요." />
        <Panel className="mt-6" title="프로필">
          <form className="space-y-4 p-4" onSubmit={save}>
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" value={user?.email ?? ""} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display-name">표시 이름</Label>
              <Input
                id="display-name"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avatar">프로필 이미지 URL</Label>
              <Input
                id="avatar"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <Button type="submit" disabled={busy || !displayName.trim()}>
              {busy ? "저장 중…" : "변경 저장"}
            </Button>
          </form>
        </Panel>
      </main>
    </div>
  );
}
