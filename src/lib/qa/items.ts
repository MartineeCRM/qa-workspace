import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/qa/db";
import type {
  QaChecklistItem,
  QaChecklistItemResult,
  QaChecklistItemWithDisposition,
  RoundHistoryEntry,
} from "@/lib/qa/types";
import { judgeChecklistItem } from "@/lib/checklist-analysis";
import type { AttributeSnapshot, RunEvent } from "@/lib/checklist-judge";
import type {
  TaxonomyCustomAttribute,
  TaxonomyEvent,
  TaxonomyEventProperty,
  ValidationRule,
} from "@/lib/queries";
import { normalizeChecklistExecution } from "@/lib/qa-workflow";

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
      shouldCancel?: () => boolean;
    }) => {
      const itemsToJudge = input.checklistItems.filter(
        (item) => !item.qa_checklist_item_results?.[0]?.overridden_by,
      );
      if (itemsToJudge.length === 0) return { cancelled: false, completed: 0, total: 0 };
      let completed = 0;
      input.onProgress?.(completed, itemsToJudge.length);
      const batchSize = 1;
      for (let offset = 0; offset < itemsToJudge.length; offset += batchSize) {
        if (input.shouldCancel?.()) {
          return { cancelled: true, completed, total: itemsToJudge.length };
        }
        const batch = itemsToJudge.slice(offset, offset + batchSize);
        const results = await Promise.all(
          batch.map(async (item) => {
            try {
              return await judgeChecklistItem(item, input);
            } finally {
              completed += 1;
              input.onProgress?.(completed, itemsToJudge.length);
            }
          }),
        );
        const { error } = await db
          .from("qa_checklist_item_results")
          .upsert(results, { onConflict: "checklist_item_id" });
        if (error) throw error;
        if (input.shouldCancel?.()) {
          return { cancelled: true, completed, total: itemsToJudge.length };
        }
      }
      return { cancelled: false, completed, total: itemsToJudge.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
      qc.invalidateQueries({ queryKey: ["project-checklist-coverage"] });
    },
  });
}

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
