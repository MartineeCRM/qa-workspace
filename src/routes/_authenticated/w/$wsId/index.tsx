import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, FolderKanban, MoreHorizontal } from "lucide-react";

import { PageHeader, EmptyState, Panel } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, useProjects, type Project } from "@/lib/queries";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { canEdit, canAdmin, errorMessage, formatDate } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/w/$wsId/")({
  head: () => ({
    meta: [
      { title: "프로젝트 — Trackspec" },
      { name: "description", content: "이 워크스페이스의 모든 고객 프로젝트와 실시간 택소노미 규모예요." },
      { property: "og:title", content: "프로젝트 — Trackspec" },
      { property: "og:description", content: "Trackspec 워크스페이스의 프로젝트 목록이에요." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { wsId } = useParams({ from: "/_authenticated/w/$wsId/" });
  const { role, workspace } = useWorkspaceContext();
  const { data: projects, isLoading } = useProjects(wsId);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [counts, setCounts] = useState<Record<string, { events: number; attributes: number }>>({});
  const qc = useQueryClient();

  useMemo(() => {
    if (!projects || projects.length === 0) return;
    const ids = projects.map((p) => p.id);
    Promise.all([
      db.from("taxonomy_events").select("project_id").in("project_id", ids).eq("is_active", true),
      db.from("taxonomy_attributes").select("project_id").in("project_id", ids).eq("is_active", true),
    ]).then(([e, a]) => {
      const map: Record<string, { events: number; attributes: number }> = {};
      for (const id of ids) map[id] = { events: 0, attributes: 0 };
      for (const row of e.data ?? []) map[row.project_id].events += 1;
      for (const row of a.data ?? []) map[row.project_id].attributes += 1;
      setCounts(map);
    });
  }, [projects]);


  const visible = (projects ?? []).filter((p) => {
    if (!showArchived && p.archived_at) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.project_key.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q)
    );
  });

  async function toggleArchive(project: Project) {
    const { error } = await db
      .from("projects")
      .update({ archived_at: project.archived_at ? null : new Date().toISOString() })
      .eq("id", project.id);
    if (error) return toast.error(errorMessage(error));
    toast.success(project.archived_at ? "프로젝트를 복구했어요" : "프로젝트를 보관했어요");
    qc.invalidateQueries({ queryKey: ["projects", wsId] });
  }

  return (
    <div className="p-6">
      <PageHeader
        title="프로젝트"
        description={workspace.description || "프로젝트 하나가 고객 하나예요. 각 프로젝트는 택소노미 하나와 QA 환경들을 가져요."}
        actions={
          canEdit(role) ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> 새 프로젝트
            </Button>
          ) : null
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="프로젝트 검색"
            className="pl-8"
            placeholder="이름, 키, 설명으로 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          보관된 항목 보기
        </label>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={projects && projects.length > 0 ? "조건에 맞는 프로젝트가 없어요" : "아직 프로젝트가 없어요"}
            description={
              projects && projects.length > 0
                ? "검색어를 바꾸거나 보관된 항목도 함께 보여주세요."
                : "프로젝트를 만들면 택소노미와 QA 환경을 정의할 수 있어요."
            }
            action={
              canEdit(role) && (!projects || projects.length === 0) ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="size-4" /> 새 프로젝트
                </Button>
              ) : null
            }
          />
        ) : (
          <Panel>
            <Table className="data-grid">
              <TableHeader>
                <TableRow>
                  <TableHead>프로젝트</TableHead>
                  <TableHead>키</TableHead>
                  <TableHead className="text-right">이벤트</TableHead>
                  <TableHead className="text-right">속성</TableHead>
                  <TableHead>최근 수정</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link
                          to="/w/$wsId/p/$projectId"
                          params={{ wsId, projectId: p.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.archived_at ? <Pill>보관됨</Pill> : null}
                      </div>
                      {p.description ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {p.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="mono-token">{p.project_key}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {counts[p.id]?.events ?? 0}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {counts[p.id]?.attributes ?? 0}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(p.updated_at)}</TableCell>
                    <TableCell>
                      {canEdit(role) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`${p.name} 작업 메뉴`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setEditing(p)}>이름·설명 수정</DropdownMenuItem>
                            {canAdmin(role) || !p.archived_at ? (
                              <ArchiveItem project={p} onConfirm={() => toggleArchive(p)} />
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        )}
      </div>

      <ProjectDialog
        workspaceId={wsId}
        project={editing}
        open={creating || Boolean(editing)}
        onOpenChange={(v) => {
          if (!v) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />
    </div>
  );
}

function ArchiveItem({ project, onConfirm }: { project: Project; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {project.archived_at ? "복구" : "보관"}
      </DropdownMenuItem>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {project.archived_at ? "프로젝트를 복구할까요?" : "프로젝트를 보관할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {project.archived_at
                ? `“${project.name}” 프로젝트가 다시 활성화돼서 택소노미와 QA를 편집할 수 있어요.`
                : `“${project.name}” 프로젝트는 계속 볼 수는 있지만, 새 작업은 만들 수 없어요.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>
              {project.archived_at ? "복구" : "보관"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProjectDialog({
  workspaceId,
  project,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [initialised, setInitialised] = useState<string | null>(null);

  const identity = project?.id ?? "new";
  if (open && initialised !== identity) {
    setInitialised(identity);
    setName(project?.name ?? "");
    setKey(project?.project_key ?? "");
    setDescription(project?.description ?? "");
  }
  if (!open && initialised !== null) setInitialised(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const payload = {
      name: name.trim(),
      project_key: key.trim().toUpperCase(),
      description: description.trim() || null,
    };
    const { error } = project
      ? await db.from("projects").update(payload).eq("id", project.id)
      : await db.from("projects").insert({ ...payload, workspace_id: workspaceId, created_by: user.id });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(project ? "프로젝트를 수정했어요" : "프로젝트를 만들었어요");
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{project ? "프로젝트 수정" : "새 프로젝트"}</DialogTitle>
            <DialogDescription>
              프로젝트 키는 이 워크스페이스 안에서 겹치지 않는 짧은 식별자예요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">이름</Label>
              <Input id="p-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-key">프로젝트 키</Label>
              <Input
                id="p-key"
                required
                className="mono-token"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="SHOP"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">설명</Label>
              <Textarea
                id="p-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !key.trim()}>
              {busy ? "저장 중…" : project ? "변경 저장" : "프로젝트 만들기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
