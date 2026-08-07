import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUSES = new Set(["open", "talk", "fixing", "done"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readShare(token: string) {
  if (!UUID.test(token)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: share } = await db
    .from("qa_issue_shares")
    .select("*")
    .eq("token", token)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return share ?? null;
}

export const createIssueShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { discussionId: string }) => data)
  .handler(async ({ data, context }) => {
    if (!UUID.test(data.discussionId)) throw new Error("올바르지 않은 이슈예요.");
    const { data: issue, error } = await context.supabase
      .from("qa_discussions")
      .select("id")
      .eq("id", data.discussionId)
      .maybeSingle();
    if (error || !issue) throw new Error("이 이슈를 공유할 권한이 없어요.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: existing } = await db
      .from("qa_issue_shares")
      .select("token, expires_at")
      .eq("discussion_id", data.discussionId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (existing) return existing as { token: string; expires_at: string };

    const { data: created, error: createError } = await db
      .from("qa_issue_shares")
      .upsert(
        { discussion_id: data.discussionId, created_by: context.userId },
        { onConflict: "discussion_id" },
      )
      .select("token, expires_at")
      .single();
    if (createError) throw createError;
    return created as { token: string; expires_at: string };
  });

export const getSharedIssue = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const share = await readShare(data.token);
    if (!share) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: issue } = await db
      .from("qa_discussions")
      .select("*, qa_discussion_comments(*)")
      .eq("id", share.discussion_id)
      .single();
    if (!issue) return null;
    const { data: result } = await db
      .from("qa_checklist_item_results")
      .select("*")
      .eq("id", issue.checklist_item_result_id)
      .single();
    const { data: item } = await db
      .from("qa_round_checklist_items")
      .select("*")
      .eq("id", result.checklist_item_id)
      .single();
    const { data: session } = await db
      .from("qa_sessions")
      .select("*")
      .eq("id", item.qa_session_id)
      .single();
    const { data: round } = await db
      .from("qa_rounds")
      .select("*")
      .eq("id", session.qa_round_id)
      .single();
    const [
      { data: project },
      { data: environment },
      { data: channel },
      { data: externalComments },
    ] = await Promise.all([
      db.from("projects").select("name").eq("id", round.project_id).single(),
      db.from("qa_environments").select("name").eq("id", round.qa_environment_id).single(),
      session.qa_channel_id
        ? db.from("qa_channels").select("name").eq("id", session.qa_channel_id).single()
        : Promise.resolve({ data: null }),
      db.from("qa_issue_share_comments").select("*").eq("share_id", share.id).order("created_at"),
    ]);
    const authorIds = [
      ...new Set((issue.qa_discussion_comments ?? []).map((comment: any) => comment.author_id)),
    ];
    const { data: profiles } = authorIds.length
      ? await db.from("profiles").select("id, display_name, email").in("id", authorIds)
      : { data: [] };
    const authorById = new Map(
      (profiles ?? []).map((profile: any) => [profile.id, profile.display_name || profile.email]),
    );
    const { data: logs } =
      item.target_type === "event"
        ? await db
            .from("qa_run_events")
            .select("occurred_at, raw_properties")
            .eq("qa_session_id", session.id)
            .eq("event_id", item.target_id)
            .order("occurred_at", { ascending: false })
        : await db
            .from("qa_attribute_snapshots")
            .select("captured_at, payload")
            .eq("qa_session_id", session.id)
            .order("captured_at", { ascending: false });

    return {
      expiresAt: share.expires_at,
      projectName: project?.name ?? "QA Workspace",
      environmentName: environment?.name ?? "QA",
      channelName: channel?.name ?? null,
      sessionName: session.name,
      roundNumber: round.round_number,
      targetType: issue.target_type,
      targetLabel: issue.target_label,
      workflowStatus: issue.workflow_status,
      reasoning: result.ai_reasoning,
      evidence: result.ai_evidence,
      logs: logs ?? [],
      comments: [
        ...(issue.qa_discussion_comments ?? []).map((comment: any) => ({
          id: comment.id,
          author: authorById.get(comment.author_id) ?? "내부 담당자",
          body: comment.body,
          createdAt: comment.created_at,
          source: "internal",
        })),
        ...(externalComments ?? []).map((comment: any) => ({
          id: comment.id,
          author: comment.author_name,
          body: comment.body,
          createdAt: comment.created_at,
          source: "customer",
        })),
      ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  });

export const updateSharedIssue = createServerFn({ method: "POST" })
  .validator((data: { token: string; status: string }) => data)
  .handler(async ({ data }) => {
    if (!STATUSES.has(data.status)) throw new Error("올바르지 않은 상태예요.");
    const share = await readShare(data.token);
    if (!share) throw new Error("만료되었거나 비활성화된 링크예요.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("qa_discussions")
      .update({ workflow_status: data.status, updated_at: new Date().toISOString() })
      .eq("id", share.discussion_id);
    if (error) throw error;
    return { ok: true };
  });

export const commentOnSharedIssue = createServerFn({ method: "POST" })
  .validator((data: { token: string; authorName: string; body: string }) => data)
  .handler(async ({ data }) => {
    const authorName = data.authorName.trim();
    const body = data.body.trim();
    if (!authorName || authorName.length > 80 || !body || body.length > 5000)
      throw new Error("이름과 댓글 내용을 확인해주세요.");
    const share = await readShare(data.token);
    if (!share) throw new Error("만료되었거나 비활성화된 링크예요.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("qa_issue_share_comments").insert({
      share_id: share.id,
      author_name: authorName,
      body,
    });
    if (error) throw error;
    return { ok: true };
  });
