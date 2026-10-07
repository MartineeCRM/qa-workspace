import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
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
import { db, type TaxonomyEvent } from "@/lib/queries";
import { errorMessage } from "@/lib/domain";
import { type QaChannel } from "@/lib/qa-rounds-queries";
import { toast } from "sonner";

export function EventDialog({
  projectId,
  userId,
  event,
  channels,
  excludedKeys,
  onClose,
  onSaved,
}: {
  projectId: string;
  userId: string;
  event: TaxonomyEvent | null;
  channels: QaChannel[];
  excludedKeys: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [technicalName, setTechnicalName] = useState(event?.technical_name ?? "");
  const [displayName, setDisplayName] = useState(event?.display_name ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState(
    () =>
      new Set(
        channels
          .filter((channel) => !event || !excludedKeys.has(`${event.id}:${channel.id}`))
          .map((channel) => channel.id),
      ),
  );

  async function submit() {
    if (!technicalName.trim()) return toast.error("기술 이름은 필수예요");
    setSaving(true);
    const payload = {
      technical_name: technicalName.trim(),
      display_name: displayName.trim() || null,
      description: description.trim() || null,
    };
    const { error } = event
      ? await db.from("taxonomy_events").update(payload).eq("id", event.id)
      : await db
          .from("taxonomy_events")
          .insert({ ...payload, project_id: projectId, created_by: userId });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    if (event) {
      const { error: deleteError } = await db
        .from("taxonomy_event_channel_exclusions")
        .delete()
        .eq("event_id", event.id);
      if (deleteError) return toast.error(errorMessage(deleteError));
      const excluded = channels.filter((channel) => !selectedChannelIds.has(channel.id));
      if (excluded.length > 0) {
        const { error: insertError } = await db
          .from("taxonomy_event_channel_exclusions")
          .insert(excluded.map((channel) => ({ event_id: event.id, channel_id: channel.id })));
        if (insertError) return toast.error(errorMessage(insertError));
      }
    }
    toast.success(event ? "이벤트를 수정했어요" : "택소노미에 이벤트를 추가했어요");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "이벤트 수정" : "이벤트 추가"}</DialogTitle>
          <DialogDescription>
            이벤트는 모든 QA 환경이 측정 기준으로 삼는 전체 커버리지에 포함돼요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-name">기술 이름</Label>
            <Input
              id="ev-name"
              value={technicalName}
              onChange={(e) => setTechnicalName(e.target.value)}
              placeholder="purchase"
            />
          </div>
          {event && channels.length > 0 ? (
            <div className="space-y-1.5">
              <Label>수집 채널</Label>
              <div className="flex flex-wrap gap-2">
                {channels.map((channel) => (
                  <label
                    key={channel.id}
                    className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs"
                  >
                    <Checkbox
                      checked={selectedChannelIds.has(channel.id)}
                      onCheckedChange={(checked) =>
                        setSelectedChannelIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(channel.id);
                          else next.delete(channel.id);
                          return next;
                        })
                      }
                    />
                    {channel.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="ev-display">표시 이름</Label>
            <Input
              id="ev-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="구매 완료"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">설명</Label>
            <Textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving}>
            {event ? "변경 저장" : "이벤트 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
