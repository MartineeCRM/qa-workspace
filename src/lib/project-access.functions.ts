import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ProjectRole = "manager" | "contributor" | "client_reviewer";

async function requireProjectManager(projectId: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: project } = await db
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new Error("프로젝트를 찾을 수 없어요.");
  const [{ data: projectMember }, { data: workspaceMember }] = await Promise.all([
    db
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", project.workspace_id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (projectMember?.role !== "manager" && !["owner", "admin"].includes(workspaceMember?.role))
    throw new Error("프로젝트 구성원을 관리할 권한이 없어요.");
  return db;
}

export const getProjectAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data, context }) => {
    const db = await requireProjectManager(data.projectId, context.userId);
    const [{ data: members }, { data: invites }, { data: share }] = await Promise.all([
      db.from("project_members").select("*").eq("project_id", data.projectId),
      db
        .from("project_invites")
        .select("*")
        .eq("project_id", data.projectId)
        .gt("expires_at", new Date().toISOString()),
      db
        .from("qa_project_issue_shares")
        .select("token")
        .eq("project_id", data.projectId)
        .is("revoked_at", null)
        .maybeSingle(),
    ]);
    const userIds = (members ?? []).map((member: any) => member.user_id);
    const { data: profiles } = userIds.length
      ? await db.from("profiles").select("id, display_name, email").in("id", userIds)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    return {
      members: (members ?? []).map((member: any) => ({
        ...member,
        profile: profileById.get(member.user_id) ?? null,
      })),
      invites: invites ?? [],
      shareToken: share?.token ?? null,
    };
  });

export const inviteProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { projectId: string; email: string; role: ProjectRole }) => data)
  .handler(async ({ data, context }) => {
    const db = await requireProjectManager(data.projectId, context.userId);
    const email = data.email.trim().toLowerCase();
    if (!email || !["manager", "contributor", "client_reviewer"].includes(data.role))
      throw new Error("이메일과 권한을 확인해주세요.");
    const { data: profile } = await db
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    const query = profile
      ? db
          .from("project_members")
          .upsert(
            { project_id: data.projectId, user_id: profile.id, role: data.role },
            { onConflict: "project_id,user_id" },
          )
      : db.from("project_invites").upsert(
          {
            project_id: data.projectId,
            email,
            role: data.role,
            invited_by: context.userId,
            expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
          },
          { onConflict: "project_id,email" },
        );
    const { error } = await query;
    if (error) throw error;
    return { joined: Boolean(profile) };
  });

export const removeProjectAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { projectId: string; memberId?: string; inviteId?: string }) => data)
  .handler(async ({ data, context }) => {
    const db = await requireProjectManager(data.projectId, context.userId);
    if (data.memberId) {
      const { data: member } = await db
        .from("project_members")
        .select("role")
        .eq("project_id", data.projectId)
        .eq("id", data.memberId)
        .maybeSingle();
      if (member?.role === "manager") {
        const { count } = await db
          .from("project_members")
          .select("id", { count: "exact", head: true })
          .eq("project_id", data.projectId)
          .eq("role", "manager");
        if ((count ?? 0) <= 1) throw new Error("마지막 프로젝트 관리자는 제외할 수 없어요.");
      }
      const { error } = await db
        .from("project_members")
        .delete()
        .eq("project_id", data.projectId)
        .eq("id", data.memberId);
      if (error) throw error;
    } else if (data.inviteId) {
      const { error } = await db
        .from("project_invites")
        .delete()
        .eq("project_id", data.projectId)
        .eq("id", data.inviteId);
      if (error) throw error;
    }
    return { ok: true };
  });
