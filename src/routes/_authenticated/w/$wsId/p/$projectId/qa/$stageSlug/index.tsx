import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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
        to: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
        params: { ...params, roundId: rounds[0].id },
      });
    }
  },
  component: NoRoundsYet,
});

function NoRoundsYet() {
  return null;
}
