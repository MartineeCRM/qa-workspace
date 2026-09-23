import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { TopBar } from "@/components/app/top-bar";
import { SectionHeader, Stat } from "@/components/app/layout-parts";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TaxonomyTab } from "@/components/app/taxonomy-tab";
import { RulesTab } from "@/components/app/rules-tab";
import {
  db,
  buildCoverageItems,
  useMyRole,
  useRules,
  useTaxonomyCustomAttributeProperties,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
  type Project,
} from "@/lib/queries";
import { canEdit } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/taxonomy-studio/$projectId")({
  head: () => ({
    meta: [{ title: "Studio — 택소노미" }],
  }),
  component: StudioProjectPage,
});

// useProject()는 없는 프로젝트에 대해 unwrap()이 []를 돌려줘서 `if (!project)`가 항상
// 거짓이 되는 함정이 있다 — 여기서는 그 훅을 쓰지 않고 직접 조회해서 null을 정확히 구분한다.
function useStudioProject(projectId: string) {
  return useQuery({
    queryKey: ["studio-project", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Project | null;
    },
  });
}

function StudioProjectPage() {
  const { projectId } = useParams({ from: "/_authenticated/taxonomy-studio/$projectId" });
  const { data: project, isLoading: projectLoading } = useStudioProject(projectId);
  const { data: role } = useMyRole(project?.workspace_id ?? "");
  const editable = canEdit(role);
  const [view, setView] = useState<"structure" | "rules">("structure");

  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: eventProperties = [] } = useTaxonomyEventProperties(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: customAttributeProperties = [] } = useTaxonomyCustomAttributeProperties(projectId);
  const { data: rules = [] } = useRules(projectId);

  if (projectLoading) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <div className="p-6">
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen">
        <TopBar />
        {/* w/$wsId/route.tsx, w/$wsId/p/$projectId/route.tsx의 "열 수 없어요" 화면과
            같은 레이아웃(가운데 정렬된 일반 블록)으로 맞춘다 — EmptyState는 목록 안
            placeholder용 컴포넌트라 전체 화면 에러 상태엔 안 맞는다. */}
        <div className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-lg font-semibold">프로젝트를 열 수 없어요</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            삭제됐거나 접근 권한이 없는 프로젝트예요.
          </p>
          <Button asChild className="mt-4">
            {/* Task 9가 /taxonomy-studio 인덱스 라우트를 아직 추가하지 않아 라우트
                트리 타입에 없다 — w/$wsId/route.tsx의 SideLink와 같은 방식으로 `as any`를
                써서 지금도 실제 SPA 내비게이션이 되게 하고, Task 9가 라우트를 추가하면
                타입 캐스트만 지우면 된다. */}
            <Link
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              to={"/taxonomy-studio" as any}
            >
              Studio 프로젝트 목록으로
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const items = buildCoverageItems(events, eventProperties, customAttributes);

  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="mx-auto max-w-[1240px] space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeader
            className="flex-1"
            title={`Studio — ${project.name}`}
            description="이 프로젝트의 단일 기준 택소노미예요. qa-workspace와 같은 데이터를 봐요."
          />
          {/* SectionHeader의 meta는 <p className="text-xs text-muted-foreground">로
              감싸져서 버튼을 넣기엔 맞지 않는다(PageHeader의 actions와 다름) — 별도 행으로 뺐다. */}
          <Button asChild variant="outline" size="sm">
            <Link
              to="/w/$wsId/p/$projectId/taxonomy"
              params={{ wsId: project.workspace_id, projectId: project.id }}
            >
              <ArrowLeft className="size-3.5" /> QA 현황 보기
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="전체 커버리지" value={items.length} />
          <Stat label="이벤트" value={items.filter((i) => i.kind === "event").length} />
          <Stat label="이벤트 프로퍼티" value={items.filter((i) => i.kind === "property").length} />
          <Stat label="어트리뷰트" value={items.filter((i) => i.kind === "attribute").length} />
        </div>
        <SegmentedControl
          value={view}
          onValueChange={setView}
          options={[
            { value: "structure", label: "이벤트·프로퍼티·어트리뷰트" },
            { value: "rules", label: "검증 규칙" },
          ]}
        />
        {view === "structure" ? (
          <TaxonomyTab
            projectId={projectId}
            events={events}
            eventProperties={eventProperties}
            customAttributes={customAttributes}
            customAttributeProperties={customAttributeProperties}
            editable={editable}
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
    </div>
  );
}
