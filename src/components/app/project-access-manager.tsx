import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getProjectAccess,
  inviteProjectMember,
  removeProjectAccess,
} from "@/lib/project-access.functions";
import { errorMessage } from "@/lib/domain";

const ROLE_LABEL = {
  manager: "프로젝트 관리자",
  contributor: "내부 실무자",
  client_reviewer: "고객사 검토자",
} as const;

export function ProjectAccessManager({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<keyof typeof ROLE_LABEL>("client_reviewer");
  const [busy, setBusy] = useState(false);

  async function load() {
    setData(await getProjectAccess({ data: { projectId } }));
  }

  useEffect(() => {
    if (open) void load().catch((error) => toast.error(errorMessage(error)));
  }, [open, projectId]);

  async function invite() {
    setBusy(true);
    try {
      const result = await inviteProjectMember({ data: { projectId, email, role } });
      setEmail("");
      await load();
      toast.success(
        result.joined ? "프로젝트 구성원으로 추가했어요" : "초대 대기 목록에 추가했어요",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: { memberId?: string; inviteId?: string }) {
    try {
      await removeProjectAccess({ data: { projectId, ...target } });
      await load();
      toast.success("접근 권한을 회수했어요");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const shareUrl = data?.shareToken ? `${window.location.origin}/share/${data.shareToken}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>프로젝트 구성원·고객사 초대</DialogTitle>
          <DialogDescription>
            프로젝트별 역할을 부여하고 고객사 이슈 페이지 접근을 관리합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <section className="rounded-lg border p-4">
            <Label htmlFor="project-invite-email">초대할 이메일</Label>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_160px_auto] gap-2 max-sm:grid-cols-1">
              <Input
                id="project-invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="reviewer@client.com"
              />
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as keyof typeof ROLE_LABEL)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {Object.entries(ROLE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <Button disabled={busy || !email.trim()} onClick={() => void invite()}>
                초대
              </Button>
            </div>
          </section>

          {shareUrl ? (
            <section className="rounded-lg border bg-muted/35 p-4">
              <p className="text-xs font-semibold">고객사 이슈 페이지</p>
              <div className="mt-2 flex items-center gap-2">
                <Input readOnly value={shareUrl} className="font-mono text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="공유 주소 복사"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    toast.success("공유 주소를 복사했어요");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="text-sm font-semibold">현재 구성원</h3>
            <div className="mt-2 divide-y rounded-lg border">
              {(data?.members ?? []).map((member: any) => (
                <div key={member.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.profile?.display_name || member.profile?.email || member.user_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[member.role as keyof typeof ROLE_LABEL]}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="구성원 제외"
                    onClick={() => void remove({ memberId: member.id })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {(data?.invites ?? []).length ? (
            <section>
              <h3 className="text-sm font-semibold">초대 대기</h3>
              <div className="mt-2 divide-y rounded-lg border">
                {data.invites.map((invite: any) => (
                  <div key={invite.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROLE_LABEL[invite.role as keyof typeof ROLE_LABEL]}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="초대 취소"
                      onClick={() => void remove({ inviteId: invite.id })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
