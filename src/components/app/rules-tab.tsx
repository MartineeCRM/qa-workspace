import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { EmptyState, Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  db,
  type TaxonomyCustomAttribute,
  type TaxonomyEvent,
  type TaxonomyEventProperty,
  type ValidationRule,
} from "@/lib/queries";
import { errorMessage } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export function RulesTab({
  projectId,
  rules,
  events,
  eventProperties,
  customAttributes,
  editable,
}: {
  projectId: string;
  rules: ValidationRule[];
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  customAttributes: TaxonomyCustomAttribute[];
  editable: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [dialog, setDialog] = useState<{ rule: ValidationRule | null } | null>(null);

  const eventById = new Map(events.map((e) => [e.id, e]));
  const propertyById = new Map(eventProperties.map((p) => [p.id, p]));
  const customById = new Map(customAttributes.map((a) => [a.id, a]));

  const refresh = () => qc.invalidateQueries({ queryKey: ["rules", projectId] });

  async function toggleEnabled(rule: ValidationRule) {
    const { error } = await db
      .from("validation_rules")
      .update({ is_enabled: !rule.is_enabled })
      .eq("id", rule.id);
    if (error) return toast.error(errorMessage(error));
    refresh();
  }

  async function remove(rule: ValidationRule) {
    const { error } = await db.from("validation_rules").delete().eq("id", rule.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("규칙을 삭제했어요");
    refresh();
  }

  function target(rule: ValidationRule) {
    if (rule.property_id) {
      const prop = propertyById.get(rule.property_id);
      const parent = prop ? eventById.get(prop.event_id) : null;
      return `${parent ? `${parent.technical_name}.` : ""}${prop?.technical_name ?? "—"}`;
    }
    if (rule.custom_attribute_id) {
      return customById.get(rule.custom_attribute_id)?.technical_name ?? "—";
    }
    if (rule.event_id) return eventById.get(rule.event_id)?.technical_name ?? "—";
    return "프로젝트 전체";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {editable ? (
          <Button size="sm" className="ml-auto" onClick={() => setDialog({ rule: null })}>
            <Plus className="size-4" /> 규칙 추가
          </Button>
        ) : null}
      </div>

      <Panel
        title="검증 규칙"
        description="AI가 실제 수집된 값을 판단할 때 참고하는 정성적 기준이에요. 타입·필수여부·enum은 택소노미 자체에서 관리해요."
      >
        {rules.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="아직 검증 규칙이 없어요"
            description="이벤트나 속성에 규칙을 달아두면 AI가 그 기준으로 실제 값을 판단해요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>규칙</TableHead>
                <TableHead>대상</TableHead>
                <TableHead className="w-32 text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <p className="font-medium">{rule.name}</p>
                    {rule.description ? (
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="mono-token text-xs">{target(rule)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {editable ? (
                        <>
                          <Switch
                            checked={rule.is_enabled}
                            onCheckedChange={() => toggleEnabled(rule)}
                            aria-label="사용 여부"
                          />
                          <Button size="icon" variant="ghost" onClick={() => setDialog({ rule })} aria-label="규칙 수정">
                            <Pencil className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="규칙 삭제">
                                <Trash2 className="size-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>“{rule.name}” 규칙을 삭제할까요?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  삭제하면 모든 QA 라운드에서 이 규칙으로는 더 이상 검증하지 않아요.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>취소</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(rule)}>삭제</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {dialog ? (
        <RuleDialog
          projectId={projectId}
          userId={user?.id ?? ""}
          rule={dialog.rule}
          events={events}
          eventProperties={eventProperties}
          customAttributes={customAttributes}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function RuleDialog({
  projectId,
  userId,
  rule,
  events,
  eventProperties,
  customAttributes,
  onClose,
  onSaved,
}: {
  projectId: string;
  userId: string;
  rule: ValidationRule | null;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  customAttributes: TaxonomyCustomAttribute[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [targetKey, setTargetKey] = useState(
    rule?.property_id
      ? `property:${rule.property_id}`
      : rule?.custom_attribute_id
        ? `attribute:${rule.custom_attribute_id}`
        : rule?.event_id
          ? `event:${rule.event_id}`
          : "none",
  );
  const [saving, setSaving] = useState(false);

  const eventById = new Map(events.map((e) => [e.id, e]));

  async function submit() {
    if (!name.trim()) return toast.error("규칙 이름은 필수예요");
    setSaving(true);
    const [kind, id] = targetKey.split(":");
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      event_id: kind === "event" ? id : null,
      property_id: kind === "property" ? id : null,
      custom_attribute_id: kind === "attribute" ? id : null,
    };
    const { error } = rule
      ? await db.from("validation_rules").update(payload).eq("id", rule.id)
      : await db.from("validation_rules").insert({ ...payload, project_id: projectId, created_by: userId });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(rule ? "규칙을 수정했어요" : "규칙을 만들었어요");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "규칙 수정" : "검증 규칙 추가"}</DialogTitle>
          <DialogDescription>
            AI가 실제 값을 판단할 때 참고하는 설명을 적어주세요. 타입·필수여부·enum은 택소노미 정의로
            자동 체크되니 여기엔 정성적인 기준만 적으면 돼요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">이름</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>적용 대상</Label>
            <Select value={targetKey} onValueChange={setTargetKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">프로젝트 전체</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={`event:${e.id}`}>
                    이벤트 · {e.technical_name}
                  </SelectItem>
                ))}
                {eventProperties.map((p) => (
                  <SelectItem key={p.id} value={`property:${p.id}`}>
                    속성 · {eventById.get(p.event_id)?.technical_name ?? "?"}.{p.technical_name}
                  </SelectItem>
                ))}
                {customAttributes.map((a) => (
                  <SelectItem key={a.id} value={`attribute:${a.id}`}>
                    사용자 속성 · {a.technical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              이벤트를 고르면 그 이벤트가 유저 attribute에 미치는 인과관계도 이 규칙으로 표현할 수
              있어요(설명에 "이 이벤트 이후 이 attribute가 이렇게 바뀌어야 한다"처럼 적어주세요).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-desc">설명 (AI 판단 기준)</Label>
            <Textarea
              id="rule-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="예: product_name은 상품명이어야 하고, 상품번호가 들어오면 안 돼요."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving}>
            {rule ? "변경 저장" : "규칙 만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
