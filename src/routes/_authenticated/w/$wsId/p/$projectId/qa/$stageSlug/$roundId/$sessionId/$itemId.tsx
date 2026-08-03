import { createFileRoute, useParams } from "@tanstack/react-router";
import { QaBreadcrumb } from "@/components/app/qa-breadcrumb";
import { QaItemView } from "@/components/app/qa-item-view";
import { useQaChecklistItems, useQaRounds, useQaSessions } from "@/lib/qa-rounds-queries";
import { useEnvironments, useTaxonomyCustomAttributes, useTaxonomyEvents } from "@/lib/queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId",
)({
  component: ItemPage,
});

function ItemPage() {
  const { wsId, projectId, stageSlug, roundId, sessionId, itemId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);
  const { data: rounds = [] } = useQaRounds(stage?.id ?? "");
  const round = rounds.find((r) => r.id === roundId);
  const { data: sessions = [] } = useQaSessions(roundId);
  const session = sessions.find((s) => s.id === sessionId);
  const { data: checklistItems = [] } = useQaChecklistItems(sessionId);
  const item = checklistItems.find((i) => i.id === itemId);
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);

  if (!stage || !round || !session || !item) return null;

  const itemLabel =
    item.target_type === "event"
      ? events.find((e) => e.id === item.target_id)?.technical_name
      : customAttributes.find((a) => a.id === item.target_id)?.technical_name;

  return (
    <div className="space-y-3">
      <QaBreadcrumb
        items={[
          {
            label: "개발 QA",
            to: "/w/$wsId/p/$projectId/qa/$stageSlug",
            params: { wsId, projectId, stageSlug },
          },
          {
            label: round.name?.trim() ? round.name : `${round.round_number}차`,
            to: "/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
            params: { wsId, projectId, stageSlug, roundId },
          },
          {
            label: session.name,
            to: "/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId",
            params: { wsId, projectId, stageSlug, roundId, sessionId },
          },
          { label: itemLabel ?? itemId },
        ]}
      />
      <QaItemView
        projectId={projectId}
        environmentId={stage.id}
        session={session}
        item={item}
        result={item.qa_checklist_item_results[0]}
      />
    </div>
  );
}
