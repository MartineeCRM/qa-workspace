import { createFileRoute, Link } from "@tanstack/react-router";

import { TopBar } from "@/components/app/top-bar";
import { PageHeader, EmptyState } from "@/components/app/layout-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyMemberships, useProjects } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/taxonomy-studio/")({
  head: () => ({ meta: [{ title: "Studio — 택소노미" }] }),
  component: StudioIndexPage,
});

function ProjectList({ workspaceId }: { workspaceId: string }) {
  const { data: projects = [], isLoading } = useProjects(workspaceId);
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (projects.length === 0) {
    return <p className="px-1 text-xs text-muted-foreground">프로젝트가 없어요.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            to="/taxonomy-studio/$projectId"
            params={{ projectId: project.id }}
            className="flex items-center justify-between px-4 py-3 text-sm hover:bg-accent"
          >
            <span>{project.name}</span>
            <span className="text-xs text-muted-foreground">{project.project_key}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StudioIndexPage() {
  const { data: memberships = [], isLoading } = useMyMemberships();
  const active = memberships.filter((m) => m.workspaces && !m.workspaces.archived_at);

  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="mx-auto max-w-[900px] space-y-6 p-6">
        <PageHeader title="Studio" description="택소노미를 설계할 프로젝트를 골라주세요." />
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : active.length === 0 ? (
          <EmptyState
            title="속한 워크스페이스가 없어요"
            description="워크스페이스에 먼저 참여해주세요."
          />
        ) : (
          <div className="space-y-6">
            {active.map((m) => (
              <div key={m.workspace_id} className="space-y-2">
                <h2 className="text-sm font-semibold">{m.workspaces.name}</h2>
                <ProjectList workspaceId={m.workspace_id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
