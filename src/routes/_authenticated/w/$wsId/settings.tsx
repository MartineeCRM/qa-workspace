import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader, Panel, FieldRow } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { db, useMembers, usePendingInvites } from "@/lib/queries";
import { useWorkspaceContext } from "@/lib/workspace-context";
import {
  ROLE_LABEL,
  ROLE_DESCRIPTION,
  WORKSPACE_ROLES,
  canAdmin,
  errorMessage,
  formatDate,
  type WorkspaceRole,
} from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/w/$wsId/settings")({
  head: () => ({
    meta: [
      { title: "워크스페이스 설정 — Trackspec" },
      { name: "description", content: "워크스페이스 이름과 설명, 멤버와 권한을 관리해요." },
      { property: "og:title", content: "워크스페이스 설정 — Trackspec" },
      { property: "og:description", content: "워크스페이스 멤버와 권한을 관리해요." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { wsId } = useParams({ from: "/_authenticated/w/$wsId/settings" });
  const { workspace, role } = useWorkspaceContext();
  const { data: members } = useMembers(wsId);
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const isAdmin = canAdmin(role);
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? "");
  const [busy, setBusy] = useState(false);

  const { data: invites } = usePendingInvites(wsId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("viewer");
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    setName(workspace.name);
    setDescription(workspace.description ?? "");
  }, [workspace.id, workspace.name, workspace.description]);

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await db
      .from("workspaces")
      .update({ name: name.trim(), description: description.trim() || null })
      .eq("id", wsId);
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success("워크스페이스를 수정했어요");
    qc.invalidateQueries({ queryKey: ["workspace", wsId] });
    qc.invalidateQueries({ queryKey: ["memberships"] });
  }

  async function toggleArchive() {
    const { error } = await db
      .from("workspaces")
      .update({ archived_at: workspace.archived_at ? null : new Date().toISOString() })
      .eq("id", wsId);
    if (error) return toast.error(errorMessage(error));
    toast.success(
      workspace.archived_at ? "워크스페이스를 복구했어요" : "워크스페이스를 보관했어요",
    );
    qc.invalidateQueries({ queryKey: ["workspace", wsId] });
    qc.invalidateQueries({ queryKey: ["memberships"] });
  }

  async function changeRole(memberId: string, nextRole: WorkspaceRole) {
    const { error } = await db
      .from("workspace_members")
      .update({ role: nextRole })
      .eq("id", memberId);
    if (error) return toast.error(errorMessage(error));
    toast.success("권한을 변경했어요");
    qc.invalidateQueries({ queryKey: ["members", wsId] });
    qc.invalidateQueries({ queryKey: ["role", wsId] });
  }

  async function removeMember(memberId: string, isSelf: boolean) {
    const { error } = await db.from("workspace_members").delete().eq("id", memberId);
    if (error) return toast.error(errorMessage(error));
    toast.success("멤버를 제외했어요");
    if (isSelf) return navigate({ to: "/workspaces" });
    qc.invalidateQueries({ queryKey: ["members", wsId] });
  }

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

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="워크스페이스 설정"
        description="워크스페이스 정보와 멤버, 권한을 관리해요."
        meta={workspace.archived_at ? <Pill>보관됨</Pill> : null}
      />

      {!isAdmin ? (
        <Alert>
          <AlertTitle>읽기 전용이에요</AlertTitle>
          <AlertDescription>
            현재 권한은 {role ? ROLE_LABEL[role] : "알 수 없음"}이에요. 소유자와 관리자만 설정과
            멤버를 바꿀 수 있어요.
          </AlertDescription>
        </Alert>
      ) : null}

      <Panel title="기본 정보">
        <form className="space-y-4 p-4" onSubmit={saveDetails}>
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">이름</Label>
            <Input
              id="ws-name"
              value={name}
              disabled={!isAdmin}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-desc">설명</Label>
            <Textarea
              id="ws-desc"
              rows={3}
              value={description}
              disabled={!isAdmin}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {isAdmin ? (
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "저장 중…" : "변경 저장"}
            </Button>
          ) : null}
        </form>
      </Panel>

      <Panel title="멤버" description="권한은 화면뿐 아니라 데이터베이스에서도 그대로 적용돼요.">
        <Table className="data-grid">
          <TableHeader>
            <TableRow>
              <TableHead>멤버</TableHead>
              <TableHead>권한</TableHead>
              <TableHead>합류일</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(members ?? []).map((m) => {
              const isSelf = m.user_id === user?.id;
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">
                        {m.profiles?.display_name || "알 수 없는 사용자"}
                      </span>
                      {isSelf ? (
                        <span className="ml-2 text-xs text-muted-foreground">나</span>
                      ) : null}
                    </div>
                    {m.profiles?.email ? (
                      <div className="text-xs text-muted-foreground">{m.profiles.email}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {isAdmin ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => changeRole(m.id, v as WorkspaceRole)}
                      >
                        <SelectTrigger className="h-8 w-36" aria-label="멤버 권한">
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
                    ) : (
                      ROLE_LABEL[m.role]
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(m.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            제외
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>이 멤버를 제외할까요?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {isSelf
                                ? "바로 이 워크스페이스에 접근할 수 없게 돼요."
                                : `${m.profiles?.display_name ?? "이 사용자"}님이 바로 이 워크스페이스에 접근할 수 없게 돼요.`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeMember(m.id, isSelf)}>
                              제외
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
      </Panel>

      <Panel title="워크스페이스 상태">
        <dl>
          <FieldRow label="생성일">{formatDate(workspace.created_at)}</FieldRow>
          <FieldRow label="최근 수정">{formatDate(workspace.updated_at)}</FieldRow>
          <FieldRow label="상태">{workspace.archived_at ? "보관됨" : "활성"}</FieldRow>
        </dl>
        {isAdmin ? (
          <div className="border-t p-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant={workspace.archived_at ? "outline" : "destructive"} size="sm">
                  {workspace.archived_at ? "워크스페이스 복구" : "워크스페이스 보관"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {workspace.archived_at
                      ? "워크스페이스를 복구할까요?"
                      : "워크스페이스를 보관할까요?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    보관해도 데이터는 그대로 볼 수 있고 비활성 상태로만 표시돼요. 언제든 다시 복구할
                    수 있어요.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={toggleArchive}>
                    {workspace.archived_at ? "복구" : "보관"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
