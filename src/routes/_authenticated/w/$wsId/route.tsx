import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { FolderKanban, Settings2, ChevronsUpDown, Check } from "lucide-react";

import { TopBar } from "@/components/app/top-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyMemberships, useMyRole, useWorkspace } from "@/lib/queries";
import { WorkspaceContext } from "@/lib/workspace-context";
import { ROLE_LABEL } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/w/$wsId")({
  component: WorkspaceShell,
});

function WorkspaceShell() {
  const { wsId } = useParams({ from: "/_authenticated/w/$wsId" });
  const { data: workspace, isLoading } = useWorkspace(wsId);
  const { data: role } = useMyRole(wsId);
  const { data: memberships } = useMyMemberships();

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <div className="p-6">
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-lg font-semibold">워크스페이스를 열 수 없어요</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            삭제됐거나 멤버가 아닌 워크스페이스예요.
          </p>
          <Button asChild className="mt-4">
            <Link to="/workspaces">워크스페이스 목록으로</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ workspace, role: role ?? null }}>
      <div className="min-h-screen">
        <TopBar>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 border-l pl-3 text-sm">
                <span className="max-w-[16rem] truncate font-medium">{workspace.name}</span>
                <span className="text-xs text-muted-foreground">
                  {role ? ROLE_LABEL[role] : "—"}
                </span>
                <ChevronsUpDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>워크스페이스 전환</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(memberships ?? []).map((m) => (
                <DropdownMenuItem key={m.id} asChild>
                  <Link to="/w/$wsId" params={{ wsId: m.workspace_id }} className="justify-between">
                    <span className="truncate">{m.workspaces?.name}</span>
                    {m.workspace_id === wsId ? <Check className="size-3.5" /> : null}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/workspaces">전체 워크스페이스</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TopBar>

        <div className="flex min-h-[calc(100vh-3rem)]">
          <nav
            aria-label="워크스페이스 내비게이션"
            className="hidden w-56 shrink-0 border-r bg-sidebar py-4 text-sidebar-foreground md:block"
          >
            <p className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              워크스페이스
            </p>
            <ul className="space-y-0.5 px-2">
              <SideLink to="/w/$wsId" params={{ wsId }} icon={FolderKanban} exact>
                프로젝트
              </SideLink>
              <SideLink to="/w/$wsId/settings" params={{ wsId }} icon={Settings2}>
                설정·멤버
              </SideLink>
            </ul>
            {workspace.archived_at ? (
              <p className="mx-2 mt-4 rounded-sm bg-sidebar-accent px-3 py-2 text-xs text-sidebar-accent-foreground">
                이 워크스페이스는 보관 상태예요.
              </p>
            ) : null}
          </nav>
          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

function SideLink({
  to,
  params,
  icon: Icon,
  children,
  exact,
}: {
  to: string;
  params: Record<string, string>;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  exact?: boolean;
}) {
  return (
    <li>
      <Link
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        to={to as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params={params as any}
        activeOptions={{ exact }}
        className="flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        activeProps={{
          className: cn("bg-sidebar-accent text-sidebar-accent-foreground font-medium"),
        }}
      >
        <Icon className="size-4" />
        {children}
      </Link>
    </li>
  );
}
