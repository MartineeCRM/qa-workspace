import { useMemo, useState, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";

import { EmptyState, Panel } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  db,
  type TaxonomyCustomAttribute,
  type TaxonomyEvent,
  type TaxonomyEventProperty,
  type ValidationRule,
  type ValidationRuleTarget,
} from "@/lib/queries";
import { errorMessage } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

type RuleTarget = {
  kind: "event" | "property" | "custom_attribute";
  id: string;
  label: string;
};

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

  function targetLabel(t: ValidationRuleTarget) {
    if (t.target_type === "property") {
      const prop = propertyById.get(t.target_id);
      const parent = prop ? eventById.get(prop.event_id) : null;
      return `${parent ? `${parent.technical_name}.` : ""}${prop?.technical_name ?? "—"}`;
    }
    if (t.target_type === "custom_attribute") {
      return customById.get(t.target_id)?.technical_name ?? "—";
    }
    return eventById.get(t.target_id)?.technical_name ?? "—";
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
                <TableHead>규칙명</TableHead>
                <TableHead>대상</TableHead>
                <TableHead>설명</TableHead>
                <TableHead className="w-32 text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>
                    {rule.validation_rule_targets.length === 0 ? (
                      <span className="mono-token text-xs">프로젝트 전체</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {rule.validation_rule_targets.map((t) => (
                          <Pill key={t.id}>{targetLabel(t)}</Pill>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {rule.description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {editable ? (
                        <>
                          <Switch
                            checked={rule.is_enabled}
                            onCheckedChange={() => toggleEnabled(rule)}
                            aria-label="사용 여부"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDialog({ rule })}
                            aria-label="규칙 수정"
                          >
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
                                <AlertDialogTitle>
                                  “{rule.name}” 규칙을 삭제할까요?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  삭제하면 모든 QA 라운드에서 이 규칙으로는 더 이상 검증하지 않아요.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>취소</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove(rule)}>
                                  삭제
                                </AlertDialogAction>
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
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<RuleTarget[]>(() =>
    (rule?.validation_rule_targets ?? []).map((t) => {
      if (t.target_type === "property") {
        const prop = eventProperties.find((p) => p.id === t.target_id);
        const parent = prop ? eventById.get(prop.event_id) : null;
        return {
          kind: "property" as const,
          id: t.target_id,
          label: `${parent ? `${parent.technical_name}.` : ""}${prop?.technical_name ?? "—"}`,
        };
      }
      if (t.target_type === "custom_attribute") {
        const attr = customAttributes.find((a) => a.id === t.target_id);
        return {
          kind: "custom_attribute" as const,
          id: t.target_id,
          label: attr?.technical_name ?? "—",
        };
      }
      const event = events.find((e) => e.id === t.target_id);
      return { kind: "event" as const, id: t.target_id, label: event?.technical_name ?? "—" };
    }),
  );
  const [saving, setSaving] = useState(false);

  const stagedKeys = useMemo(() => new Set(staged.map((t) => `${t.kind}:${t.id}`)), [staged]);

  const searchCandidates: RuleTarget[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const eventTargets: RuleTarget[] = events.map((e) => ({
      kind: "event",
      id: e.id,
      label: e.technical_name,
    }));
    const propTargets: RuleTarget[] = eventProperties.map((p) => ({
      kind: "property",
      id: p.id,
      label: `${eventById.get(p.event_id)?.technical_name ?? "?"}.${p.technical_name}`,
    }));
    const attrTargets: RuleTarget[] = customAttributes.map((a) => ({
      kind: "custom_attribute",
      id: a.id,
      label: a.technical_name,
    }));
    const all = [...eventTargets, ...propTargets, ...attrTargets].filter(
      (t) => !stagedKeys.has(`${t.kind}:${t.id}`),
    );
    if (!q) return all;
    return all.filter((t) => t.label.toLowerCase().includes(q));
  }, [search, events, eventProperties, customAttributes, stagedKeys, eventById]);

  function stageTarget(target: RuleTarget) {
    setStaged((prev) => [...prev, target]);
    setSearch("");
  }

  function unstage(key: string) {
    setStaged((prev) => prev.filter((t) => `${t.kind}:${t.id}` !== key));
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (searchCandidates.length === 0) return;
    stageTarget(searchCandidates[0]);
  }

  async function submit() {
    if (!name.trim()) return toast.error("규칙 이름은 필수예요");
    setSaving(true);
    const payload = { name: name.trim(), description: description.trim() || null };

    const { data: savedRule, error } = rule
      ? await db.from("validation_rules").update(payload).eq("id", rule.id).select().single()
      : await db
          .from("validation_rules")
          .insert({ ...payload, project_id: projectId, created_by: userId })
          .select()
          .single();
    if (error) {
      setSaving(false);
      return toast.error(errorMessage(error));
    }

    if (rule) {
      const { error: deleteError } = await db
        .from("validation_rule_targets")
        .delete()
        .eq("rule_id", rule.id);
      if (deleteError) {
        setSaving(false);
        return toast.error(errorMessage(deleteError));
      }
    }
    if (staged.length > 0) {
      const { error: targetError } = await db.from("validation_rule_targets").insert(
        staged.map((t) => ({
          rule_id: savedRule.id,
          target_type: t.kind,
          target_id: t.id,
        })),
      );
      if (targetError) {
        setSaving(false);
        return toast.error(errorMessage(targetError));
      }
    }

    setSaving(false);
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
            AI가 실제 값을 판단할 때 참고하는 설명을 적어주세요. 타입·필수여부·enum은 택소노미
            정의로 자동 체크되니 여기엔 정성적인 기준만 적으면 돼요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">이름</Label>
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              대상이 여러 개일 수 있어서, 목록에서 이 규칙을 한눈에 알아볼 이름이 필요해요.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>적용 대상 (비워두면 프로젝트 전체)</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="이벤트·속성 이름을 입력하고 엔터"
            />
            {search.trim() && searchCandidates.length > 0 ? (
              <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
                {searchCandidates.slice(0, 20).map((t) => {
                  const key = `${t.kind}:${t.id}`;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => stageTarget(t)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="text-xs text-muted-foreground">
                          {t.kind === "event"
                            ? "이벤트"
                            : t.kind === "property"
                              ? "속성"
                              : "사용자 속성"}
                        </span>
                        <span className="mono-token text-xs">{t.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {staged.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {staged.map((t) => {
                  const key = `${t.kind}:${t.id}`;
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-1 rounded-full border bg-surface px-2 py-1 text-xs"
                    >
                      <span className="mono-token">{t.label}</span>
                      <button
                        type="button"
                        onClick={() => unstage(key)}
                        aria-label={`${t.label} 빼기`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <p className="text-xs text-muted-foreground">
              여러 이벤트·속성을 함께 골라서 서로 간의 관계(예: "이 값이 다른 이벤트의 값과 같아야
              한다")도 이 규칙 하나로 표현할 수 있어요.
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
