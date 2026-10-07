import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/qa/db";
import { flattenChecklistCoverageRounds, type ChecklistCoverageRow } from "@/lib/qa-workflow";

export function useProjectChecklistCoverageRows(projectId: string) {
  return useQuery({
    queryKey: ["project-checklist-coverage", projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ChecklistCoverageRow[]> => {
      const { data, error } = await db
        .from("qa_rounds")
        .select(
          "id, qa_environment_id, round_number, qa_sessions(id, qa_channel_id, qa_round_checklist_items(id, target_type, target_id, disposition, qa_checklist_item_results(final_status, updated_at)))",
        )
        .eq("project_id", projectId);
      if (error) throw error;
      return flattenChecklistCoverageRounds(data ?? []);
    },
  });
}
