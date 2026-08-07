import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUSES = new Set(["open", "talk", "fixing", "done"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readPortal(token: string) {
  if (!UUID.test(token)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("qa_project_issue_shares")
    .select("*")
    .eq("token", token)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data ?? null;
}

async function readPortalIssue(token: string, discussionId: string) {
  const portal = await readPortal(token);
  if (!portal || !UUID.test(discussionId)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: issue } = await db
    .from("qa_discussions")
    .select("checklist_item_result_id")
    .eq("id", discussionId)
    .maybeSingle();
  const { data: result } = issue
    ? await db
        .from("qa_checklist_item_results")
        .select("checklist_item_id")
        .eq("id", issue.checklist_item_result_id)
        .maybeSingle()
    : { data: null };
  const { data: item } = result
    ? await db
        .from("qa_round_checklist_items")
        .select("qa_session_id")
        .eq("id", result.checklist_item_id)
        .maybeSingle()
    : { data: null };
  const { data: session } = item
    ? await db.from("qa_sessions").select("qa_round_id").eq("id", item.qa_session_id).maybeSingle()
    : { data: null };
  const { data: round } = session
    ? await db.from("qa_rounds").select("project_id").eq("id", session.qa_round_id).maybeSingle()
    : { data: null };
  return round?.project_id === portal.project_id ? { portal, issue } : null;
}

export const createProjectIssueShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data, context }) => {
    if (!UUID.test(data.projectId)) throw new Error("올바르지 않은 프로젝트예요.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: project } = await db
      .from("projects")
      .select("workspace_id")
      .eq("id", data.projectId)
      .maybeSingle();
    const { data: membership } = project
      ? await db
          .from("workspace_members")
          .select("user_id")
          .eq("workspace_id", project.workspace_id)
          .eq("user_id", context.userId)
          .maybeSingle()
      : { data: null };
    if (!membership) throw new Error("이 프로젝트를 공유할 권한이 없어요.");

    const { data: existing } = await db
      .from("qa_project_issue_shares")
      .select("token, expires_at")
      .eq("project_id", data.projectId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (existing) return existing as { token: string; expires_at: string };
    const { data: created, error } = await db
      .from("qa_project_issue_shares")
      .upsert(
        {
          project_id: data.projectId,
          created_by: context.userId,
          revoked_at: null,
          expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
        },
        { onConflict: "project_id" },
      )
      .select("token, expires_at")
      .single();
    if (error) throw error;
    return created as { token: string; expires_at: string };
  });

export const getSharedIssuePortal = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const portal = await readPortal(data.token);
    if (!portal) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: project } = await db
      .from("projects")
      .select("name")
      .eq("id", portal.project_id)
      .single();
    const { data: rounds } = await db
      .from("qa_rounds")
      .select("id, qa_environment_id, round_number")
      .eq("project_id", portal.project_id);
    const roundById = new Map((rounds ?? []).map((row: any) => [row.id, row]));
    if (!roundById.size)
      return {
        projectName: project?.name ?? "QA Workspace",
        expiresAt: portal.expires_at,
        issues: [],
      };
    const { data: sessions } = await db
      .from("qa_sessions")
      .select("id, qa_round_id, qa_channel_id, name")
      .in("qa_round_id", [...roundById.keys()]);
    const sessionById = new Map((sessions ?? []).map((row: any) => [row.id, row]));
    const { data: items } = sessionById.size
      ? await db
          .from("qa_round_checklist_items")
          .select("id, qa_session_id, target_type, target_id")
          .in("qa_session_id", [...sessionById.keys()])
      : { data: [] };
    const itemById = new Map((items ?? []).map((row: any) => [row.id, row]));
    const { data: results } = itemById.size
      ? await db
          .from("qa_checklist_item_results")
          .select("id, checklist_item_id, ai_reasoning, ai_evidence")
          .in("checklist_item_id", [...itemById.keys()])
      : { data: [] };
    const resultById = new Map((results ?? []).map((row: any) => [row.id, row]));
    const { data: issues } = resultById.size
      ? await db
          .from("qa_discussions")
          .select("*, qa_discussion_comments(*)")
          .in("checklist_item_result_id", [...resultById.keys()])
          .not("workflow_status", "in", '("dismissed","verified")')
          .order("updated_at", { ascending: false })
      : { data: [] };
    const environmentIds = [
      ...new Set((rounds ?? []).map((row: any) => row.qa_environment_id).filter(Boolean)),
    ];
    const channelIds = [
      ...new Set((sessions ?? []).map((row: any) => row.qa_channel_id).filter(Boolean)),
    ];
    const [{ data: environments }, { data: channels }] = await Promise.all([
      environmentIds.length
        ? db.from("qa_environments").select("id, name").in("id", environmentIds)
        : Promise.resolve({ data: [] }),
      channelIds.length
        ? db.from("qa_channels").select("id, name").in("id", channelIds)
        : Promise.resolve({ data: [] }),
    ]);
    const environmentById = new Map((environments ?? []).map((row: any) => [row.id, row.name]));
    const channelById = new Map((channels ?? []).map((row: any) => [row.id, row.name]));

    const hydrated = (issues ?? []).flatMap((issue: any) => {
      const result = resultById.get(issue.checklist_item_result_id) as any;
      const item = result ? (itemById.get(result.checklist_item_id) as any) : null;
      const session = item ? (sessionById.get(item.qa_session_id) as any) : null;
      const round = session ? (roundById.get(session.qa_round_id) as any) : null;
      if (!result || !item || !session || !round) return [];
      return [
        {
          id: issue.id,
          targetType: issue.target_type,
          targetLabel: issue.target_label,
          workflowStatus: issue.workflow_status,
          updatedAt: issue.updated_at ?? issue.created_at,
          environmentName: environmentById.get(round.qa_environment_id) ?? "QA",
          channelName: channelById.get(session.qa_channel_id) ?? null,
          sessionName: session.name,
          roundNumber: round.round_number,
          reasoning: result.ai_reasoning,
          evidence: result.ai_evidence,
          qaSessionId: session.id,
          itemTargetType: item.target_type,
          itemTargetId: item.target_id,
          comments: issue.qa_discussion_comments ?? [],
        },
      ];
    });
    const sessionIds = [...sessionById.keys()];
    const [{ data: eventLogs }, { data: attributeLogs }] = sessionIds.length
      ? await Promise.all([
          db
            .from("qa_run_events")
            .select("qa_session_id, event_id, occurred_at, raw_properties")
            .in("qa_session_id", sessionIds)
            .order("occurred_at", { ascending: false }),
          db
            .from("qa_attribute_snapshots")
            .select("qa_session_id, captured_at, payload")
            .in("qa_session_id", sessionIds)
            .order("captured_at", { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }];
    const authorIds = [
      ...new Set(
        hydrated
          .flatMap((issue: any) => issue.comments.map((comment: any) => comment.author_id))
          .filter(Boolean),
      ),
    ];
    const { data: profiles } = authorIds.length
      ? await db.from("profiles").select("id, display_name, email").in("id", authorIds)
      : { data: [] };
    const authorById = new Map(
      (profiles ?? []).map((row: any) => [row.id, row.display_name || row.email]),
    );
    return {
      projectName: project?.name ?? "QA Workspace",
      expiresAt: portal.expires_at,
      issues: hydrated.map((issue: any) => ({
        ...issue,
        logs:
          issue.itemTargetType === "event"
            ? (eventLogs ?? []).filter(
                (log: any) =>
                  log.qa_session_id === issue.qaSessionId && log.event_id === issue.itemTargetId,
              )
            : (attributeLogs ?? []).filter((log: any) => log.qa_session_id === issue.qaSessionId),
        qaSessionId: undefined,
        itemTargetType: undefined,
        itemTargetId: undefined,
        comments: issue.comments
          .map((comment: any) => ({
            id: comment.id,
            author:
              comment.external_author_name ?? authorById.get(comment.author_id) ?? "내부 담당자",
            body: comment.body,
            createdAt: comment.created_at,
          }))
          .sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt)),
      })),
    };
  });

export const updateSharedIssue = createServerFn({ method: "POST" })
  .validator((data: { token: string; discussionId: string; status: string }) => data)
  .handler(async ({ data }) => {
    if (!STATUSES.has(data.status)) throw new Error("올바르지 않은 상태예요.");
    if (!(await readPortalIssue(data.token, data.discussionId)))
      throw new Error("이 이슈를 변경할 수 없어요.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("qa_discussions")
      .update({ workflow_status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.discussionId);
    if (error) throw error;
    return { ok: true };
  });

export const commentOnSharedIssue = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; discussionId: string; authorName: string; body: string }) => data,
  )
  .handler(async ({ data }) => {
    const authorName = data.authorName.trim();
    const body = data.body.trim();
    if (!authorName || authorName.length > 80 || !body || body.length > 5000)
      throw new Error("이름과 댓글 내용을 확인해주세요.");
    if (!(await readPortalIssue(data.token, data.discussionId)))
      throw new Error("이 이슈에 댓글을 남길 수 없어요.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("qa_discussion_comments")
      .insert({
        discussion_id: data.discussionId,
        author_id: null,
        external_author_name: authorName,
        body,
      });
    if (error) throw error;
    return { ok: true };
  });
