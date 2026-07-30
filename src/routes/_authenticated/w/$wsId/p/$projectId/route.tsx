import { useState } from "react";
import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, SlidersHorizontal } from "lucide-react";

import { db, useEnvironments, useProject, type QaEnvironment } from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/components/ui/dialog";
import { Pill } from "@/components/app/badges";
import { StagesManager } from "@/components/app/stages-manager";
import { AttributeApiSettings } from "@/components/app/attribute-api-settings";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { canEdit, errorMessage } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId")({
  component: ProjectShell,
});

function ProjectShell() {
  const { wsId, projectId } = useParams({ from: "/_authenticated/w/$wsId/p/$projectId" });
  const { data: project, isLoading } = useProject(projectId);
  const { data: stages } = useEnvironments(projectId);
  const { role } = useWorkspaceContext();
  const editable = canEdit(role);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);

  if (isLoading)
    return (
      <div className="p-6">
        <Skeleton className="h-40 w-full" />
      </div>
    );

  if (!project) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-lg font-semibold">프로젝트를 열 수 없어요</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          삭제됐거나 접근 권한이 없는 프로젝트예요.
        </p>
        <Button asChild className="mt-4">
          <Link to="/w/$wsId" params={{ wsId }}>
            프로젝트 목록으로
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b bg-card px-6 pt-4">
        <nav aria-label="경로" className="text-xs text-muted-foreground">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to="/w/$wsId" params={{ wsId }} className="hover:text-foreground">
                프로젝트
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="font-medium text-foreground">{project.name}</li>
          </ol>
        </nav>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{project.name}</h1>
          <span className="mono-token text-xs text-muted-foreground">{project.project_key}</span>
          {project.archived_at ? <Pill>보관됨</Pill> : null}
          {editable ? (
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}>
                <Pencil className="size-4" /> 이름 수정
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStagesOpen(true)}>
                <SlidersHorizontal className="size-4" /> QA 환경 관리
              </Button>
              <Button size="sm" variant="outline" onClick={() => setApiSettingsOpen(true)}>
                Attribute API 설정
              </Button>
            </div>
          ) : null}
        </div>
        <ul className="mt-3 flex flex-wrap gap-1">
          <TabLink to="/w/$wsId/p/$projectId" params={{ wsId, projectId }} exact>
            개요
          </TabLink>
          <TabLink to="/w/$wsId/p/$projectId/taxonomy" params={{ wsId, projectId }}>
            택소노미
          </TabLink>
          {(stages ?? []).map((stage: QaEnvironment) => (
            <TabLink
              key={stage.id}
              to="/w/$wsId/p/$projectId/qa/$stageSlug"
              params={{ wsId, projectId, stageSlug: stage.slug }}
            >
              {stage.name}
            </TabLink>
          ))}
          {(stages ?? []).map((stage: QaEnvironment) => (
            <TabLink
              key={`${stage.id}-rounds`}
              to="/w/$wsId/p/$projectId/qa/$stageSlug/rounds"
              params={{ wsId, projectId, stageSlug: stage.slug }}
            >
              {stage.name} 라운드
            </TabLink>
          ))}
        </ul>
      </div>
      <Outlet />

      <StagesManager
        projectId={projectId}
        stages={stages ?? []}
        open={stagesOpen}
        onOpenChange={setStagesOpen}
      />
      <AttributeApiSettings
        projectId={projectId}
        open={apiSettingsOpen}
        onOpenChange={setApiSettingsOpen}
      />
      {renameOpen ? (
        <RenameProjectDialog
          projectId={projectId}
          initialName={project.name}
          initialDescription={project.description ?? ""}
          onClose={() => setRenameOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RenameProjectDialog({
  projectId,
  initialName,
  initialDescription,
  onClose,
}: {
  projectId: string;
  initialName: string;
  initialDescription: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await db
      .from("projects")
      .update({ name: name.trim(), description: description.trim() || null })
      .eq("id", projectId);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("프로젝트 정보를 수정했어요");
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>프로젝트 정보 수정</DialogTitle>
            <DialogDescription>
              이름과 설명을 바꿔도 택소노미와 QA 기록은 그대로예요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="pr-name">이름</Label>
              <Input id="pr-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-desc">설명</Label>
              <Textarea
                id="pr-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TabLink({
  to,
  params,
  exact,
  children,
}: {
  to: string;
  params: Record<string, string>;
  exact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        to={to as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params={params as any}
        activeOptions={{ exact }}
        className={cn(
          "inline-flex border-b-2 border-transparent px-3 pb-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
        )}
        activeProps={{ className: "border-primary text-foreground font-medium" }}
      >
        {children}
      </Link>
    </li>
  );
}
