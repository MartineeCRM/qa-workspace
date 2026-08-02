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
  db,
  type TaxonomyCustomAttribute,
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
  type ImportedAttribute,
} from "@/lib/taxonomy-import";

export function TaxonomyImport({
  projectId,
  events,
  eventProperties,
  customAttributes,
}: {
  projectId: string;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  customAttributes: TaxonomyCustomAttribute[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const parsed = parseTaxonomyFile(file.name, await file.text());
      const eventByName = new Map(events.map((e) => [e.technical_name, e]));
      const existingProps = new Set(
        eventProperties.map((p) => `${p.event_id}::${p.technical_name}`),
      );
      const existingCustom = new Set(customAttributes.map((a) => a.technical_name));

      let createdEvents = 0;
      let createdAttrs = 0;

      for (const ev of parsed.events) {
        let eventId = eventByName.get(ev.technical_name)?.id ?? null;
        if (!eventId) {
          const { data, error } = await db
            .from("taxonomy_events")
            .insert({
              project_id: projectId,
              technical_name: ev.technical_name,
              display_name: ev.display_name,
              description: ev.description,
              trigger_description: ev.trigger_description,
              created_by: user?.id,
            })
            .select("id")
            .single();
          if (error) throw error;
          eventId = data.id as string;
          eventByName.set(ev.technical_name, { id: eventId } as TaxonomyEvent);
          createdEvents += 1;
        }
        const newProps = ev.attributes.filter(
          (a) => !existingProps.has(`${eventId}::${a.technical_name}`),
        );
        if (newProps.length) {
          const { error } = await db
            .from("taxonomy_event_properties")
            .insert(newProps.map((a, i) => propertyPayload(a, eventId as string, user?.id, i)));
          if (error) throw error;
          newProps.forEach((a) => existingProps.add(`${eventId}::${a.technical_name}`));
          createdAttrs += newProps.length;
        }
      }

      const newCustomAttrs = parsed.userAttributes.filter(
        (a) => !existingCustom.has(a.technical_name),
      );
      if (newCustomAttrs.length) {
        const { error } = await db
          .from("taxonomy_custom_attributes")
          .insert(newCustomAttrs.map((a, i) => customAttributePayload(a, projectId, user?.id, i)));
        if (error) throw error;
        createdAttrs += newCustomAttrs.length;
      }

      qc.invalidateQueries({ queryKey: ["events", projectId] });
      qc.invalidateQueries({ queryKey: ["taxonomy-event-properties", projectId] });
      qc.invalidateQueries({ queryKey: ["taxonomy-custom-attributes", projectId] });

      if (createdEvents === 0 && createdAttrs === 0) {
        toast.info("이미 등록된 항목이라 새로 추가된 내용은 없어요");
      } else {
        toast.success(`이벤트 ${createdEvents}개, 속성 ${createdAttrs}개를 추가했어요`);
      }
    } catch (error) {
      toast.error(errorMessage(error, "파일을 읽지 못했어요"));
    } finally {
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
              CSV·JSON·YAML 파일을 올려서 이벤트와 속성을 한 번에 추가해요
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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

function propertyPayload(
  a: ImportedAttribute,
  eventId: string,
  userId: string | undefined,
  sort: number,
) {
  return {
    event_id: eventId,
    technical_name: a.technical_name,
    display_name: a.display_name,
    description: a.description,
    data_type: a.data_type,
    is_required: a.is_required,
    allowed_values: a.allowed_values,
    sort_order: sort,
    created_by: userId,
  };
}

function customAttributePayload(
  a: ImportedAttribute,
  projectId: string,
  userId: string | undefined,
  sort: number,
) {
  return {
    project_id: projectId,
    technical_name: a.technical_name,
    display_name: a.display_name,
    description: a.description,
    data_type: a.data_type,
    is_required: a.is_required,
    allowed_values: a.allowed_values,
    sort_order: sort,
    created_by: userId,
  };
}
