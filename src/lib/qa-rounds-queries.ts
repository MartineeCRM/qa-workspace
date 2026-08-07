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
import { dedupeRunEvents } from "@/lib/run-events-csv";
import {
  deriveSessionStepFromRow,
  flattenChecklistCoverageRounds,
  normalizeChecklistExecution,
  summarizeRoundValidationItems,
  type ChecklistCoverageRow,
} from "@/lib/qa-workflow";

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
  qa_channel_id: string | null;
};

export type QaChannel = {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

export function useQaChannels(projectId: string, activeOnly = true) {
  return useQuery({
    queryKey: ["qa-channels", projectId, activeOnly],
    enabled: Boolean(projectId),
    queryFn: async () => {
      let query = db
        .from("qa_channels")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order");
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data as QaChannel[];
    },
  });
}

export function useQaChannelExclusions(eventIds: string[], propertyIds: string[]) {
  return useQuery({
    queryKey: ["qa-channel-exclusions", eventIds, propertyIds],
    queryFn: async () => {
      const [eventsResult, propertiesResult] = await Promise.all([
        eventIds.length > 0
          ? db
              .from("taxonomy_event_channel_exclusions")
              .select("event_id, channel_id")
              .in("event_id", eventIds)
          : Promise.resolve({ data: [], error: null }),
        propertyIds.length > 0
          ? db
              .from("taxonomy_property_channel_exclusions")
              .select("property_id, channel_id")
              .in("property_id", propertyIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (eventsResult.error) throw eventsResult.error;
      if (propertiesResult.error) throw propertiesResult.error;
      return {
        events: new Set<string>(
          (eventsResult.data ?? []).map(
            (row: { event_id: string; channel_id: string }) => `${row.event_id}:${row.channel_id}`,
          ),
        ),
        properties: new Set<string>(
          (propertiesResult.data ?? []).map(
            (row: { property_id: string; channel_id: string }) =>
              `${row.property_id}:${row.channel_id}`,
          ),
        ),
      };
    },
  });
}

export type QaChecklistItem = {
  id: string;
  qa_session_id: string;
  target_type: "event" | "custom_attribute";
  target_id: string;
  created_at: string;
  executed_at: string | null;
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
      const rows = data as (QaChecklistItemWithDisposition & {
        qa_checklist_item_results: QaChecklistItemResult[];
      })[];
      return rows.map(normalizeChecklistExecution);
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
          executed_at: new Date().toISOString(),
        })),
        ...customAttributeIds.map((id) => ({
          qa_session_id: sessionId,
          target_type: "custom_attribute",
          target_id: id,
          executed_at: new Date().toISOString(),
        })),
      ];
      if (items.length === 0) return;
      const { error } = await db.from("qa_round_checklist_items").upsert(items, {
        onConflict: "qa_session_id,target_type,target_id",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
    },
  });
}

export function useMarkChecklistItemExecuted(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await db
        .from("qa_round_checklist_items")
        .update({ executed_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] }),
  });
}

export function useRemoveChecklistItem(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemIds: string | string[]) => {
      const ids = Array.isArray(itemIds) ? itemIds : [itemIds];
      if (ids.length === 0) return;
      const { error } = await db.from("qa_round_checklist_items").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
    },
  });
}

export function useResetChecklist(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from("qa_round_checklist_items")
        .delete()
        .eq("qa_session_id", sessionId);
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
        const { error: failError } = await db
          .from("qa_attribute_snapshots")
          .update({ status: "failed" })
          .eq("id", row.id);
        // Swallowing this would leave the row stuck at "requesting" forever with no
        // visible reason why — surface it alongside the real failure instead.
        if (failError) console.error("Failed to mark snapshot as failed:", failError);
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

export type QaRunEvent = {
  id: string;
  qa_session_id: string;
  source_event_id?: string | null;
  event_id: string | null;
  raw_event_name: string;
  occurred_at: string;
  created_at: string;
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
      return dedupeRunEvents(data as QaRunEvent[]);
    },
  });
}

export function useUploadRunEventsLog(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      rows: Array<{
        source_event_id: string;
        event_id: string | null;
        raw_event_name: string;
        occurred_at: string;
        external_user_id: string;
        raw_properties: Record<string, unknown>;
      }>,
    ) => {
      if (rows.length === 0) return;
      const { error } = await db.from("qa_run_events").upsert(
        rows.map((r) => ({ ...r, qa_session_id: sessionId })),
        {
          onConflict: "qa_session_id,source_event_id",
          ignoreDuplicates: true,
        },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-run-events", sessionId] });
    },
  });
}

export function useResetQaRunEvents(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await db.from("qa_run_events").delete().eq("qa_session_id", sessionId);
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
      onProgress?: (completed: number, total: number) => void;
    }) => {
      const itemsToJudge = input.checklistItems.filter(
        (item) => !item.qa_checklist_item_results?.[0]?.overridden_by,
      );
      if (itemsToJudge.length === 0) return;
      let completed = 0;
      input.onProgress?.(completed, itemsToJudge.length);
      const results = [];
      const batchSize = 3;
      for (let offset = 0; offset < itemsToJudge.length; offset += batchSize) {
        const batch = itemsToJudge.slice(offset, offset + batchSize);
        results.push(
          ...(await Promise.all(
            batch.map(async (item) => {
              try {
                return await judgeChecklistItem(item, input);
              } finally {
                completed += 1;
                input.onProgress?.(completed, itemsToJudge.length);
              }
            }),
          )),
        );
      }
      const { error } = await db
        .from("qa_checklist_item_results")
        .upsert(results, { onConflict: "checklist_item_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
      qc.invalidateQueries({ queryKey: ["project-checklist-coverage"] });
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
    }: {
      itemId: string;
      disposition: "passed_override" | "discussing";
    }) => {
      const { error } = await db.rpc("set_qa_checklist_disposition", {
        _item_id: itemId,
        _disposition: disposition,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
      qc.invalidateQueries({ queryKey: ["project-checklist-coverage"] });
    },
  });
}

export function useCarryOverItems(environmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      assigneeId,
    }: {
      items: Array<{ id: string }>;
      assigneeId: string | null;
    }) => {
      if (items.length === 0) return;
      const { error } = await db.rpc("carry_over_qa_checklist_items", {
        _item_ids: items.map((item) => item.id),
        _assignee_id: assigneeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items"] });
      qc.invalidateQueries({ queryKey: ["qa-sessions"] });
      qc.invalidateQueries({ queryKey: ["qa-rounds", environmentId] });
      qc.invalidateQueries({ queryKey: ["project-checklist-coverage"] });
    },
  });
}

export type QaDiscussionComment = {
  id: string;
  discussion_id: string;
  author_id: string | null;
  external_author_name: string | null;
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
  target_type: "event" | "property" | "custom_attribute";
  target_id: string;
  target_label: string;
  workflow_status: "open" | "talk" | "fixing" | "done" | "dismissed" | "verified";
  workflow_updated_by: string | null;
  workflow_updated_by_external_name: string | null;
  updated_at: string;
  qa_discussion_comments: QaDiscussionComment[];
};

export function useQaDiscussions(resultId: string) {
  return useQuery({
    queryKey: ["qa-discussions", resultId],
    enabled: Boolean(resultId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_discussions")
        .select("*, qa_discussion_comments(*)")
        .eq("checklist_item_result_id", resultId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as QaDiscussion[];
    },
  });
}

export function useCreateQaIssue(resultId: string, userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (target: {
      type: "event" | "property" | "custom_attribute";
      id: string;
      label: string;
    }) => {
      if (!userId) throw new Error("로그인이 필요해요");
      const { error } = await db.from("qa_discussions").upsert(
        {
          checklist_item_result_id: resultId,
          target_type: target.type,
          target_id: target.id,
          target_label: target.label,
          workflow_status: "open",
          created_by: userId,
        },
        { onConflict: "checklist_item_result_id,target_type,target_id", ignoreDuplicates: true },
      );
      if (error) throw error;
      const { data, error: readError } = await db
        .from("qa_discussions")
        .select("*, qa_discussion_comments(*)")
        .eq("checklist_item_result_id", resultId)
        .eq("target_type", target.type)
        .eq("target_id", target.id)
        .single();
      if (readError) throw readError;
      return data as QaDiscussion;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-discussions", resultId] });
      qc.invalidateQueries({ queryKey: ["project-qa-issues"] });
      qc.invalidateQueries({ queryKey: ["qa-round-validation-summary"] });
    },
  });
}

export function usePendingCarryOverItems(
  sessionId: string,
  previousRoundId: string | null,
  channelId: string | null,
) {
  return useQuery({
    queryKey: ["qa-pending-carryover", sessionId, previousRoundId, channelId],
    enabled: Boolean(sessionId && previousRoundId),
    queryFn: async () => {
      let previousSessionsQuery = db
        .from("qa_sessions")
        .select("id")
        .eq("qa_round_id", previousRoundId);
      previousSessionsQuery = channelId
        ? previousSessionsQuery.eq("qa_channel_id", channelId)
        : previousSessionsQuery.is("qa_channel_id", null);
      const { data: prevSessions, error: prevSessionsError } = await previousSessionsQuery;
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
      discussionId,
      body,
      authorId,
    }: {
      discussionId: string;
      body: string;
      authorId: string;
    }) => {
      const { error } = await db.from("qa_discussion_comments").insert({
        discussion_id: discussionId,
        author_id: authorId,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-discussions", resultId] });
      qc.invalidateQueries({ queryKey: ["project-qa-issues"] });
    },
  });
}

export function useUpdateDiscussionComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, body }: { commentId: string; body: string }) => {
      const { error } = await db
        .from("qa_discussion_comments")
        .update({ body: body.trim() })
        .eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-discussions"] });
      qc.invalidateQueries({ queryKey: ["project-qa-issues"] });
    },
  });
}

export type ProjectQaIssue = QaDiscussion & {
  checklist_item_id: string;
  event_id: string;
  qa_session_id: string;
  qa_channel_id: string | null;
  session_name: string;
  qa_environment_id: string;
  round_id: string;
  round_number: number;
};

export function useProjectQaIssues(projectId: string) {
  return useQuery({
    queryKey: ["project-qa-issues", projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ProjectQaIssue[]> => {
      const { data: rounds, error: roundsError } = await db
        .from("qa_rounds")
        .select("id, qa_environment_id, round_number")
        .eq("project_id", projectId);
      if (roundsError) throw roundsError;
      type IssueRoundRow = { id: string; qa_environment_id: string; round_number: number };
      type IssueSessionRow = {
        id: string;
        qa_round_id: string;
        qa_channel_id: string | null;
        name: string;
      };
      type IssueItemRow = { id: string; qa_session_id: string; target_id: string };
      type IssueResultRow = { id: string; checklist_item_id: string };
      const roundById = new Map<string, IssueRoundRow>(
        (rounds ?? []).map((r: { id: string; qa_environment_id: string; round_number: number }) => [
          r.id,
          r,
        ]),
      );
      if (roundById.size === 0) return [];

      const { data: sessions, error: sessionsError } = await db
        .from("qa_sessions")
        .select("id, qa_round_id, qa_channel_id, name")
        .in("qa_round_id", [...roundById.keys()]);
      if (sessionsError) throw sessionsError;
      const sessionById = new Map<string, IssueSessionRow>(
        (sessions ?? []).map((s: IssueSessionRow) => [s.id, s]),
      );
      if (sessionById.size === 0) return [];

      const { data: items, error: itemsError } = await db
        .from("qa_round_checklist_items")
        .select("id, qa_session_id, target_id")
        .in("qa_session_id", [...sessionById.keys()]);
      if (itemsError) throw itemsError;
      const itemById = new Map<string, IssueItemRow>(
        (items ?? []).map((i: { id: string; qa_session_id: string; target_id: string }) => [
          i.id,
          i,
        ]),
      );
      if (itemById.size === 0) return [];

      const { data: results, error: resultsError } = await db
        .from("qa_checklist_item_results")
        .select("id, checklist_item_id")
        .in("checklist_item_id", [...itemById.keys()]);
      if (resultsError) throw resultsError;
      const resultById = new Map<string, IssueResultRow>(
        (results ?? []).map((r: { id: string; checklist_item_id: string }) => [r.id, r]),
      );
      if (resultById.size === 0) return [];

      const { data: issues, error: issuesError } = await db
        .from("qa_discussions")
        .select("*, qa_discussion_comments(*)")
        .in("checklist_item_result_id", [...resultById.keys()])
        .order("created_at", { ascending: false });
      if (issuesError) throw issuesError;

      return (issues ?? []).flatMap((issue: QaDiscussion) => {
        const result = resultById.get(issue.checklist_item_result_id);
        const item = result ? itemById.get(result.checklist_item_id) : undefined;
        const session = item ? sessionById.get(item.qa_session_id) : undefined;
        const round = session ? roundById.get(session.qa_round_id) : undefined;
        if (!result || !item || !session || !round) return [];
        return [
          {
            ...issue,
            checklist_item_id: item.id,
            event_id: item.target_id,
            qa_session_id: session.id,
            qa_channel_id: session.qa_channel_id,
            session_name: session.name,
            qa_environment_id: round.qa_environment_id,
            round_id: session.qa_round_id,
            round_number: round.round_number,
          },
        ];
      });
    },
  });
}

export function useUpdateQaIssue(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      issueId,
      status,
      userId,
    }: {
      issueId: string;
      status: ProjectQaIssue["workflow_status"];
      userId: string;
    }) => {
      const { error } = await db
        .from("qa_discussions")
        .update({
          workflow_status: status,
          workflow_updated_by: userId,
          workflow_updated_by_external_name: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", issueId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-qa-issues", projectId] });
      qc.invalidateQueries({ queryKey: ["qa-checklist-items"] });
      qc.invalidateQueries({ queryKey: ["project-checklist-coverage"] });
    },
  });
}

export function useSubmitQaIssues(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (issues: ProjectQaIssue[]) => {
      const bySession = new Map<string, ProjectQaIssue[]>();
      for (const issue of issues) {
        bySession.set(issue.qa_session_id, [...(bySession.get(issue.qa_session_id) ?? []), issue]);
      }
      for (const sessionIssues of bySession.values()) {
        const { error } = await db.rpc("carry_over_qa_checklist_items", {
          _item_ids: [...new Set(sessionIssues.map((issue) => issue.checklist_item_id))],
          _assignee_id: null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-qa-issues", projectId] });
      qc.invalidateQueries({ queryKey: ["qa-checklist-items"] });
      qc.invalidateQueries({ queryKey: ["qa-rounds"] });
      qc.invalidateQueries({ queryKey: ["project-checklist-coverage"] });
    },
  });
}

export function useDeleteQaIssue(projectId: string, resultId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (issueId: string) => {
      const { data, error } = await db
        .from("qa_discussions")
        .delete()
        .eq("id", issueId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("이슈를 삭제할 권한이 없거나 이미 삭제된 이슈예요.");
    },
    onSuccess: () => {
      if (resultId) qc.invalidateQueries({ queryKey: ["qa-discussions", resultId] });
      qc.invalidateQueries({ queryKey: ["project-qa-issues", projectId] });
      qc.invalidateQueries({ queryKey: ["qa-round-validation-summary"] });
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

export type RoundHistoryEntry = {
  roundNumber: number;
  reasoning: string | null;
  evidence?: unknown;
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
            "carried_from_item_id, qa_sessions(qa_rounds(round_number)), qa_checklist_item_results(ai_reasoning, ai_evidence, final_status)",
          )
          .eq("id", currentId)
          .maybeSingle();
        if (error) throw error;
        if (!item) break;
        const result = item.qa_checklist_item_results?.[0];
        history.push({
          roundNumber: item.qa_sessions?.qa_rounds?.round_number ?? 0,
          reasoning: result?.ai_reasoning ?? null,
          evidence: result?.ai_evidence ?? null,
          finalStatus: result?.final_status ?? "not_collected",
        });
        currentId = item.carried_from_item_id;
      }
      return history;
    },
  });
}

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
