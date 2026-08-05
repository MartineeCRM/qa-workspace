import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FolderKanban } from "lucide-react";

import { TopBar } from "@/components/app/top-bar";
import { PageHeader, EmptyState } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyMemberships, db } from "@/lib/queries";
import { ROLE_LABEL, errorMessage, formatDate } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/workspaces")({
  head: () => ({
    meta: [
      { title: "워크스페이스 — QA Workspace" },
      {
        name: "description",
        content: "트래킹 스펙을 관리할 워크스페이스를 고르거나 새로 만들어요.",
      },
      { property: "og:title", content: "워크스페이스 — QA Workspace" },
      { property: "og:description", content: "내 트래킹 스펙 워크스페이스 목록이에요." },
    ],
  }),
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const { data, isLoading } = useMyMemberships();
  const memberships = (data ?? []).filter((m) => m.workspaces);
  const active = memberships.filter((m) => !m.workspaces.archived_at);
  const archived = memberships.filter((m) => m.workspaces.archived_at);

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <PageHeader
          title="워크스페이스"
          description="워크스페이스는 고객 프로젝트와 함께 일하는 사람들을 묶어주는 공간이에요."
          actions={<CreateWorkspaceDialog />}
        />

        <div className="mt-6 space-y-8">
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : memberships.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="아직 워크스페이스가 없어요"
              description="첫 워크스페이스를 만들면 고객 택소노미를 정의할 수 있어요."
              action={<CreateWorkspaceDialog />}
            />
          ) : (
            <>
              <WorkspaceGrid items={active} />
              {archived.length > 0 ? (
                <div>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    보관됨
                  </h2>
                  <WorkspaceGrid items={archived} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function WorkspaceGrid({ items }: { items: ReturnType<typeof useMyMemberships>["data"] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((m) => (
        <Link
          key={m.id}
          to="/w/$wsId"
          params={{ wsId: m.workspace_id }}
          className="group rounded-md border bg-card p-4 shadow-panel transition-colors hover:border-primary/50"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold group-hover:text-primary">
                {m.workspaces.name}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {m.workspaces.description || "설명이 없어요"}
              </p>
            </div>
            <Pill>{ROLE_LABEL[m.role]}</Pill>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {m.workspaces.archived_at
              ? `${formatDate(m.workspaces.archived_at)} 보관됨`
              : `${formatDate(m.workspaces.updated_at)} 수정됨`}
          </p>
        </Link>
      ))}
    </div>
  );
}

export function CreateWorkspaceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { user } = useAuth();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await db
      .from("workspaces")
      .insert({ name: name.trim(), description: description.trim() || null, created_by: user.id });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("워크스페이스를 만들었어요");
    setOpen(false);
    setName("");
    setDescription("");
    qc.invalidateQueries({ queryKey: ["memberships"] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> 새 워크스페이스
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>워크스페이스 만들기</DialogTitle>
            <DialogDescription>
              만든 사람이 소유자가 되고, 이후에 팀원을 추가할 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">이름</Label>
              <Input
                id="ws-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="그로스 애널리틱스"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-desc">설명</Label>
              <Textarea
                id="ws-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="이 워크스페이스에서 다루는 내용을 적어주세요"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "만드는 중…" : "워크스페이스 만들기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
