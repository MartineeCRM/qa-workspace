import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/domain";
import { type QaChannel } from "@/lib/qa-rounds-queries";
import { db } from "@/lib/queries";

export function QaChannelsManager({
  projectId,
  channels,
  open,
  onOpenChange,
}: {
  projectId: string;
  channels: QaChannel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["qa-channels", projectId] });
    await qc.invalidateQueries({ queryKey: ["project-checklist-coverage", projectId] });
  }

  async function addChannel() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const slug = `${
      trimmed
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]+/g, "-")
        .replace(/^-|-$/g, "") || "channel"
    }-${Date.now().toString(36)}`;
    const { error } = await db.from("qa_channels").insert({
      project_id: projectId,
      name: trimmed,
      slug,
      sort_order: channels.length,
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    setName("");
    await refresh();
  }

  async function updateChannel(channel: QaChannel, patch: Partial<QaChannel>) {
    const { error } = await db.from("qa_channels").update(patch).eq("id", channel.id);
    if (error) return toast.error(errorMessage(error));
    await refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>검증 채널 설정</DialogTitle>
          <DialogDescription>
            필수 채널만 커버리지 분모에 포함됩니다. 사용한 채널은 삭제하지 않고 비활성화해 이력을
            보존해요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {channels.map((channel) => (
            <div key={channel.id} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{channel.name}</span>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                필수
                <Switch
                  checked={channel.is_required}
                  onCheckedChange={(checked) => updateChannel(channel, { is_required: checked })}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                사용
                <Switch
                  checked={channel.is_active}
                  onCheckedChange={(checked) => updateChannel(channel, { is_active: checked })}
                />
              </label>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: Mobile Web, PC Web"
              onKeyDown={(event) => {
                if (event.key === "Enter") addChannel();
              }}
            />
            <Button disabled={!name.trim() || saving} onClick={addChannel}>
              추가
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
