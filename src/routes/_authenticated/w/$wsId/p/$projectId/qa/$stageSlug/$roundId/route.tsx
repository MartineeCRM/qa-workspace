import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { EmptyState } from "@/components/app/layout-parts";
import { useQaRounds } from "@/lib/qa-rounds-queries";
import { useEnvironments } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId")(
  {
    component: RoundLayout,
  },
);

function RoundLayout() {
  const { projectId, stageSlug, roundId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);
  const { data: rounds = [] } = useQaRounds(stage?.id ?? "");
  const round = rounds.find((r) => r.id === roundId);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [roundId]);

  if (rounds.length > 0 && !round) {
    return <EmptyState title="라운드를 찾을 수 없어요" description="삭제됐거나 잘못된 링크예요." />;
  }
  if (!round) return null;

  return <Outlet />;
}
