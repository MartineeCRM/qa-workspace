import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/qa/db";
import type { QaAttributeSnapshot, QaRunEvent } from "@/lib/qa/types";
import { fetchBrazeAttributeSnapshot } from "@/lib/attribute-snapshot.functions";
import { dedupeRunEvents } from "@/lib/run-events-csv";

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
