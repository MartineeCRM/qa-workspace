import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/qa/db";
import type { QaDiscussion } from "@/lib/qa/types";

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
