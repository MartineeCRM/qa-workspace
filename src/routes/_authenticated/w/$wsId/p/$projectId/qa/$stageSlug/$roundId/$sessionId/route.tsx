import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { EmptyState } from "@/components/app/layout-parts";
import { useQaSessions } from "@/lib/qa-rounds-queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId",
)({
  component: SessionLayout,
});

function SessionLayout() {
  const { roundId, sessionId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId",
  });
  const { data: sessions = [] } = useQaSessions(roundId);
  const session = sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [sessionId]);

  if (sessions.length > 0 && !session) {
    return (
      <EmptyState title="검증 실행을 찾을 수 없어요" description="삭제됐거나 잘못된 링크예요." />
    );
  }
  if (!session) return null;

  return <Outlet />;
}
