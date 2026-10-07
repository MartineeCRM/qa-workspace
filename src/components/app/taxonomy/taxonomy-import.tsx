import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type TaxonomyCustomAttribute,
  type TaxonomyCustomAttributeProperty,
  type TaxonomyEvent,
  type TaxonomyEventProperty,
} from "@/lib/queries";
import { errorMessage } from "@/lib/domain";
import { useAuth } from "@/lib/auth";
import {
  downloadText,
  parseTaxonomyFile,
  sampleCsv,
  sampleJson,
  sampleYaml,
} from "@/lib/taxonomy-import";

import { saveTaxonomyImport } from "@/lib/taxonomy-import-save";

export function TaxonomyImport({
  projectId,
  events,
  eventProperties,
  customAttributes,
  customAttributeProperties,
}: {
  projectId: string;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  customAttributes: TaxonomyCustomAttribute[];
  customAttributeProperties: TaxonomyCustomAttributeProperty[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const parsed = parseTaxonomyFile(file.name, await file.text());
      const result = await saveTaxonomyImport({
        projectId,
        userId: user?.id,
        parsed,
        events,
        eventProperties,
        customAttributes,
        customAttributeProperties,
      });

      toast.success(
        `이벤트 ${result.createdEvents}개, 프로퍼티·어트리뷰트 ${result.createdAttrs}개 추가 · 기존 항목 ${result.updated}개 수정했어요`,
      );
    } catch (error) {
      toast.error(errorMessage(error, "파일을 읽지 못했어요"));
    } finally {
      qc.invalidateQueries({ queryKey: ["events", projectId] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["taxonomy-event-properties", projectId] });
      qc.invalidateQueries({ queryKey: ["taxonomy-custom-attributes", projectId] });
      qc.invalidateQueries({ queryKey: ["taxonomy-custom-attribute-properties", projectId] });
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.json,.yaml,.yml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            {busy ? "불러오는 중…" : "가져오기"} <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[380px]">
          <DropdownMenuItem
            className="flex-col items-start gap-0.5 py-2.5"
            onSelect={() => fileRef.current?.click()}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Upload className="size-4" /> 파일로 일괄 등록
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              CSV·JSON·YAML 파일로 등록해요. 같은 기술명의 항목은 파일의 값으로 덮어써요.
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            파일의 빈 값도 반영하며, 파일에 없는 기존 항목은 유지해요
          </DropdownMenuLabel>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            예시 데이터셋 내려받기
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => downloadText("taxonomy-sample.csv", sampleCsv(), "text/csv")}
          >
            CSV 예시
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => downloadText("taxonomy-sample.json", sampleJson(), "application/json")}
          >
            JSON 예시
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => downloadText("taxonomy-sample.yaml", sampleYaml(), "text/yaml")}
          >
            YAML 예시
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
