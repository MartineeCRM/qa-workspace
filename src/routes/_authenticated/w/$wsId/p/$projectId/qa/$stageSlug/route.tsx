import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { EmptyState } from "@/components/app/layout-parts";
import { useEnvironments } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug")({
  head: () => ({
    meta: [
      { title: "QA 환경 — 라운드별 검증 워크플로우" },
      {
        name: "description",
        content:
          "라운드마다 세션을 나눠 체크리스트를 만들고, 로그를 모아 판정하고, 처리 결과를 이어갑니다.",
      },
    ],
  }),
  component: StageLayout,
});

function StageLayout() {
  const { projectId, stageSlug } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);

  if (stages.length > 0 && !stage) {
    return (
      <div className="p-6">
        <EmptyState
          title="QA 환경을 찾을 수 없어요"
          description="이 프로젝트에는 없는 환경이에요."
        />
      </div>
    );
  }
  if (!stage) return <div className="p-6" />;

  return (
    <div className="min-w-0" style={{ width: "fit-content", minWidth: "100%" }}>
      <div className="min-w-[640px] space-y-4 px-8 pb-[70px] pt-5">
        <Outlet />
      </div>
    </div>
  );
}
