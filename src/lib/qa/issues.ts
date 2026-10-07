import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/qa/db";
import type { QaDiscussion, ProjectQaIssue } from "@/lib/qa/types";

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
