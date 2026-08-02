import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchBrazeAttributeSnapshot } from "@/lib/attribute-snapshot.functions";
import { judgeChecklistItem } from "@/lib/checklist-analysis";
import type { AttributeSnapshot, RunEvent } from "@/lib/checklist-judge";
import type {
  TaxonomyCustomAttribute,
  TaxonomyEvent,
  TaxonomyEventProperty,
  ValidationRule,
} from "@/lib/queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QaRound = {
  id: string;
  project_id: string;
  qa_environment_id: string;
  round_number: number;
  name: string | null;
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
  judged_by: "rule" | "ai" | null;
  overridden_by: string | null;
  overridden_at: string | null;
  override_reason: string | null;
  updated_at: string;
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
        .order("round_number", { ascending: true });
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
      return data as (QaChecklistItemWithDisposition & {
        qa_checklist_item_results: QaChecklistItemResult[];
      })[];
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

export type QaRunEvent = {
  id: string;
  qa_session_id: string;
  event_id: string | null;
  raw_event_name: string;
  occurred_at: string;
  external_user_id: string;
  raw_properties: Record<string, unknown>;
};

export function useQaRunEvents(sessionId: string) {
  return useQuery({
    queryKey: ["qa-run-events", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_run_events")
        .select("*")
        .eq("qa_session_id", sessionId)
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return data as QaRunEvent[];
    },
  });
}

export function useUploadRunEventsLog(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      rows: Array<{
        event_id: string | null;
        raw_event_name: string;
        occurred_at: string;
        external_user_id: string;
        raw_properties: Record<string, unknown>;
      }>,
    ) => {
      if (rows.length === 0) return;
      const { error } = await db
        .from("qa_run_events")
        .insert(rows.map((r) => ({ ...r, qa_session_id: sessionId })));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-run-events", sessionId] });
    },
  });
}

export function useAnalyzeChecklist(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      // Accepts the joined shape returned by useQaChecklistItems (item + its existing
      // result row, if any) so we can skip re-judging items a QA lead already overrode —
      // re-running analysis must not strand stale overridden_by/overridden_at/override_reason
      // metadata under a freshly-computed final_status.
      checklistItems: Array<
        QaChecklistItem & { qa_checklist_item_results?: QaChecklistItemResult[] }
      >;
      events: TaxonomyEvent[];
      eventProperties: TaxonomyEventProperty[];
      customAttributes: TaxonomyCustomAttribute[];
      rules: ValidationRule[];
      runEvents: RunEvent[];
      snapshots: AttributeSnapshot[];
    }) => {
      const itemsToJudge = input.checklistItems.filter(
        (item) => !item.qa_checklist_item_results?.[0]?.overridden_by,
      );
      if (itemsToJudge.length === 0) return;
      const results = await Promise.all(
        itemsToJudge.map((item) => judgeChecklistItem(item, input)),
      );
      const { error } = await db
        .from("qa_checklist_item_results")
        .upsert(results, { onConflict: "checklist_item_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
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

export type ChecklistDisposition = "unresolved" | "passed_override" | "carried_over" | "discussing";

export type QaChecklistItemWithDisposition = QaChecklistItem & {
  disposition: ChecklistDisposition;
  carried_from_item_id: string | null;
  assigned_to: string | null;
  disposed_by: string | null;
  disposed_at: string | null;
};

export function useSetDisposition(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      disposition,
      userId,
    }: {
      itemId: string;
      disposition: "passed_override" | "discussing";
      userId: string;
    }) => {
      const { error } = await db
        .from("qa_round_checklist_items")
        .update({ disposition, disposed_by: userId, disposed_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
    },
  });
}

export function useCarryOverItems(environmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      userId,
      assigneeId,
    }: {
      items: Array<{
        id: string;
        qa_session_id: string;
        target_type: "event" | "custom_attribute";
        target_id: string;
      }>;
      userId: string;
      assigneeId: string | null;
    }) => {
      if (items.length === 0) return;
      const sessionId = items[0].qa_session_id;

      const { data: session, error: sessionError } = await db
        .from("qa_sessions")
        .select("qa_round_id")
        .eq("id", sessionId)
        .single();
      if (sessionError) throw sessionError;

      const { data: round, error: roundError } = await db
        .from("qa_rounds")
        .select("qa_environment_id, project_id, round_number")
        .eq("id", session.qa_round_id)
        .single();
      if (roundError) throw roundError;

      const { data: existingNextRound, error: nextRoundError } = await db
        .from("qa_rounds")
        .select("id")
        .eq("qa_environment_id", round.qa_environment_id)
        .eq("round_number", round.round_number + 1)
        .maybeSingle();
      if (nextRoundError) throw nextRoundError;

      let nextRoundId: string = existingNextRound?.id;
      if (!nextRoundId) {
        const { data: createdRound, error: createRoundError } = await db
          .from("qa_rounds")
          .insert({
            project_id: round.project_id,
            qa_environment_id: round.qa_environment_id,
            round_number: round.round_number + 1,
            previous_round_id: session.qa_round_id,
            started_by: userId,
          })
          .select()
          .single();
        if (createRoundError) throw createRoundError;
        nextRoundId = createdRound.id;
      }

      // qa_sessions_round_name_uq (qa_round_id, name) makes this atomic: concurrent
      // carry-overs racing to create the "이월 항목" session for the same round will
      // converge on a single row instead of splitting items across duplicates.
      // ignoreDuplicates (DO NOTHING) is required here instead of the default merge
      // (DO UPDATE): without it, every re-run against an already-existing session would
      // silently overwrite started_by to whoever's carry-over ran most recently,
      // clobbering the original creator's id. DO NOTHING means Postgres's RETURNING
      // clause omits the row when it already existed, so we can't chain .select() on
      // the upsert itself — instead we fetch the id with a separate plain select
      // afterward, which the unique constraint guarantees will find the row either way.
      const { error: nextSessionError } = await db
        .from("qa_sessions")
        .upsert(
          { qa_round_id: nextRoundId, name: "이월 항목", started_by: userId },
          { onConflict: "qa_round_id,name", ignoreDuplicates: true },
        );
      if (nextSessionError) throw nextSessionError;

      const { data: nextSession, error: nextSessionFetchError } = await db
        .from("qa_sessions")
        .select("id")
        .eq("qa_round_id", nextRoundId)
        .eq("name", "이월 항목")
        .single();
      if (nextSessionFetchError) throw nextSessionFetchError;
      const nextSessionId: string = nextSession.id;

      const rows = items.map((item) => ({
        qa_session_id: nextSessionId,
        target_type: item.target_type,
        target_id: item.target_id,
        carried_from_item_id: item.id,
        assigned_to: assigneeId,
      }));
      const { error: insertError } = await db.from("qa_round_checklist_items").upsert(rows, {
        onConflict: "qa_session_id,target_type,target_id",
        ignoreDuplicates: true,
      });
      if (insertError) throw insertError;

      const { error: dispositionError } = await db
        .from("qa_round_checklist_items")
        .update({
          disposition: "carried_over",
          disposed_by: userId,
          disposed_at: new Date().toISOString(),
        })
        .in(
          "id",
          items.map((i) => i.id),
        );
      if (dispositionError) throw dispositionError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items"] });
      qc.invalidateQueries({ queryKey: ["qa-sessions"] });
      qc.invalidateQueries({ queryKey: ["qa-rounds", environmentId] });
    },
  });
}

export type QaDiscussionComment = {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  is_resolution: boolean;
  created_at: string;
};

export type QaDiscussion = {
  id: string;
  checklist_item_result_id: string;
  status: "open" | "resolved";
  created_by: string;
  created_at: string;
  qa_discussion_comments: QaDiscussionComment[];
};

export function useQaDiscussion(resultId: string) {
  return useQuery({
    queryKey: ["qa-discussion", resultId],
    enabled: Boolean(resultId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_discussions")
        .select("*, qa_discussion_comments(*)")
        .eq("checklist_item_result_id", resultId)
        .maybeSingle();
      if (error) throw error;
      return data as QaDiscussion | null;
    },
  });
}

export function usePendingCarryOverItems(sessionId: string, previousRoundId: string | null) {
  return useQuery({
    queryKey: ["qa-pending-carryover", sessionId, previousRoundId],
    enabled: Boolean(sessionId && previousRoundId),
    queryFn: async () => {
      const { data: prevSessions, error: prevSessionsError } = await db
        .from("qa_sessions")
        .select("id")
        .eq("qa_round_id", previousRoundId);
      if (prevSessionsError) throw prevSessionsError;
      const prevSessionIds = (prevSessions ?? []).map((s: { id: string }) => s.id);
      if (prevSessionIds.length === 0) return [];

      const { data: carried, error: carriedError } = await db
        .from("qa_round_checklist_items")
        .select("id, target_type, target_id")
        .in("qa_session_id", prevSessionIds)
        .eq("disposition", "carried_over");
      if (carriedError) throw carriedError;

      const { data: alreadyLinked, error: linkedError } = await db
        .from("qa_round_checklist_items")
        .select("carried_from_item_id")
        .eq("qa_session_id", sessionId)
        .not("carried_from_item_id", "is", null);
      if (linkedError) throw linkedError;
      const linkedIds = new Set(
        (alreadyLinked ?? []).map((r: { carried_from_item_id: string }) => r.carried_from_item_id),
      );

      return (carried ?? []).filter((c: { id: string }) => !linkedIds.has(c.id)) as Array<{
        id: string;
        target_type: "event" | "custom_attribute";
        target_id: string;
      }>;
    },
  });
}

export function useAdoptCarryOverItems(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      items: Array<{ id: string; target_type: "event" | "custom_attribute"; target_id: string }>,
    ) => {
      if (items.length === 0) return;
      const rows = items.map((item) => ({
        qa_session_id: sessionId,
        target_type: item.target_type,
        target_id: item.target_id,
        carried_from_item_id: item.id,
      }));
      const { error } = await db.from("qa_round_checklist_items").upsert(rows, {
        onConflict: "qa_session_id,target_type,target_id",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
      qc.invalidateQueries({ queryKey: ["qa-pending-carryover", sessionId] });
    },
  });
}

export function useAddDiscussionComment(resultId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      body,
      discussionId,
    }: {
      userId: string;
      body: string;
      discussionId: string | null;
    }) => {
      let id = discussionId;
      if (!id) {
        const { data, error } = await db
          .from("qa_discussions")
          .insert({ checklist_item_result_id: resultId, created_by: userId })
          .select()
          .single();
        if (error) throw error;
        id = data.id;
      }
      const { error: commentError } = await db
        .from("qa_discussion_comments")
        .insert({ discussion_id: id, author_id: userId, body });
      if (commentError) throw commentError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-discussion", resultId] });
    },
  });
}

export function useRoundDispositionSummary(roundId: string) {
  return useQuery({
    queryKey: ["qa-round-disposition-summary", roundId],
    enabled: Boolean(roundId),
    queryFn: async () => {
      const { data: sessions, error: sessionsError } = await db
        .from("qa_sessions")
        .select("id")
        .eq("qa_round_id", roundId);
      if (sessionsError) throw sessionsError;
      const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
      if (sessionIds.length === 0) {
        return { passed: 0, unresolvedErrors: 0, carriedOver: 0 };
      }

      const { data: items, error: itemsError } = await db
        .from("qa_round_checklist_items")
        .select("id, disposition, qa_checklist_item_results(final_status)")
        .in("qa_session_id", sessionIds);
      if (itemsError) throw itemsError;

      let passed = 0;
      let unresolvedErrors = 0;
      let carriedOver = 0;
      for (const item of items ?? []) {
        const finalStatus = item.qa_checklist_item_results?.[0]?.final_status ?? "not_collected";
        if (item.disposition === "carried_over") carriedOver += 1;
        if (item.disposition === "passed_override" || finalStatus === "passed") passed += 1;
        else if (item.disposition === "unresolved" && finalStatus !== "passed")
          unresolvedErrors += 1;
      }
      return { passed, unresolvedErrors, carriedOver };
    },
  });
}

export type RoundHistoryEntry = {
  roundNumber: number;
  reasoning: string | null;
  finalStatus: "passed" | "failed" | "not_collected";
};

export function useChecklistItemRoundHistory(itemId: string) {
  return useQuery({
    queryKey: ["qa-item-round-history", itemId],
    enabled: Boolean(itemId),
    queryFn: async () => {
      const history: RoundHistoryEntry[] = [];
      let currentId: string | null = itemId;
      while (currentId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: item, error }: { data: any; error: unknown } = await db
          .from("qa_round_checklist_items")
          .select(
            "carried_from_item_id, qa_sessions(qa_rounds(round_number)), qa_checklist_item_results(ai_reasoning, final_status)",
          )
          .eq("id", currentId)
          .maybeSingle();
        if (error) throw error;
        if (!item) break;
        const result = item.qa_checklist_item_results?.[0];
        history.push({
          roundNumber: item.qa_sessions?.qa_rounds?.round_number ?? 0,
          reasoning: result?.ai_reasoning ?? null,
          finalStatus: result?.final_status ?? "not_collected",
        });
        currentId = item.carried_from_item_id;
      }
      return history;
    },
  });
}
