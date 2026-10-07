import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db, type TaxonomyEvent, type TaxonomyEventProperty } from "@/lib/queries";
import { errorMessage } from "@/lib/domain";
import type { QaChannel } from "@/lib/qa-rounds-queries";
import {
  PropertyIdentityFields,
  PropertyValueFields,
  usePropertyFieldsState,
} from "./property-fields";
import type { AnyAttribute } from "./types";

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

  const fields = usePropertyFieldsState({
    technicalName: attribute?.technical_name,
    displayName: attribute?.display_name,
    description: attribute?.description,
    exampleValue: attribute?.example_value,
    dataType: attribute?.data_type,
    required: attribute?.is_required ?? eventId !== null,
    allowedValues: attribute?.allowed_values,
  });
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
    if (!fields.technicalName.trim()) return toast.error("기술 이름은 필수예요");
    fields.setSaving(true);
    const basePayload = fields.buildPayload();
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
      fields.setSaving(false);
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
    fields.setSaving(false);
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
              <p className="text-sm text-muted-foreground">
                이 프로퍼티가 어느 이벤트에 포함되는지는 여기서 바꿀 수 없어요. 다른 이벤트로
                옮기려면 삭제한 뒤 원하는 이벤트에 다시 추가해 주세요.
              </p>
            ) : null}
          </div>
          <PropertyIdentityFields
            idPrefix="at"
            technicalName={fields.technicalName}
            onTechnicalNameChange={fields.setTechnicalName}
            technicalNamePlaceholder="order_no"
            displayName={fields.displayName}
            onDisplayNameChange={fields.setDisplayName}
            dataType={fields.dataType}
            onDataTypeChange={fields.setDataType}
          />
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
          <PropertyValueFields
            idPrefix="at"
            allowed={fields.allowed}
            onAllowedChange={fields.setAllowed}
            exampleValue={fields.exampleValue}
            onExampleValueChange={fields.setExampleValue}
            description={fields.description}
            onDescriptionChange={fields.setDescription}
            required={fields.required}
            onRequiredChange={fields.setRequired}
            requiredDescription={`항상 수집돼야 하는 ${isProperty ? "프로퍼티" : "어트리뷰트"}예요.`}
          />
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
          <Button onClick={submit} disabled={fields.saving}>
            {attribute ? "변경 저장" : isProperty ? "프로퍼티 추가" : "어트리뷰트 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
