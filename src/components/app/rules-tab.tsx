import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, ShieldCheck, Trash2, Wand2 } from "lucide-react";

import { EmptyState, Panel } from "@/components/app/layout-parts";
import { SeverityBadge } from "@/components/app/badges";
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
import { db, type TaxonomyAttribute, type TaxonomyEvent, type ValidationRule } from "@/lib/queries";
import {
  PASS_CONDITIONS,
  PASS_CONDITION_LABEL,
  RULE_TYPES,
  RULE_TYPE_HINT,
  RULE_TYPE_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  RULE_CONFIG_EXAMPLE,
  errorMessage,
  type PassCondition,
  type RuleType,
  type Severity,
} from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export function RulesTab({
  projectId,
  rules,
  events,
  attributes,
  editable,
}: {
  projectId: string;
  rules: ValidationRule[];
  events: TaxonomyEvent[];
  attributes: TaxonomyAttribute[];
  editable: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [dialog, setDialog] = useState<{ rule: ValidationRule | null } | null>(null);
  const [severity, setSeverity] = useState("all");
  const [ruleType, setRuleType] = useState("all");

  const eventById = new Map(events.map((e) => [e.id, e]));
  const attrById = new Map(attributes.map((a) => [a.id, a]));

  const visible = rules.filter(
    (r) =>
      (severity === "all" || r.severity === severity) &&
      (ruleType === "all" || r.rule_type === ruleType),
  );

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
    if (rule.attribute_id) {
      const attr = attrById.get(rule.attribute_id);
      const parent = attr?.event_id ? eventById.get(attr.event_id) : null;
      return `${parent ? `${parent.technical_name}.` : ""}${attr?.technical_name ?? "—"}`;
    }
    if (rule.event_id) return eventById.get(rule.event_id)?.technical_name ?? "—";
    return "프로젝트 전체";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 심각도</SelectItem>
            {SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ruleType} onValueChange={setRuleType}>
          <SelectTrigger className="h-9 w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 규칙 유형</SelectItem>
            {RULE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {RULE_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {editable ? (
          <Button size="sm" className="ml-auto" onClick={() => setDialog({ rule: null })}>
            <Plus className="size-4" /> 규칙 추가
          </Button>
        ) : null}
      </div>

      <Panel
        title="검증 규칙"
        description="규칙은 택소노미에만 존재해요. QA 환경은 이 규칙을 그대로 가져다 쓰고, 따로 복사본을 갖지 않아요."
      >
        {visible.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="아직 검증 규칙이 없어요"
            description="여기서 한 번만 정의하면 모든 QA 환경이 이 규칙으로 검증해요."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>규칙</TableHead>
                <TableHead>대상</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>심각도</TableHead>
                <TableHead>통과 조건</TableHead>
                <TableHead className="w-32 text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <p className="font-medium">{rule.name}</p>
                    {rule.description ? (
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="mono-token text-xs">{target(rule)}</TableCell>
                  <TableCell className="text-xs">
                    {RULE_TYPE_LABEL[rule.rule_type as RuleType] ?? rule.rule_type}
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={rule.severity} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {PASS_CONDITION_LABEL[rule.pass_condition_type]}
                    {rule.pass_condition_type === "minimum_pass_rate" && rule.minimum_pass_rate != null
                      ? ` (${rule.minimum_pass_rate}%)`
                      : null}
                    {rule.pass_condition_type === "maximum_failure_count" &&
                    rule.maximum_failure_count != null
                      ? ` (${rule.maximum_failure_count})`
                      : null}
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
                                  삭제하면 모든 QA 환경에서 이 규칙으로는 더 이상 검증하지 않아요.
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
          attributes={attributes}
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
  attributes,
  onClose,
  onSaved,
}: {
  projectId: string;
  userId: string;
  rule: ValidationRule | null;
  events: TaxonomyEvent[];
  attributes: TaxonomyAttribute[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [ruleType, setRuleType] = useState<RuleType>((rule?.rule_type as RuleType) ?? "required_collection");
  const [severity, setSeverity] = useState<Severity>(rule?.severity ?? "warning");
  const [passCondition, setPassCondition] = useState<PassCondition>(
    rule?.pass_condition_type ?? "all_records",
  );
  const [minRate, setMinRate] = useState(rule?.minimum_pass_rate?.toString() ?? "95");
  const [maxFailures, setMaxFailures] = useState(rule?.maximum_failure_count?.toString() ?? "0");
  const [targetKey, setTargetKey] = useState(
    rule?.attribute_id ? `attribute:${rule.attribute_id}` : rule?.event_id ? `event:${rule.event_id}` : "none",
  );
  const [config, setConfig] = useState(JSON.stringify(rule?.rule_config ?? {}, null, 2));
  const [saving, setSaving] = useState(false);

  const eventById = new Map(events.map((e) => [e.id, e]));

  async function submit() {
    if (!name.trim()) return toast.error("규칙 이름은 필수예요");
    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = config.trim() ? JSON.parse(config) : {};
    } catch {
      return toast.error("규칙 설정은 올바른 JSON이어야 해요");
    }
    setSaving(true);
    const [kind, id] = targetKey.split(":");
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      rule_type: ruleType,
      severity,
      pass_condition_type: passCondition,
      minimum_pass_rate: passCondition === "minimum_pass_rate" ? Number(minRate) : null,
      maximum_failure_count: passCondition === "maximum_failure_count" ? Number(maxFailures) : null,
      rule_config: parsedConfig,
      event_id: kind === "event" ? id : null,
      attribute_id: kind === "attribute" ? id : null,
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
          <DialogDescription>{RULE_TYPE_HINT[ruleType]}</DialogDescription>
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
                {attributes.map((a) => (
                  <SelectItem key={a.id} value={`attribute:${a.id}`}>
                    속성 ·{" "}
                    {a.event_id ? `${eventById.get(a.event_id)?.technical_name ?? "?"}.` : ""}
                    {a.technical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>규칙 유형</Label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v as RuleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RULE_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>심각도</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>통과 조건</Label>
            <Select value={passCondition} onValueChange={(v) => setPassCondition(v as PassCondition)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PASS_CONDITIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PASS_CONDITION_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {passCondition === "minimum_pass_rate" ? (
            <div className="space-y-1.5">
              <Label htmlFor="rule-rate">최소 통과율 (%)</Label>
              <Input id="rule-rate" type="number" value={minRate} onChange={(e) => setMinRate(e.target.value)} />
            </div>
          ) : null}
          {passCondition === "maximum_failure_count" ? (
            <div className="space-y-1.5">
              <Label htmlFor="rule-max">최대 실패 건수</Label>
              <Input id="rule-max" type="number" value={maxFailures} onChange={(e) => setMaxFailures(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="rule-config">설정 (JSON)</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setConfig(JSON.stringify(RULE_CONFIG_EXAMPLE[ruleType], null, 2))}
              >
                <Wand2 className="size-3.5" /> 예시 넣기
              </Button>
            </div>
            <Textarea
              id="rule-config"
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              rows={5}
              className="mono-token text-xs"
              placeholder={JSON.stringify(RULE_CONFIG_EXAMPLE[ruleType], null, 2)}
            />
            <p className="text-xs text-muted-foreground">
              이 JSON은 나중에 AI가 로그를 해석할 때 그대로 읽는 소스예요. 필드 이름과 값을 사람이 봐도
              이해할 수 있게 적어주세요.
            </p>
            <pre className="mono-token max-h-32 overflow-auto rounded-md border bg-surface p-2 text-[11px] text-muted-foreground">
{`// ${RULE_TYPE_LABEL[ruleType]} 예시
${JSON.stringify(RULE_CONFIG_EXAMPLE[ruleType], null, 2)}`}
            </pre>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-desc">설명</Label>
            <Textarea id="rule-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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
