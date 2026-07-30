import { createFileRoute, useParams } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/layout-parts";
import { TaxonomyTab } from "@/components/app/taxonomy-tab";
import { RulesTab } from "@/components/app/rules-tab";
import { CoverageBar } from "@/components/app/coverage";
import {
  buildCoverageItems,
  useRules,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
} from "@/lib/queries";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { canEdit } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/taxonomy")({
  head: () => ({
    meta: [
      { title: "택소노미 — 단일 기준" },
      {
        name: "description",
        content:
          "전체 트래킹 커버리지를 정의하는 이벤트, 속성, 검증 규칙을 관리해요.",
      },
      { property: "og:title", content: "택소노미 — 단일 기준" },
      {
        property: "og:description",
        content: "모든 QA 환경이 함께 쓰는 이벤트, 속성, 검증 규칙이에요.",
      },
    ],
  }),
  component: TaxonomyPage,
});

function TaxonomyPage() {
  const { projectId } = useParams({ from: "/_authenticated/w/$wsId/p/$projectId/taxonomy" });
  const { role } = useWorkspaceContext();
  const editable = canEdit(role);

  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: eventProperties = [] } = useTaxonomyEventProperties(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: rules = [] } = useRules(projectId);

  const items = buildCoverageItems(events, eventProperties, customAttributes);

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        title="택소노미"
        description="이 고객의 단일 기준이에요. 모든 QA 환경이 이 택소노미를 검증하고, 규칙을 환경별로 복사하지 않아요."
        actions={
          <div className="w-48">
            <p className="text-xs text-muted-foreground">전체 커버리지</p>
            <p className="text-2xl font-semibold tabular-nums">{items.length}</p>
          </div>
        }
      />

      <CoverageBar verified={items.length} total={items.length} className="max-w-sm" />

      <Tabs defaultValue="structure">
        <TabsList>
          <TabsTrigger value="structure">이벤트·속성</TabsTrigger>
          <TabsTrigger value="rules">검증 규칙</TabsTrigger>
        </TabsList>
        <TabsContent value="structure" className="mt-4">
          <TaxonomyTab
            projectId={projectId}
            events={events}
            eventProperties={eventProperties}
            customAttributes={customAttributes}
            editable={editable}
          />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <RulesTab
            projectId={projectId}
            rules={rules}
            events={events}
            eventProperties={eventProperties}
            customAttributes={customAttributes}
            editable={editable}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
