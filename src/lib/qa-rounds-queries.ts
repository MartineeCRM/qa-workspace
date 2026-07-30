import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QaRound = {
  id: string;
  project_id: string;
  qa_environment_id: string;
  round_number: number;
  previous_round_id: string | null;
  started_by: string;
  started_at: string;
  ended_at: string | null;
};

export type QaChecklistItem = {
  id: string;
  qa_round_id: string;
  target_type: "event" | "custom_attribute";
  target_id: string;
};

export type QaChecklistItemResult = {
  id: string;
  checklist_item_id: string;
  ai_verdict: "passed" | "failed" | "not_collected" | null;
  ai_reasoning: string | null;
  ai_evidence: unknown;
  failed_layer: "existence" | "structural" | "qualitative" | null;
  final_status: "passed" | "failed" | "not_collected";
  overridden_by: string | null;
  overridden_at: string | null;
  override_reason: string | null;
};

export function useQaRounds(environmentId: string) {
  return useQuery({
    queryKey: ["qa-rounds", environmentId],
    enabled: Boolean(environmentId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_rounds")
        .select("*")
        .eq("qa_environment_id", environmentId)
        .order("round_number", { ascending: false });
      if (error) throw error;
      return data as QaRound[];
    },
  });
}

export function useQaChecklistItems(roundId: string) {
  return useQuery({
    queryKey: ["qa-checklist-items", roundId],
    enabled: Boolean(roundId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_round_checklist_items")
        .select("*, qa_checklist_item_results(*)")
        .eq("qa_round_id", roundId);
      if (error) throw error;
      return data as (QaChecklistItem & { qa_checklist_item_results: QaChecklistItemResult[] })[];
    },
  });
}

export function useCreateQaRound(projectId: string, environmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      previousRoundId,
      eventIds,
      customAttributeIds,
    }: {
      userId: string;
      previousRoundId: string | null;
      eventIds: string[];
      customAttributeIds: string[];
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

      const items = [
        ...eventIds.map((id) => ({ qa_round_id: round.id, target_type: "event", target_id: id })),
        ...customAttributeIds.map((id) => ({
          qa_round_id: round.id,
          target_type: "custom_attribute",
          target_id: id,
        })),
      ];
      if (items.length > 0) {
        const { error: itemsError } = await db.from("qa_round_checklist_items").insert(items);
        if (itemsError) throw itemsError;
      }
      return round as QaRound;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-rounds", environmentId] });
    },
  });
}

export function useOverrideChecklistResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      resultId,
      finalStatus,
      overriddenBy,
      overrideReason,
    }: {
      resultId: string;
      finalStatus: "passed" | "failed" | "not_collected";
      overriddenBy: string;
      overrideReason: string;
    }) => {
      const { error } = await db
        .from("qa_checklist_item_results")
        .update({
          final_status: finalStatus,
          overridden_by: overriddenBy,
          overridden_at: new Date().toISOString(),
          override_reason: overrideReason,
        })
        .eq("id", resultId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items"] });
    },
  });
}
