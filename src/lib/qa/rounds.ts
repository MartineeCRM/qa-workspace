import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/qa/db";
import type { QaRound } from "@/lib/qa/types";
import { summarizeRoundValidationItems } from "@/lib/qa-workflow";

export function useQaRounds(environmentId: string) {
  return useQuery({
    queryKey: ["qa-rounds", environmentId],
    enabled: Boolean(environmentId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_rounds")
        .select("*")
        .eq("qa_environment_id", environmentId)
        .order("round_number", { ascending: true });
      if (error) throw error;
      return data as QaRound[];
    },
  });
}

export function useCreateQaRound(projectId: string, environmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      previousRoundId,
    }: {
      userId: string;
      previousRoundId: string | null;
    }) => {
      const { data: prevRounds, error: countError } = await db
        .from("qa_rounds")
        .select("round_number")
        .eq("qa_environment_id", environmentId)
        .order("round_number", { ascending: false })
        .limit(1);
      if (countError) throw countError;
      const nextNumber = (prevRounds?.[0]?.round_number ?? 0) + 1;

      const { data: round, error: roundError } = await db
        .from("qa_rounds")
        .insert({
          project_id: projectId,
          qa_environment_id: environmentId,
          round_number: nextNumber,
          previous_round_id: previousRoundId,
          started_by: userId,
        })
        .select()
        .single();
      if (roundError) throw roundError;
      return round as QaRound;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-rounds", environmentId] });
    },
  });
}

export function useRenameQaRound(environmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roundId, name }: { roundId: string; name: string | null }) => {
      const { error } = await db.from("qa_rounds").update({ name }).eq("id", roundId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-rounds", environmentId] });
    },
  });
}

export function useDeleteQaRound(environmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roundId: string) => {
      const { error } = await db.from("qa_rounds").delete().eq("id", roundId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-rounds", environmentId] });
    },
  });
}

export function useRoundValidationSummary(roundId: string) {
  return useQuery({
    queryKey: ["qa-round-validation-summary", roundId],
    enabled: Boolean(roundId),
    queryFn: async () => {
      const { data: sessions, error: sessionsError } = await db
        .from("qa_sessions")
        .select("id")
        .eq("qa_round_id", roundId);
      if (sessionsError) throw sessionsError;
      const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
      if (sessionIds.length === 0) {
        return { executed: 0, passed: 0, unconfirmedIssues: 0, confirmedIssues: 0 };
      }

      const { data: items, error: itemsError } = await db
        .from("qa_round_checklist_items")
        .select(
          "target_type, target_id, disposition, qa_checklist_item_results(final_status, qa_discussions(id))",
        )
        .in("qa_session_id", sessionIds);
      if (itemsError) throw itemsError;

      return summarizeRoundValidationItems(items ?? []);
    },
  });
}
