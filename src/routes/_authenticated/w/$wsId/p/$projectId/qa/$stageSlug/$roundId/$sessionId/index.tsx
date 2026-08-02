import { createFileRoute, useParams } from "@tanstack/react-router";
import { QaSessionView } from "@/components/app/qa-session-view";
import { useQaSessions } from "@/lib/qa-rounds-queries";
import { useEnvironments } from "@/lib/queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/",
)({
  component: SessionIndexPage,
});

function SessionIndexPage() {
  const { wsId, projectId, stageSlug, roundId, sessionId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);
  const { data: sessions = [] } = useQaSessions(roundId);
  const session = sessions.find((s) => s.id === sessionId);
  if (!stage || !session) return null;

  return (
    <QaSessionView
      wsId={wsId}
      projectId={projectId}
      stageSlug={stageSlug}
      roundId={roundId}
      environmentId={stage.id}
      session={session}
    />
  );
}
