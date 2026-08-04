import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SectionHeader, Stat } from "@/components/app/layout-parts";
import { TaxonomyTab } from "@/components/app/taxonomy-tab";
import { RulesTab } from "@/components/app/rules-tab";
import {
  buildCoverageItems,
  useRules,
  useTaxonomyCustomAttributeProperties,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
} from "@/lib/queries";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { canEdit } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/taxonomy")({
  validateSearch: (search: Record<string, unknown>): { propertyId?: string } => ({
    propertyId: typeof search.propertyId === "string" ? search.propertyId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "택소노미 — 단일 기준" },
      {
        name: "description",
        content:
          "전체 트래킹 커버리지를 정의하는 이벤트, 프로퍼티, 어트리뷰트, 검증 규칙을 관리해요.",
      },
      { property: "og:title", content: "택소노미 — 단일 기준" },
      {
        property: "og:description",
        content: "모든 QA 환경이 함께 쓰는 이벤트, 프로퍼티, 어트리뷰트, 검증 규칙이에요.",
      },
    ],
  }),
  component: TaxonomyPage,
});

function TaxonomyPage() {
  const { projectId } = useParams({ from: "/_authenticated/w/$wsId/p/$projectId/taxonomy" });
  const { propertyId } = Route.useSearch();
  const { role } = useWorkspaceContext();
  const editable = canEdit(role);
  const [view, setView] = useState<"structure" | "rules">("structure");

  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: eventProperties = [] } = useTaxonomyEventProperties(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: customAttributeProperties = [] } = useTaxonomyCustomAttributeProperties(projectId);
  const { data: rules = [] } = useRules(projectId);

  const items = buildCoverageItems(events, eventProperties, customAttributes);
  const eventCount = items.filter((i) => i.kind === "event").length;
  const propertyCount = items.filter((i) => i.kind === "property").length;
  const attributeCount = items.filter((i) => i.kind === "attribute").length;

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 p-6">
      <SectionHeader
        title="택소노미"
        description="이 고객의 단일 기준이에요. 모든 QA 환경이 이 택소노미를 검증하고, 규칙을 환경별로 복사하지 않아요."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="전체 커버리지" value={items.length} />
        <Stat label="이벤트" value={eventCount} />
        <Stat label="이벤트 프로퍼티" value={propertyCount} />
        <Stat label="어트리뷰트" value={attributeCount} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <SegmentedControl
          value={view}
          onValueChange={setView}
          options={[
            { value: "structure", label: "이벤트·프로퍼티·어트리뷰트" },
            { value: "rules", label: "검증 규칙" },
          ]}
        />
      </div>

      {view === "structure" ? (
        <TaxonomyTab
          projectId={projectId}
          events={events}
          eventProperties={eventProperties}
          customAttributes={customAttributes}
          customAttributeProperties={customAttributeProperties}
          editable={editable}
          openPropertyId={propertyId}
        />
      ) : (
        <RulesTab
          projectId={projectId}
          rules={rules}
          events={events}
          eventProperties={eventProperties}
          customAttributes={customAttributes}
          editable={editable}
        />
      )}
    </div>
  );
}
