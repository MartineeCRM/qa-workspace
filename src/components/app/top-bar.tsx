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
          QA Workspace
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
