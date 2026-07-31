import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchBrazeAttributeSnapshot } from "@/lib/attribute-snapshot.functions";

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

export type QaSession = {
  id: string;
  qa_round_id: string;
  name: string;
  started_by: string;
  started_at: string;
  ended_at: string | null;
};

export type QaChecklistItem = {
  id: string;
  qa_session_id: string;
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

export function useQaSessions(roundId: string) {
  return useQuery({
    queryKey: ["qa-sessions", roundId],
    enabled: Boolean(roundId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_sessions")
        .select("*")
        .eq("qa_round_id", roundId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data as QaSession[];
    },
  });
}

export function useCreateQaSession(roundId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, name }: { userId: string; name: string }) => {
      const { data, error } = await db
        .from("qa_sessions")
        .insert({ qa_round_id: roundId, name, started_by: userId })
        .select()
        .single();
      if (error) throw error;
      return data as QaSession;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-sessions", roundId] });
    },
  });
}

export function useQaChecklistItems(sessionId: string) {
  return useQuery({
    queryKey: ["qa-checklist-items", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_round_checklist_items")
        .select("*, qa_checklist_item_results(*)")
        .eq("qa_session_id", sessionId);
      if (error) throw error;
      return data as (QaChecklistItem & { qa_checklist_item_results: QaChecklistItemResult[] })[];
    },
  });
}

export function useAddChecklistItems(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      eventIds,
      customAttributeIds,
    }: {
      eventIds: string[];
      customAttributeIds: string[];
    }) => {
      const items = [
        ...eventIds.map((id) => ({
          qa_session_id: sessionId,
          target_type: "event",
          target_id: id,
        })),
        ...customAttributeIds.map((id) => ({
          qa_session_id: sessionId,
          target_type: "custom_attribute",
          target_id: id,
        })),
      ];
      if (items.length === 0) return;
      const { error } = await db.from("qa_round_checklist_items").upsert(items, {
        onConflict: "qa_session_id,target_type,target_id",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
    },
  });
}

export function useRemoveChecklistItem(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await db.from("qa_round_checklist_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
    },
  });
}

export type QaAttributeSnapshot = {
  id: string;
  qa_session_id: string;
  external_user_id: string;
  snapshot_name: string;
  status: "requesting" | "captured" | "failed";
  payload: Record<string, unknown> | null;
  previous_snapshot_id: string | null;
  requested_at: string;
  captured_at: string | null;
};

export function useQaAttributeSnapshots(sessionId: string) {
  return useQuery({
    queryKey: ["qa-attribute-snapshots", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_attribute_snapshots")
        .select("*")
        .eq("qa_session_id", sessionId)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return data as QaAttributeSnapshot[];
    },
  });
}

export function useCaptureAttributeSnapshot(sessionId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ brazeId, snapshotName }: { brazeId: string; snapshotName: string }) => {
      const { data: row, error: insertError } = await db
        .from("qa_attribute_snapshots")
        .insert({
          qa_session_id: sessionId,
          external_user_id: brazeId,
          snapshot_name: snapshotName,
          status: "requesting",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const result = await fetchBrazeAttributeSnapshot({ data: { projectId, brazeId } });

      if (!result.ok) {
        await db.from("qa_attribute_snapshots").update({ status: "failed" }).eq("id", row.id);
        throw new Error(result.error);
      }

      const { error: updateError } = await db
        .from("qa_attribute_snapshots")
        .update({
          status: "captured",
          payload: result.attributes,
          captured_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-attribute-snapshots", sessionId] });
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
