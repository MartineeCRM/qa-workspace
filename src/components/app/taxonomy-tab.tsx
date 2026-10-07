import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

import { EmptyState } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { TaxonomyImport } from "@/components/app/taxonomy-import";
import {
  AttributeRow,
  ExpandableCustomAttributeRow,
  RowActions,
} from "@/components/app/taxonomy/rows";
import { EventDialog } from "@/components/app/taxonomy/event-dialog";
import { TaxonomyAttributeDialog } from "@/components/app/taxonomy/attribute-dialog";
import { CustomAttributePropertyDialog } from "@/components/app/taxonomy/custom-attribute-property-dialog";
import type { AnyAttribute } from "@/components/app/taxonomy/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  db,
  type TaxonomyCustomAttribute,
  type TaxonomyCustomAttributeProperty,
  type TaxonomyEvent,
  type TaxonomyEventProperty,
} from "@/lib/queries";
import { errorMessage } from "@/lib/domain";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useQaChannelExclusions, useQaChannels } from "@/lib/qa-rounds-queries";

export { TaxonomyAttributeDialog } from "@/components/app/taxonomy/attribute-dialog";

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
    qc.invalidateQueries({ queryKey: ["activity"] });
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
            customAttributeProperties={customAttributeProperties}
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
                          <p className="mt-0.5 text-sm text-muted-foreground">
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
