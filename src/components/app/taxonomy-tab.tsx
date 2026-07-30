import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Users } from "lucide-react";

import { EmptyState, Panel } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { TaxonomyImport } from "@/components/app/taxonomy-import";
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
import {
  db,
  type TaxonomyCustomAttribute,
  type TaxonomyEvent,
  type TaxonomyEventProperty,
} from "@/lib/queries";
import { DATA_TYPES, errorMessage } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

type AnyAttribute = TaxonomyEventProperty | TaxonomyCustomAttribute;

export function TaxonomyTab({
  projectId,
  events,
  eventProperties,
  customAttributes,
  editable,
}: {
  projectId: string;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  customAttributes: TaxonomyCustomAttribute[];
  editable: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [eventDialog, setEventDialog] = useState<{ event: TaxonomyEvent | null } | null>(null);
  const [attrDialog, setAttrDialog] = useState<{
    attribute: AnyAttribute | null;
    eventId: string | null;
  } | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["events", projectId] });
    qc.invalidateQueries({ queryKey: ["taxonomy-event-properties", projectId] });
    qc.invalidateQueries({ queryKey: ["taxonomy-custom-attributes", projectId] });
  };

  const term = search.trim().toLowerCase();
  const attrsByEvent = useMemo(() => {
    const map = new Map<string, TaxonomyEventProperty[]>();
    for (const p of eventProperties) {
      const list = map.get(p.event_id) ?? [];
      list.push(p);
      map.set(p.event_id, list);
    }
    return map;
  }, [eventProperties]);

  const visibleEvents = events.filter((e) => {
    if (!term) return true;
    const children = attrsByEvent.get(e.id) ?? [];
    return (
      e.technical_name.toLowerCase().includes(term) ||
      (e.display_name ?? "").toLowerCase().includes(term) ||
      children.some((c) => c.technical_name.toLowerCase().includes(term))
    );
  });

  async function removeEvent(event: TaxonomyEvent) {
    const { error } = await db.from("taxonomy_events").delete().eq("id", event.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("택소노미에서 이벤트를 삭제했어요");
    refresh();
  }

  async function removeEventProperty(property: TaxonomyEventProperty) {
    const { error } = await db.from("taxonomy_event_properties").delete().eq("id", property.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("택소노미에서 속성을 삭제했어요");
    refresh();
  }

  async function removeCustomAttribute(attribute: TaxonomyCustomAttribute) {
    const { error } = await db.from("taxonomy_custom_attributes").delete().eq("id", attribute.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("택소노미에서 속성을 삭제했어요");
    refresh();
  }

  async function toggleActive(
    table: "taxonomy_events" | "taxonomy_event_properties" | "taxonomy_custom_attributes",
    id: string,
    value: boolean,
  ) {
    const { error } = await db.from(table).update({ is_active: value }).eq("id", id);
    if (error) return toast.error(errorMessage(error));
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="이벤트·속성 검색…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          {editable ? (
            <>
              <TaxonomyImport
                projectId={projectId}
                events={events}
                eventProperties={eventProperties}
                customAttributes={customAttributes}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAttrDialog({ attribute: null, eventId: null })}
              >
                <Users className="size-4" /> 사용자 속성 추가
              </Button>
              <Button size="sm" onClick={() => setEventDialog({ event: null })}>
                <Plus className="size-4" /> 이벤트 추가
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {editable ? (
        <p className="rounded-md border border-dashed bg-surface px-3 py-2 text-xs text-muted-foreground">
          하나씩 클릭해서 만들지 않아도 돼요. 예시 데이터셋(CSV·JSON·YAML)을 받아 내용을 채운 뒤
          그대로 올리면 이벤트와 속성이 한 번에 등록돼요. 이미 있는 이름은 건너뛰어요.
        </p>
      ) : null}

      <Panel title="이벤트" description="모든 QA 환경이 이 정의를 기준으로 측정돼요.">
        {visibleEvents.length === 0 ? (
          <EmptyState
            title="아직 이벤트가 없어요"
            description="이 고객이 구현해야 할 이벤트를 등록해 주세요. 속성은 이벤트 아래에 붙어요."
          />
        ) : (
          <ul className="divide-y">
            {visibleEvents.map((event) => {
              const children = attrsByEvent.get(event.id) ?? [];
              const expanded = open[event.id] ?? true;
              return (
                <li key={event.id}>
                  <div className="flex items-start gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOpen((s) => ({ ...s, [event.id]: !expanded }))}
                      className="mt-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={expanded ? "접기" : "펼치기"}
                    >
                      {expanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono-token text-sm font-semibold">
                          {event.technical_name}
                        </span>
                        {event.display_name ? (
                          <span className="text-sm text-muted-foreground">
                            {event.display_name}
                          </span>
                        ) : null}
                        <Pill>속성 {children.length}개</Pill>
                        {!event.is_active ? <Pill>비활성</Pill> : null}
                      </div>
                      {event.trigger_description ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.trigger_description}
                        </p>
                      ) : null}
                    </div>
                    {editable ? (
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={event.is_active}
                          onCheckedChange={(v) => toggleActive("taxonomy_events", event.id, v)}
                          aria-label="커버리지 포함 여부"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setAttrDialog({ attribute: null, eventId: event.id })}
                          aria-label="속성 추가"
                        >
                          <Plus className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEventDialog({ event })}
                          aria-label="이벤트 수정"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteButton
                          onConfirm={() => removeEvent(event)}
                          label={event.technical_name}
                        />
                      </div>
                    ) : null}
                  </div>
                  {expanded && children.length > 0 ? (
                    <ul className="border-t bg-surface-strong/40">
                      {children.map((attr) => (
                        <AttributeRow
                          key={attr.id}
                          attribute={attr}
                          editable={editable}
                          onEdit={() => setAttrDialog({ attribute: attr, eventId: attr.event_id })}
                          onDelete={() => removeEventProperty(attr)}
                          onToggle={(v) => toggleActive("taxonomy_event_properties", attr.id, v)}
                        />
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="사용자 속성" description="특정 이벤트에 묶이지 않는 속성이에요.">
        {customAttributes.length === 0 ? (
          <EmptyState
            title="사용자 속성이 없어요"
            description="프로필 수준의 속성을 여기에 추가해요."
          />
        ) : (
          <ul className="divide-y">
            {customAttributes.map((attr) => (
              <AttributeRow
                key={attr.id}
                attribute={attr}
                editable={editable}
                onEdit={() => setAttrDialog({ attribute: attr, eventId: null })}
                onDelete={() => removeCustomAttribute(attr)}
                onToggle={(v) => toggleActive("taxonomy_custom_attributes", attr.id, v)}
              />
            ))}
          </ul>
        )}
      </Panel>

      {eventDialog ? (
        <EventDialog
          projectId={projectId}
          userId={user?.id ?? ""}
          event={eventDialog.event}
          onClose={() => setEventDialog(null)}
          onSaved={refresh}
        />
      ) : null}

      {attrDialog ? (
        <AttributeDialog
          projectId={projectId}
          userId={user?.id ?? ""}
          events={events}
          attribute={attrDialog.attribute}
          eventId={attrDialog.eventId}
          onClose={() => setAttrDialog(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function AttributeRow({
  attribute,
  editable,
  onEdit,
  onDelete,
  onToggle,
}: {
  attribute: AnyAttribute;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (value: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-2 px-4 py-2 pl-10">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono-token text-sm">{attribute.technical_name}</span>
          <Pill>{attribute.data_type}</Pill>
          {attribute.is_required ? <Pill>필수</Pill> : null}
          {!attribute.is_active ? <Pill>비활성</Pill> : null}
        </div>
        {attribute.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{attribute.description}</p>
        ) : null}
      </div>
      {editable ? (
        <div className="flex items-center gap-1">
          <Switch
            checked={attribute.is_active}
            onCheckedChange={onToggle}
            aria-label="커버리지 포함 여부"
          />
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label="속성 수정">
            <Pencil className="size-4" />
          </Button>
          <DeleteButton onConfirm={onDelete} label={attribute.technical_name} />
        </div>
      ) : null}
    </li>
  );
}

function DeleteButton({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`${label} 삭제`}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>“{label}”을(를) 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            택소노미에서 사라지기 때문에 전체 커버리지와 모든 QA 환경 수치가 바로 다시 계산돼요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>삭제</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EventDialog({
  projectId,
  userId,
  event,
  onClose,
  onSaved,
}: {
  projectId: string;
  userId: string;
  event: TaxonomyEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [technicalName, setTechnicalName] = useState(event?.technical_name ?? "");
  const [displayName, setDisplayName] = useState(event?.display_name ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [trigger, setTrigger] = useState(event?.trigger_description ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!technicalName.trim()) return toast.error("기술 이름은 필수예요");
    setSaving(true);
    const payload = {
      technical_name: technicalName.trim(),
      display_name: displayName.trim() || null,
      description: description.trim() || null,
      trigger_description: trigger.trim() || null,
    };
    const { error } = event
      ? await db.from("taxonomy_events").update(payload).eq("id", event.id)
      : await db
          .from("taxonomy_events")
          .insert({ ...payload, project_id: projectId, created_by: userId });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
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
            <Label htmlFor="ev-trigger">발생 시점</Label>
            <Textarea
              id="ev-trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              rows={2}
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

function AttributeDialog({
  projectId,
  userId,
  events,
  attribute,
  eventId,
  onClose,
  onSaved,
}: {
  projectId: string;
  userId: string;
  events: TaxonomyEvent[];
  attribute: AnyAttribute | null;
  eventId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [parent, setParent] = useState(
    attribute && "event_id" in attribute ? attribute.event_id : (eventId ?? "none"),
  );
  const [technicalName, setTechnicalName] = useState(attribute?.technical_name ?? "");
  const [displayName, setDisplayName] = useState(attribute?.display_name ?? "");
  const [description, setDescription] = useState(attribute?.description ?? "");
  const [dataType, setDataType] = useState(attribute?.data_type ?? "string");
  const [required, setRequired] = useState(attribute?.is_required ?? false);
  const [allowed, setAllowed] = useState(
    Array.isArray(attribute?.allowed_values)
      ? (attribute!.allowed_values as string[]).join(", ")
      : "",
  );
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!technicalName.trim()) return toast.error("기술 이름은 필수예요");
    setSaving(true);
    const allowedValues = allowed
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const isProperty = parent !== "none";
    const basePayload = {
      technical_name: technicalName.trim(),
      display_name: displayName.trim() || null,
      description: description.trim() || null,
      data_type: dataType,
      is_required: required,
      allowed_values: allowedValues.length ? allowedValues : null,
    };
    const table = isProperty ? "taxonomy_event_properties" : "taxonomy_custom_attributes";
    const payload = isProperty
      ? { ...basePayload, event_id: parent }
      : { ...basePayload, project_id: projectId };
    const { error } = attribute
      ? await db.from(table).update(payload).eq("id", attribute.id)
      : await db.from(table).insert({ ...payload, created_by: userId });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(attribute ? "속성을 수정했어요" : "택소노미에 속성을 추가했어요");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{attribute ? "속성 수정" : "속성 추가"}</DialogTitle>
          <DialogDescription>속성도 이 프로젝트의 전체 커버리지에 포함돼요.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>소속</Label>
            <Select value={parent} onValueChange={setParent} disabled={!!attribute}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">사용자 속성 (이벤트 없음)</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.technical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {attribute ? (
              <p className="text-xs text-muted-foreground">
                기존 속성의 소속은 바꿀 수 없어요. 다른 곳으로 옮기려면 삭제 후 다시 추가해 주세요.
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="at-name">기술 이름</Label>
              <Input
                id="at-name"
                value={technicalName}
                onChange={(e) => setTechnicalName(e.target.value)}
                placeholder="order_no"
              />
            </div>
            <div className="space-y-1.5">
              <Label>데이터 타입</Label>
              <Select value={dataType} onValueChange={setDataType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="at-display">표시 이름</Label>
            <Input
              id="at-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="at-allowed">허용 값 (쉼표로 구분)</Label>
            <Input
              id="at-allowed"
              value={allowed}
              onChange={(e) => setAllowed(e.target.value)}
              placeholder="card, bank_transfer"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="at-desc">설명</Label>
            <Textarea
              id="at-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">필수</p>
              <p className="text-xs text-muted-foreground">항상 수집돼야 하는 속성이에요.</p>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving}>
            {attribute ? "변경 저장" : "속성 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
