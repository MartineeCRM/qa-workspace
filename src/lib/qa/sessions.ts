import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/qa/db";
import type { QaSession } from "@/lib/qa/types";
import { deriveSessionStepFromRow } from "@/lib/qa-workflow";

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

// One nested select for every session in the round so a round view with N session
// cards doesn't need N separate useQaChecklistItems/useQaRunEvents query pairs.
export function useQaSessionSteps(roundId: string) {
  return useQuery({
    queryKey: ["qa-session-steps", roundId],
    enabled: Boolean(roundId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_sessions")
        .select("id, qa_round_checklist_items(qa_checklist_item_results(id)), qa_run_events(id)")
        .eq("qa_round_id", roundId);
      if (error) throw error;
      const steps = new Map<string, 1 | 2 | 3>();
      for (const row of data ?? []) {
        steps.set(row.id, deriveSessionStepFromRow(row));
      }
      return steps;
    },
  });
}

export function useCreateQaSession(roundId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      name,
      channelId,
    }: {
      userId: string;
      name: string;
      channelId: string;
    }) => {
      const { data, error } = await db
        .from("qa_sessions")
        .insert({ qa_round_id: roundId, name, qa_channel_id: channelId, started_by: userId })
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

export function useDeleteQaSession(roundId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await db.from("qa_sessions").delete().eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-sessions", roundId] });
    },
  });
}

export function useSetQaSessionChannel(roundId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, channelId }: { sessionId: string; channelId: string }) => {
      const { error } = await db
        .from("qa_sessions")
        .update({ qa_channel_id: channelId })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-sessions", roundId] });
      qc.invalidateQueries({ queryKey: ["project-checklist-coverage"] });
      qc.invalidateQueries({ queryKey: ["project-qa-issues"] });
    },
  });
}

export function useRenameQaSession(roundId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, name }: { sessionId: string; name: string }) => {
      const { error } = await db.from("qa_sessions").update({ name }).eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-sessions", roundId] });
      qc.invalidateQueries({ queryKey: ["project-qa-issues"] });
    },
  });
}

export function useEndQaSession(roundId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await db
        .from("qa_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-sessions", roundId] });
    },
  });
}
