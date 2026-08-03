import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

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
import { db, type QaEnvironment } from "@/lib/queries";
import { errorMessage, slugify } from "@/lib/domain";

export function StagesManager({
  projectId,
  stages,
  open,
  onOpenChange,
  onManageChannels,
}: {
  projectId: string;
  stages: QaEnvironment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManageChannels: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<QaEnvironment | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["environments", projectId] });
    qc.invalidateQueries({ queryKey: ["item-status", projectId] });
  };

  function startEdit(stage: QaEnvironment) {
    setEditing(stage);
    setName(stage.name);
    setDescription(stage.description ?? "");
  }

  function reset() {
    setEditing(null);
    setName("");
    setDescription("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    if (editing) {
      const { error } = await db
        .from("qa_stages")
        .update({ name: trimmed, description: description.trim() || null })
        .eq("id", editing.id);
      setBusy(false);
      if (error) return toast.error(errorMessage(error));
      toast.success("QA 환경을 수정했어요");
    } else {
      const existing = new Set(stages.map((s) => s.slug));
      let slug = slugify(trimmed);
      let i = 2;
      while (existing.has(slug)) slug = `${slugify(trimmed)}-${i++}`;
      const { error } = await db.from("qa_environments").insert({
        project_id: projectId,
        slug,
        name: trimmed,
        description: description.trim() || null,
        sort_order: stages.length + 1,
      });
      setBusy(false);
      if (error) return toast.error(errorMessage(error));
      toast.success("QA 환경을 추가했어요");
    }
    reset();
    refresh();
  }

  async function remove(stage: QaEnvironment) {
    const { error } = await db.from("qa_environments").delete().eq("id", stage.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("QA 환경을 삭제했어요");
    if (editing?.id === stage.id) reset();
    refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>QA 환경 관리</DialogTitle>
          <DialogDescription>
            기본은 개발 QA와 운영 QA 두 개예요. 필요하면 스테이징이나 리그레션 같은 환경을 자유롭게
            추가할 수 있어요. 모든 환경은 같은 택소노미를 검증해요.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y rounded-md border">
          {stages.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">아직 QA 환경이 없어요.</li>
          ) : (
            stages.map((stage) => (
              <li key={stage.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{stage.name}</p>
                  <p className="mono-token truncate text-xs text-muted-foreground">{stage.slug}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="이름 수정"
                  onClick={() => startEdit(stage)}
                >
                  <Pencil className="size-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label="삭제">
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>“{stage.name}” 환경을 삭제할까요?</AlertDialogTitle>
                      <AlertDialogDescription>
                        이 환경에 쌓인 업로드와 검증 상태도 함께 사라져요. 택소노미는 그대로
                        유지돼요.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(stage)}>삭제</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div>
            <p className="text-sm font-semibold">검증 채널</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Android, iOS처럼 환경별 검증에 사용할 플랫폼을 관리해요.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onManageChannels}>
            검증 채널 설정
          </Button>
        </div>

        <form className="space-y-3 rounded-md border p-3" onSubmit={submit}>
          <p className="text-sm font-semibold">{editing ? "환경 수정" : "새 QA 환경 추가"}</p>
          <div className="space-y-1.5">
            <Label htmlFor="stage-name">이름</Label>
            <Input
              id="stage-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="스테이징 QA"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage-desc">설명</Label>
            <Textarea
              id="stage-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="어떤 환경의 로그를 검증하는지 적어주세요."
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {editing ? "수정 저장" : "환경 추가"}
            </Button>
            {editing ? (
              <Button type="button" size="sm" variant="outline" onClick={reset}>
                취소
              </Button>
            ) : null}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
