import { createFileRoute, useParams } from "@tanstack/react-router";
import { QaRoundView } from "@/components/app/qa-round-view";
import { useEnvironments } from "@/lib/queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/",
)({
  component: RoundIndexPage,
});

function RoundIndexPage() {
  const { wsId, projectId, stageSlug, roundId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);
  if (!stage) return null;

  return (
    <QaRoundView
      wsId={wsId}
      projectId={projectId}
      stageSlug={stageSlug}
      environmentId={stage.id}
      roundId={roundId}
    />
  );
}
