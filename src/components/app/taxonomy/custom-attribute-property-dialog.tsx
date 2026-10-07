import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db, type TaxonomyCustomAttributeProperty } from "@/lib/queries";
import { errorMessage } from "@/lib/domain";
import {
  usePropertyFieldsState,
  PropertyIdentityFields,
  PropertyValueFields,
} from "@/components/app/taxonomy/property-fields";

export function CustomAttributePropertyDialog({
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
  const fields = usePropertyFieldsState({
    technicalName: property?.technical_name,
    displayName: property?.display_name,
    description: property?.description,
    exampleValue: property?.example_value,
    dataType: property?.data_type,
    required: property?.is_required ?? false,
    allowedValues: property?.allowed_values,
  });

  async function submit() {
    if (!fields.technicalName.trim()) return toast.error("기술 이름은 필수예요");
    fields.setSaving(true);
    const payload = fields.buildPayload();
    const { error } = property
      ? await db.from("taxonomy_custom_attribute_properties").update(payload).eq("id", property.id)
      : await db
          .from("taxonomy_custom_attribute_properties")
          .insert({ ...payload, custom_attribute_id: customAttributeId, created_by: userId });
    fields.setSaving(false);
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
          <PropertyIdentityFields
            idPrefix="cap"
            technicalName={fields.technicalName}
            onTechnicalNameChange={fields.setTechnicalName}
            technicalNamePlaceholder="offer_id"
            displayName={fields.displayName}
            onDisplayNameChange={fields.setDisplayName}
            dataType={fields.dataType}
            onDataTypeChange={fields.setDataType}
          />
          <PropertyValueFields
            idPrefix="cap"
            allowed={fields.allowed}
            onAllowedChange={fields.setAllowed}
            exampleValue={fields.exampleValue}
            onExampleValueChange={fields.setExampleValue}
            description={fields.description}
            onDescriptionChange={fields.setDescription}
            required={fields.required}
            onRequiredChange={fields.setRequired}
            requiredDescription="항상 수집돼야 하는 필드예요."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={fields.saving}>
            {property ? "변경 저장" : "필드 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
