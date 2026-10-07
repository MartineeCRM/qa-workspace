import { useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";

import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { TaxonomyCustomAttribute, TaxonomyCustomAttributeProperty } from "@/lib/queries";
import type { AnyAttribute } from "@/components/app/taxonomy/types";
import { dataTypeColors } from "@/components/app/taxonomy/types";

export function RowActions({
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

export function AttributeRow({
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
          <Pill className={dataTypeColors[attribute.data_type]}>{attribute.data_type}</Pill>
          {!attribute.is_active ? <Pill>비활성</Pill> : null}
        </div>
        {attribute.display_name ||
        (attribute.example_value != null && String(attribute.example_value).trim() !== "") ? (
          <p className="mt-0.5 break-all text-sm text-muted-foreground">
            {attribute.display_name}
            {attribute.example_value != null && String(attribute.example_value).trim() !== "" ? (
              <span className={attribute.display_name ? "ml-1" : undefined}>
                (예 :
                {typeof attribute.example_value === "object"
                  ? JSON.stringify(attribute.example_value)
                  : String(attribute.example_value)}
                )
              </span>
            ) : null}
          </p>
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

export function ExpandableCustomAttributeRow({
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
            <Pill className={dataTypeColors[attribute.data_type]}>{attribute.data_type}</Pill>
            <Pill>필드 {subProperties.length}개</Pill>
            {!attribute.is_active ? <Pill>비활성</Pill> : null}
          </div>
          {attribute.display_name ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{attribute.display_name}</p>
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
