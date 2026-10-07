import { useState } from "react";

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
import { DATA_TYPES, type DataType } from "@/lib/domain";
import { parseAllowedValues } from "@/lib/taxonomy-import";

type PropertyFieldsSeed = {
  technicalName?: string | null;
  displayName?: string | null;
  description?: string | null;
  exampleValue?: unknown;
  dataType?: string | null;
  required: boolean;
  allowedValues?: unknown;
};

// TaxonomyAttributeDialog와 CustomAttributePropertyDialog가 공유하던 8개 필드 상태 +
// payload 조립 로직(technical_name/display_name/description/example_value/data_type/
// is_required/allowed_values) — 두 다이얼로그 전용 로직(형제 동기화, 채널 제외, 부모 이벤트
// 선택)은 각자 컴포넌트에 그대로 둔다.
export function usePropertyFieldsState(seed: PropertyFieldsSeed) {
  const [technicalName, setTechnicalName] = useState(seed.technicalName ?? "");
  const [displayName, setDisplayName] = useState(seed.displayName ?? "");
  const [description, setDescription] = useState(seed.description ?? "");
  const [exampleValue, setExampleValue] = useState(
    seed.exampleValue == null ? "" : String(seed.exampleValue),
  );
  // 실제 taxonomy_* 테이블의 data_type 컬럼은 string으로만 타입이 붙어 있어 seed도 느슨하게
  // 받지만, Select가 항상 DATA_TYPES 중 하나만 내보내므로 상태 자체는 도메인의 DataType
  // 유니온으로 좁혀서 들고 있는다. setDataType의 시그니처는 Radix Select의
  // onValueChange: (value: string) => void 계약과 맞춰 string을 그대로 받는다.
  const [dataType, setDataTypeState] = useState<DataType>((seed.dataType ?? "string") as DataType);
  function setDataType(value: string) {
    setDataTypeState(value as DataType);
  }
  const [required, setRequired] = useState(seed.required);
  const [allowed, setAllowed] = useState(
    Array.isArray(seed.allowedValues) ? (seed.allowedValues as string[]).join(", ") : "",
  );
  const [saving, setSaving] = useState(false);

  function buildPayload() {
    const allowedValues = parseAllowedValues(allowed);
    return {
      technical_name: technicalName.trim(),
      display_name: displayName.trim() || null,
      description: description.trim() || null,
      example_value: exampleValue.trim() || null,
      data_type: dataType,
      is_required: required,
      allowed_values: allowedValues.length ? allowedValues : null,
    };
  }

  return {
    technicalName,
    setTechnicalName,
    displayName,
    setDisplayName,
    description,
    setDescription,
    exampleValue,
    setExampleValue,
    dataType,
    setDataType,
    required,
    setRequired,
    allowed,
    setAllowed,
    saving,
    setSaving,
    buildPayload,
  };
}

export function PropertyIdentityFields({
  idPrefix,
  technicalName,
  onTechnicalNameChange,
  technicalNamePlaceholder,
  displayName,
  onDisplayNameChange,
  dataType,
  onDataTypeChange,
}: {
  idPrefix: string;
  technicalName: string;
  onTechnicalNameChange: (value: string) => void;
  technicalNamePlaceholder: string;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  dataType: string;
  onDataTypeChange: (value: string) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`}>기술 이름</Label>
          <Input
            id={`${idPrefix}-name`}
            value={technicalName}
            onChange={(e) => onTechnicalNameChange(e.target.value)}
            placeholder={technicalNamePlaceholder}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-display`}>표시 이름</Label>
          <Input
            id={`${idPrefix}-display`}
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>데이터 타입</Label>
        <Select value={dataType} onValueChange={onDataTypeChange}>
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
    </>
  );
}

export function PropertyValueFields({
  idPrefix,
  allowed,
  onAllowedChange,
  exampleValue,
  onExampleValueChange,
  description,
  onDescriptionChange,
  required,
  onRequiredChange,
  requiredDescription,
  requiredDescriptionClassName = "text-sm text-muted-foreground",
}: {
  idPrefix: string;
  allowed: string;
  onAllowedChange: (value: string) => void;
  exampleValue: string;
  onExampleValueChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  required: boolean;
  onRequiredChange: (value: boolean) => void;
  requiredDescription: string;
  requiredDescriptionClassName?: string;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-allowed`}>허용 값 (쉼표로 구분)</Label>
        <Input
          id={`${idPrefix}-allowed`}
          value={allowed}
          onChange={(e) => onAllowedChange(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          여기 적은 값 외의 것이 들어오면 검증 시 오류로 처리돼요. 비워두면 값 자체는 제한하지
          않아요.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-example`}>예시값</Label>
        <Textarea
          id={`${idPrefix}-example`}
          value={exampleValue}
          onChange={(e) => onExampleValueChange(e.target.value)}
          placeholder="2026-01-01T00:00:00.000+09:00"
          rows={2}
          className="resize-y"
        />
        <p className="text-xs text-muted-foreground">
          기대하는 값의 형식과 의미를 보여주세요. AI가 실제 수신값과 비교해요.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-desc`}>설명</Label>
        <Textarea
          id={`${idPrefix}-desc`}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={2}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div>
          <p className="text-sm font-medium">필수</p>
          <p className={requiredDescriptionClassName}>{requiredDescription}</p>
        </div>
        <Switch checked={required} onCheckedChange={onRequiredChange} />
      </div>
    </>
  );
}
