import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";

import { EmptyState } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { TaxonomyImport } from "@/components/app/taxonomy-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/alert-dialog";
import {
  db,
  type TaxonomyCustomAttribute,
  type TaxonomyCustomAttributeProperty,
  type TaxonomyEvent,
  type TaxonomyEventProperty,
} from "@/lib/queries";
import { DATA_TYPES, errorMessage } from "@/lib/domain";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { parseAllowedValues } from "@/lib/taxonomy-import";
import { useQaChannelExclusions, useQaChannels, type QaChannel } from "@/lib/qa-rounds-queries";

type AnyAttribute =
  TaxonomyEventProperty | TaxonomyCustomAttribute | TaxonomyCustomAttributeProperty;

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name" | "updatedRecent";

const PAGE_SIZE = 20;

function matchesStatus(isActive: boolean, filter: StatusFilter) {
  if (filter === "active") return isActive;
  if (filter === "inactive") return !isActive;
  return true;
}

function sortByKey<T extends { technical_name: string; updated_at: string }>(
  items: T[],
  key: SortKey,
): T[] {
  if (key === "updatedRecent") {
    return [...items].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }
  return [...items].sort((a, b) => a.technical_name.localeCompare(b.technical_name));
}

export function TaxonomyTab({
  projectId,
  events,
  eventProperties,
  customAttributes,
  customAttributeProperties,
  editable,
  openPropertyId,
  openAttributeId,
}: {
  projectId: string;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  customAttributes: TaxonomyCustomAttribute[];
  customAttributeProperties: TaxonomyCustomAttributeProperty[];
  editable: boolean;
  // Deep-link from elsewhere (e.g. a passing spec-diff row) straight into this
  // property's edit dialog — there's no auto-fixable action for a row that's
  // already structurally passing, so this just gets the reviewer to where they
  // can make whatever change (allowed values, description, etc.) by hand.
  openPropertyId?: string;
  openAttributeId?: string;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: channels = [] } = useQaChannels(projectId);
  const { data: channelExclusions } = useQaChannelExclusions(
    events.map((event) => event.id),
    eventProperties.map((property) => property.id),
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activeTab, setActiveTab] = useState<"events" | "attributes">("events");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openAttr, setOpenAttr] = useState<Record<string, boolean>>({});
  const [eventDialog, setEventDialog] = useState<{ event: TaxonomyEvent | null } | null>(null);
  const [attrDialog, setAttrDialog] = useState<{
    attribute: AnyAttribute | null;
    eventId: string | null;
  } | null>(null);
  const [subPropDialog, setSubPropDialog] = useState<{
    property: TaxonomyCustomAttributeProperty | null;
    customAttributeId: string;
  } | null>(null);

  const openedFromLinkRef = useRef(false);
  useEffect(() => {
    if (!openPropertyId || openedFromLinkRef.current) return;
    const prop = eventProperties.find((p) => p.id === openPropertyId);
    if (!prop) return; // not loaded yet — retry once eventProperties arrives
    openedFromLinkRef.current = true;
    setOpen((s) => ({ ...s, [prop.event_id]: true }));
    setAttrDialog({ attribute: prop, eventId: prop.event_id });
  }, [openPropertyId, eventProperties]);

  useEffect(() => {
    if (!openAttributeId || openedFromLinkRef.current) return;
    const attribute = customAttributes.find((candidate) => candidate.id === openAttributeId);
    if (!attribute) return;
    openedFromLinkRef.current = true;
    setActiveTab("attributes");
    setAttrDialog({ attribute, eventId: null });
  }, [openAttributeId, customAttributes]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["events", projectId] });
    qc.invalidateQueries({ queryKey: ["taxonomy-event-properties", projectId] });
    qc.invalidateQueries({ queryKey: ["taxonomy-custom-attributes", projectId] });
    qc.invalidateQueries({ queryKey: ["taxonomy-custom-attribute-properties", projectId] });
    qc.invalidateQueries({ queryKey: ["qa-channel-exclusions"] });
  };

  const subPropsByAttribute = useMemo(() => {
    const map = new Map<string, TaxonomyCustomAttributeProperty[]>();
    for (const p of customAttributeProperties) {
      const list = map.get(p.custom_attribute_id) ?? [];
      list.push(p);
      map.set(p.custom_attribute_id, list);
    }
    return map;
  }, [customAttributeProperties]);

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

  const filteredEvents = events.filter((e) => {
    if (!matchesStatus(e.is_active, statusFilter)) return false;
    if (!term) return true;
    const children = attrsByEvent.get(e.id) ?? [];
    return (
      e.technical_name.toLowerCase().includes(term) ||
      (e.display_name ?? "").toLowerCase().includes(term) ||
      children.some((c) => c.technical_name.toLowerCase().includes(term))
    );
  });
  const visibleEvents = sortByKey(filteredEvents, sortKey);
  const pagedEvents = visibleEvents.slice(0, visibleCount);

  function propertyMatches(p: TaxonomyEventProperty) {
    return (
      p.technical_name.toLowerCase().includes(term) ||
      (p.display_name ?? "").toLowerCase().includes(term)
    );
  }

  function childrenFor(eventId: string) {
    const children = attrsByEvent.get(eventId) ?? [];
    if (!term) return children;
    const matches = children.filter(propertyMatches);
    return matches.length > 0 ? matches : children;
  }

  const filteredCustomAttributes = customAttributes.filter((a) => {
    if (!matchesStatus(a.is_active, statusFilter)) return false;
    if (!term) return true;
    return (
      a.technical_name.toLowerCase().includes(term) ||
      (a.display_name ?? "").toLowerCase().includes(term)
    );
  });
  const visibleCustomAttributes = sortByKey(filteredCustomAttributes, sortKey);
  const pagedCustomAttributes = visibleCustomAttributes.slice(0, visibleCount);

  // 검색 결과가 한쪽 탭에만 있으면 그쪽으로 자동으로 옮겨줘요.
  useEffect(() => {
    if (!term) return;
    if (visibleEvents.length === 0 && visibleCustomAttributes.length > 0) {
      setActiveTab("attributes");
    } else if (visibleCustomAttributes.length === 0 && visibleEvents.length > 0) {
      setActiveTab("events");
    }
  }, [term, visibleEvents.length, visibleCustomAttributes.length]);

  // 검색어/필터/정렬/탭이 바뀌면 더 보기로 늘려둔 개수를 다시 첫 페이지로 되돌려요.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [term, statusFilter, sortKey, activeTab]);

  async function removeEvent(event: TaxonomyEvent) {
    const { error } = await db.from("taxonomy_events").delete().eq("id", event.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("택소노미에서 이벤트를 삭제했어요");
    refresh();
  }

  async function removeEventProperty(property: TaxonomyEventProperty) {
    const { error } = await db.from("taxonomy_event_properties").delete().eq("id", property.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("택소노미에서 프로퍼티를 삭제했어요");
    refresh();
  }

  async function removeCustomAttribute(attribute: TaxonomyCustomAttribute) {
    const { error } = await db.from("taxonomy_custom_attributes").delete().eq("id", attribute.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("택소노미에서 어트리뷰트를 삭제했어요");
    refresh();
  }

  async function removeCustomAttributeProperty(property: TaxonomyCustomAttributeProperty) {
    const { error } = await db
      .from("taxonomy_custom_attribute_properties")
      .delete()
      .eq("id", property.id);
    if (error) return toast.error(errorMessage(error));
    toast.success("택소노미에서 필드를 삭제했어요");
    refresh();
  }

  async function toggleActive(
    table:
      | "taxonomy_events"
      | "taxonomy_event_properties"
      | "taxonomy_custom_attributes"
      | "taxonomy_custom_attribute_properties",
    id: string,
    value: boolean,
  ) {
    const { error } = await db.from(table).update({ is_active: value }).eq("id", id);
    if (error) return toast.error(errorMessage(error));
    refresh();
  }

  return (
    <div className="space-y-4">
      {editable ? (
        <div className="flex justify-end gap-2">
          <TaxonomyImport
            projectId={projectId}
            events={events}
            eventProperties={eventProperties}
            customAttributes={customAttributes}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> 추가 <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => setEventDialog({ event: null })}>
                이벤트 추가
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAttrDialog({ attribute: null, eventId: null })}>
                어트리뷰트 추가
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveTab("events")}
              className={cn(
                "pb-2.5 text-sm font-medium transition-colors",
                activeTab === "events"
                  ? "text-foreground shadow-[inset_0_-2px_0_var(--color-foreground)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              이벤트 {events.length}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("attributes")}
              className={cn(
                "pb-2.5 text-sm font-medium transition-colors",
                activeTab === "attributes"
                  ? "text-foreground shadow-[inset_0_-2px_0_var(--color-foreground)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              어트리뷰트 {customAttributes.length}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label="상태 필터"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">전체 상태</option>
              <option value="active">포함</option>
              <option value="inactive">미포함</option>
            </NativeSelect>
            <NativeSelect
              aria-label="정렬"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="name">이름순</option>
              <option value="updatedRecent">최근 수정순</option>
            </NativeSelect>
            <Input
              placeholder="이벤트·프로퍼티·어트리뷰트 검색…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-[34px] w-[260px]"
            />
          </div>
        </div>

        {activeTab === "events" ? (
          visibleEvents.length === 0 ? (
            <EmptyState
              title={events.length === 0 ? "아직 이벤트가 없어요" : "조건에 맞는 이벤트가 없어요"}
              description="이 고객이 구현해야 할 이벤트를 등록해 주세요. 프로퍼티는 이벤트 아래에 붙어요."
            />
          ) : (
            <ul className="divide-y">
              {pagedEvents.map((event) => {
                const children = childrenFor(event.id);
                const expanded = open[event.id] ?? true;
                return (
                  <li key={event.id} className="group">
                    <div className="flex items-start gap-2 px-5 py-3 hover:bg-surface">
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
                          <Pill>프로퍼티 {children.length}개</Pill>
                          {!event.is_active ? <Pill>비활성</Pill> : null}
                        </div>
                        {event.description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {event.description}
                          </p>
                        ) : null}
                      </div>
                      {editable ? (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <Switch
                              checked={event.is_active}
                              onCheckedChange={(v) => toggleActive("taxonomy_events", event.id, v)}
                              aria-label="커버리지 포함 여부"
                            />
                            <span className="w-11 text-[11px] text-muted-foreground">
                              {event.is_active ? "측정 중" : "미측정"}
                            </span>
                          </div>
                          <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <RowActions
                              label={event.technical_name}
                              editLabel="이벤트 수정"
                              onEdit={() => setEventDialog({ event })}
                              onDelete={() => removeEvent(event)}
                              extra={{
                                label: "프로퍼티 추가",
                                onClick: () =>
                                  setAttrDialog({ attribute: null, eventId: event.id }),
                              }}
                            />
                          </div>
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
                            onEdit={() =>
                              setAttrDialog({ attribute: attr, eventId: attr.event_id })
                            }
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
          )
        ) : visibleCustomAttributes.length === 0 ? (
          <EmptyState
            title={
              customAttributes.length === 0 ? "어트리뷰트가 없어요" : "조건에 맞는 항목이 없어요"
            }
            description="프로필 수준의 어트리뷰트를 여기에 추가해요."
          />
        ) : (
          <ul className="divide-y">
            {pagedCustomAttributes.map((attr) =>
              attr.data_type === "array of object" ? (
                <ExpandableCustomAttributeRow
                  key={attr.id}
                  attribute={attr}
                  editable={editable}
                  expanded={openAttr[attr.id] ?? true}
                  onToggleExpand={() =>
                    setOpenAttr((s) => ({ ...s, [attr.id]: !(s[attr.id] ?? true) }))
                  }
                  subProperties={subPropsByAttribute.get(attr.id) ?? []}
                  onEdit={() => setAttrDialog({ attribute: attr, eventId: null })}
                  onDelete={() => removeCustomAttribute(attr)}
                  onToggle={(v) => toggleActive("taxonomy_custom_attributes", attr.id, v)}
                  onAddProperty={() =>
                    setSubPropDialog({ property: null, customAttributeId: attr.id })
                  }
                  onEditProperty={(p) =>
                    setSubPropDialog({ property: p, customAttributeId: attr.id })
                  }
                  onDeleteProperty={removeCustomAttributeProperty}
                  onTogglePropertyActive={(p, v) =>
                    toggleActive("taxonomy_custom_attribute_properties", p.id, v)
                  }
                />
              ) : (
                <AttributeRow
                  key={attr.id}
                  attribute={attr}
                  editable={editable}
                  noun="어트리뷰트"
                  onEdit={() => setAttrDialog({ attribute: attr, eventId: null })}
                  onDelete={() => removeCustomAttribute(attr)}
                  onToggle={(v) => toggleActive("taxonomy_custom_attributes", attr.id, v)}
                />
              ),
            )}
          </ul>
        )}

        {(() => {
          const total =
            activeTab === "events" ? visibleEvents.length : visibleCustomAttributes.length;
          const shown = activeTab === "events" ? pagedEvents.length : pagedCustomAttributes.length;
          const noun = activeTab === "events" ? "이벤트" : "어트리뷰트";
          if (total === 0) return null;
          return (
            <div className="flex items-center justify-between border-t px-5 py-3">
              <p className="text-xs text-muted-foreground">
                {noun} {total}개 중 {shown}개 표시 중이에요
              </p>
              {shown < total ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  더 보기
                </Button>
              ) : null}
            </div>
          );
        })()}
      </div>

      {eventDialog ? (
        <EventDialog
          projectId={projectId}
          userId={user?.id ?? ""}
          event={eventDialog.event}
          channels={channels}
          excludedKeys={channelExclusions?.events ?? new Set()}
          onClose={() => setEventDialog(null)}
          onSaved={refresh}
        />
      ) : null}

      {attrDialog ? (
        <TaxonomyAttributeDialog
          projectId={projectId}
          userId={user?.id ?? ""}
          events={events}
          eventProperties={eventProperties}
          attribute={attrDialog.attribute}
          eventId={attrDialog.eventId}
          channels={channels}
          excludedKeys={channelExclusions?.properties ?? new Set()}
          onClose={() => setAttrDialog(null)}
          onSaved={refresh}
        />
      ) : null}

      {subPropDialog ? (
        <CustomAttributePropertyDialog
          userId={user?.id ?? ""}
          customAttributeId={subPropDialog.customAttributeId}
          property={subPropDialog.property}
          onClose={() => setSubPropDialog(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function ExpandableCustomAttributeRow({
  attribute,
  editable,
  expanded,
  onToggleExpand,
  subProperties,
  onEdit,
  onDelete,
  onToggle,
  onAddProperty,
  onEditProperty,
  onDeleteProperty,
  onTogglePropertyActive,
}: {
  attribute: TaxonomyCustomAttribute;
  editable: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  subProperties: TaxonomyCustomAttributeProperty[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (value: boolean) => void;
  onAddProperty: () => void;
  onEditProperty: (property: TaxonomyCustomAttributeProperty) => void;
  onDeleteProperty: (property: TaxonomyCustomAttributeProperty) => void;
  onTogglePropertyActive: (property: TaxonomyCustomAttributeProperty, value: boolean) => void;
}) {
  return (
    <li className="group">
      <div className="flex items-start gap-2 px-5 py-3 hover:bg-surface">
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-0.5 text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "접기" : "펼치기"}
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono-token text-sm">{attribute.technical_name}</span>
            <Pill>{attribute.data_type}</Pill>
            <Pill>필드 {subProperties.length}개</Pill>
            {!attribute.is_active ? <Pill>비활성</Pill> : null}
          </div>
          {attribute.display_name ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{attribute.display_name}</p>
          ) : null}
        </div>
        {editable ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={attribute.is_active}
                onCheckedChange={onToggle}
                aria-label="커버리지 포함 여부"
              />
              <span className="w-11 text-[11px] text-muted-foreground">
                {attribute.is_active ? "측정 중" : "미측정"}
              </span>
            </div>
            <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <RowActions
                label={attribute.technical_name}
                editLabel="어트리뷰트 수정"
                onEdit={onEdit}
                onDelete={onDelete}
                extra={{ label: "필드 추가", onClick: onAddProperty }}
              />
            </div>
          </div>
        ) : null}
      </div>
      {expanded && subProperties.length > 0 ? (
        <ul className="border-t bg-surface-strong/40 pl-6">
          {subProperties.map((p) => (
            <AttributeRow
              key={p.id}
              attribute={p}
              editable={editable}
              noun="필드"
              onEdit={() => onEditProperty(p)}
              onDelete={() => onDeleteProperty(p)}
              onToggle={(v) => onTogglePropertyActive(p, v)}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function AttributeRow({
  attribute,
  editable,
  onEdit,
  onDelete,
  onToggle,
  noun = "프로퍼티",
}: {
  attribute: AnyAttribute;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (value: boolean) => void;
  noun?: string;
}) {
  return (
    <li className="group flex items-center gap-2 px-5 py-2 pl-11 hover:bg-surface">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono-token text-sm">{attribute.technical_name}</span>
          <Pill>{attribute.data_type}</Pill>
          {attribute.is_required ? <Pill>필수</Pill> : null}
          {!attribute.is_active ? <Pill>비활성</Pill> : null}
        </div>
        {attribute.display_name ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{attribute.display_name}</p>
        ) : null}
      </div>
      {editable ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Switch
              checked={attribute.is_active}
              onCheckedChange={onToggle}
              aria-label="커버리지 포함 여부"
            />
            <span className="w-11 text-[11px] text-muted-foreground">
              {attribute.is_active ? "측정 중" : "미측정"}
            </span>
          </div>
          <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <RowActions
              label={attribute.technical_name}
              editLabel={`${noun} 수정`}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}

function RowActions({
  label,
  editLabel,
  onEdit,
  onDelete,
  extra,
}: {
  label: string;
  editLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  extra?: { label: string; onClick: () => void };
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="size-7" aria-label={`${label} 작업 메뉴`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {extra ? (
            <DropdownMenuItem onSelect={extra.onClick}>{extra.label}</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onEdit}>{editLabel}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>“{label}”을(를) 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              택소노미에서 사라지기 때문에 전체 커버리지와 모든 QA 환경 수치가 바로 다시 계산돼요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EventDialog({
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

export function TaxonomyAttributeDialog({
  projectId,
  userId,
  events,
  eventProperties,
  attribute,
  eventId,
  channels,
  excludedKeys,
  onClose,
  onSaved,
}: {
  projectId: string;
  userId: string;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  attribute: AnyAttribute | null;
  eventId: string | null;
  channels: QaChannel[];
  excludedKeys: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [parent, setParent] = useState(
    attribute && "event_id" in attribute ? attribute.event_id : (eventId ?? "none"),
  );
  const isProperty = parent !== "none";

  const siblings = useMemo(() => {
    if (!attribute || !isProperty) return [];
    return eventProperties.filter(
      (p) => p.technical_name === attribute.technical_name && p.id !== attribute.id,
    );
  }, [attribute, isProperty, eventProperties]);

  const eventNameById = useMemo(
    () => new Map(events.map((e) => [e.id, e.technical_name])),
    [events],
  );

  const [checkedSiblings, setCheckedSiblings] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(siblings.map((s) => [s.id, true])),
  );

  function toggleAllSiblings(value: boolean) {
    setCheckedSiblings(Object.fromEntries(siblings.map((s) => [s.id, value])));
  }

  const [technicalName, setTechnicalName] = useState(attribute?.technical_name ?? "");
  const [displayName, setDisplayName] = useState(attribute?.display_name ?? "");
  const [description, setDescription] = useState(attribute?.description ?? "");
  const [exampleValue, setExampleValue] = useState(
    attribute?.example_value == null ? "" : String(attribute.example_value),
  );
  const [dataType, setDataType] = useState(attribute?.data_type ?? "string");
  const [required, setRequired] = useState(attribute?.is_required ?? eventId !== null);
  const [allowed, setAllowed] = useState(
    Array.isArray(attribute?.allowed_values)
      ? (attribute!.allowed_values as string[]).join(", ")
      : "",
  );
  const [saving, setSaving] = useState(false);
  const isExistingEventProperty = Boolean(attribute && "event_id" in attribute);
  const [selectedChannelIds, setSelectedChannelIds] = useState(
    () =>
      new Set(
        channels
          .filter((channel) => !attribute || !excludedKeys.has(`${attribute.id}:${channel.id}`))
          .map((channel) => channel.id),
      ),
  );

  async function savePropertyExclusions(propertyIds: string[]) {
    const { error: deleteError } = await db
      .from("taxonomy_property_channel_exclusions")
      .delete()
      .in("property_id", propertyIds);
    if (deleteError) return deleteError;
    const excludedRows = propertyIds.flatMap((propertyId) =>
      channels
        .filter((channel) => !selectedChannelIds.has(channel.id))
        .map((channel) => ({ property_id: propertyId, channel_id: channel.id })),
    );
    if (excludedRows.length === 0) return null;
    const { error } = await db.from("taxonomy_property_channel_exclusions").insert(excludedRows);
    return error;
  }

  async function submit() {
    if (!technicalName.trim()) return toast.error("기술 이름은 필수예요");
    setSaving(true);
    const allowedValues = parseAllowedValues(allowed);
    const basePayload = {
      technical_name: technicalName.trim(),
      display_name: displayName.trim() || null,
      description: description.trim() || null,
      example_value: exampleValue.trim() || null,
      data_type: dataType,
      is_required: required,
      allowed_values: allowedValues.length ? allowedValues : null,
    };
    const table = isProperty ? "taxonomy_event_properties" : "taxonomy_custom_attributes";

    if (attribute && isProperty) {
      const checkedSiblingIds = siblings
        .filter((s) => checkedSiblings[s.id] ?? true)
        .map((s) => s.id);
      const targetIds = [attribute.id, ...checkedSiblingIds];
      const { data, error } = await db
        .from(table)
        .update(basePayload)
        .in("id", targetIds)
        .select("id");
      setSaving(false);
      if (error) return toast.error(errorMessage(error));
      const exclusionError = await savePropertyExclusions(targetIds);
      if (exclusionError) return toast.error(errorMessage(exclusionError));
      const appliedCount = data?.length ?? 0;
      if (appliedCount < targetIds.length) {
        toast.info(
          `이벤트 ${appliedCount}/${targetIds.length}개에만 적용됐어요. 권한이 없는 이벤트는 제외됐어요.`,
        );
      } else {
        toast.success(
          checkedSiblingIds.length > 0
            ? `프로퍼티를 수정했어요 (이벤트 ${appliedCount}개에 적용)`
            : "프로퍼티를 수정했어요",
        );
      }
      onSaved();
      onClose();
      return;
    }

    const payload = isProperty
      ? { ...basePayload, event_id: parent }
      : { ...basePayload, project_id: projectId };
    const { error } = attribute
      ? await db.from(table).update(payload).eq("id", attribute.id)
      : await db.from(table).insert({ ...payload, created_by: userId });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    if (attribute && isProperty) {
      const exclusionError = await savePropertyExclusions([attribute.id]);
      if (exclusionError) return toast.error(errorMessage(exclusionError));
    }
    toast.success(
      attribute
        ? `${isProperty ? "프로퍼티" : "어트리뷰트"}를 수정했어요`
        : `택소노미에 ${isProperty ? "프로퍼티" : "어트리뷰트"}를 추가했어요`,
    );
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isProperty
              ? attribute
                ? "프로퍼티 수정"
                : "프로퍼티 추가"
              : attribute
                ? "어트리뷰트 수정"
                : "어트리뷰트 추가"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>포함 이벤트</Label>
            <Select value={parent} onValueChange={setParent} disabled={!!attribute}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">어트리뷰트 (이벤트 없음)</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.technical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {attribute ? (
              <p className="text-xs text-muted-foreground">
                이 프로퍼티가 어느 이벤트에 포함되는지는 여기서 바꿀 수 없어요. 다른 이벤트로
                옮기려면 삭제한 뒤 원하는 이벤트에 다시 추가해 주세요.
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
              <Label htmlFor="at-display">표시 이름</Label>
              <Input
                id="at-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
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
          {isExistingEventProperty && channels.length > 0 ? (
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
            <Label htmlFor="at-allowed">허용 값 (쉼표로 구분)</Label>
            <Input id="at-allowed" value={allowed} onChange={(e) => setAllowed(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              여기 적은 값 외의 것이 들어오면 검증 시 오류로 처리돼요. 비워두면 값 자체는 제한하지
              않아요.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="at-example">예시값</Label>
            <Textarea
              id="at-example"
              value={exampleValue}
              onChange={(e) => setExampleValue(e.target.value)}
              placeholder="2026-01-01T00:00:00.000+09:00"
              rows={2}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              기대하는 값의 형식과 의미를 보여주세요. AI가 실제 수신값과 비교해요.
            </p>
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
              <p className="text-xs text-muted-foreground">
                항상 수집돼야 하는 {isProperty ? "프로퍼티" : "어트리뷰트"}예요.
              </p>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>
          {siblings.length > 0 ? (
            <div className="space-y-2 rounded-md border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">다른 이벤트에도 적용 ({siblings.length}개)</p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAllSiblings(true)}
                  >
                    전체 선택
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleAllSiblings(false)}
                  >
                    전체 해제
                  </Button>
                </div>
              </div>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {siblings.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`sibling-${s.id}`}
                      checked={checkedSiblings[s.id] ?? true}
                      onCheckedChange={(v) =>
                        setCheckedSiblings((prev) => ({ ...prev, [s.id]: v === true }))
                      }
                    />
                    <Label htmlFor={`sibling-${s.id}`} className="mono-token text-sm font-normal">
                      {eventNameById.get(s.event_id) ?? "—"}
                    </Label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving}>
            {attribute ? "변경 저장" : isProperty ? "프로퍼티 추가" : "어트리뷰트 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomAttributePropertyDialog({
  userId,
  customAttributeId,
  property,
  onClose,
  onSaved,
}: {
  userId: string;
  customAttributeId: string;
  property: TaxonomyCustomAttributeProperty | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [technicalName, setTechnicalName] = useState(property?.technical_name ?? "");
  const [displayName, setDisplayName] = useState(property?.display_name ?? "");
  const [description, setDescription] = useState(property?.description ?? "");
  const [exampleValue, setExampleValue] = useState(
    property?.example_value == null ? "" : String(property.example_value),
  );
  const [dataType, setDataType] = useState(property?.data_type ?? "string");
  const [required, setRequired] = useState(property?.is_required ?? false);
  const [allowed, setAllowed] = useState(
    Array.isArray(property?.allowed_values)
      ? (property!.allowed_values as string[]).join(", ")
      : "",
  );
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!technicalName.trim()) return toast.error("기술 이름은 필수예요");
    setSaving(true);
    const allowedValues = parseAllowedValues(allowed);
    const payload = {
      technical_name: technicalName.trim(),
      display_name: displayName.trim() || null,
      description: description.trim() || null,
      example_value: exampleValue.trim() || null,
      data_type: dataType,
      is_required: required,
      allowed_values: allowedValues.length ? allowedValues : null,
    };
    const { error } = property
      ? await db.from("taxonomy_custom_attribute_properties").update(payload).eq("id", property.id)
      : await db
          .from("taxonomy_custom_attribute_properties")
          .insert({ ...payload, custom_attribute_id: customAttributeId, created_by: userId });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(property ? "필드를 수정했어요" : "필드를 추가했어요");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{property ? "필드 수정" : "필드 추가"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cap-name">기술 이름</Label>
              <Input
                id="cap-name"
                value={technicalName}
                onChange={(e) => setTechnicalName(e.target.value)}
                placeholder="offer_id"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cap-display">표시 이름</Label>
              <Input
                id="cap-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
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
          <div className="space-y-1.5">
            <Label htmlFor="cap-allowed">허용 값 (쉼표로 구분)</Label>
            <Input id="cap-allowed" value={allowed} onChange={(e) => setAllowed(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              여기 적은 값 외의 것이 들어오면 검증 시 오류로 처리돼요. 비워두면 값 자체는 제한하지
              않아요.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-example">예시값</Label>
            <Textarea
              id="cap-example"
              value={exampleValue}
              onChange={(e) => setExampleValue(e.target.value)}
              placeholder="2026-01-01T00:00:00.000+09:00"
              rows={2}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              기대하는 값의 형식과 의미를 보여주세요. AI가 실제 수신값과 비교해요.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-desc">설명</Label>
            <Textarea
              id="cap-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">필수</p>
              <p className="text-xs text-muted-foreground">항상 수집돼야 하는 필드예요.</p>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving}>
            {property ? "변경 저장" : "필드 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
