import { createFileRoute, redirect, useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/domain";
import { useEnvironments } from "@/lib/queries";
import { useCreateQaRound } from "@/lib/qa-rounds-queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/")({
  beforeLoad: async ({ params }) => {
    const { data: stages } = await db
      .from("qa_environments")
      .select("id")
      .eq("project_id", params.projectId)
      .eq("slug", params.stageSlug)
      .maybeSingle();
    if (!stages) return;

    const { data: rounds } = await db
      .from("qa_rounds")
      .select("id")
      .eq("qa_environment_id", stages.id)
      .order("round_number", { ascending: false })
      .limit(1);

    if (rounds && rounds[0]) {
      throw redirect({
        to: "/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
        params: { ...params, roundId: rounds[0].id },
      });
    }
  },
  component: NoRoundsYet,
});

function NoRoundsYet() {
  const { wsId, projectId, stageSlug } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/",
  });
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);
  const createRound = useCreateQaRound(projectId, stage?.id ?? "");

  if (!stage) return null;

  function startFirstRound() {
    if (!user) return;
    createRound.mutate(
      { userId: user.id, previousRoundId: null },
      {
        onError: (error) => toast.error(errorMessage(error)),
        onSuccess: (round) => {
          navigate({
            to: "/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
            params: { wsId, projectId, stageSlug, roundId: round.id },
          });
        },
      },
    );
  }

  return (
    <div className="p-6">
      <EmptyState
        title="아직 라운드가 없어요"
        description="라운드마다 세션을 나눠 체크리스트를 만들고, 로그를 모아 판정할 수 있어요."
        action={
          <Button onClick={startFirstRound} disabled={createRound.isPending}>
            + 새 라운드 시작
          </Button>
        }
      />
    </div>
  );
}
