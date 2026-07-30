import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ItemStatus, WorkspaceRole } from "@/lib/domain";

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  project_key: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type TaxonomyEvent = {
  id: string;
  project_id: string;
  technical_name: string;
  display_name: string | null;
  description: string | null;
  trigger_description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TaxonomyAttribute = {
  id: string;
  project_id: string;
  event_id: string | null;
  technical_name: string;
  display_name: string | null;
  description: string | null;
  data_type: string;
  is_required: boolean;
  is_active: boolean;
  example_value: unknown;
  allowed_values: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ValidationRule = {
  id: string;
  project_id: string;
  event_id: string | null;
  attribute_id: string | null;
  name: string;
  description: string | null;
  rule_type: string;
  severity: "critical" | "warning" | "info";
  pass_condition_type: "all_records" | "minimum_pass_rate" | "maximum_failure_count";
  minimum_pass_rate: number | null;
  maximum_failure_count: number | null;
  rule_config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type QaStage = {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type QaUpload = {
  id: string;
  project_id: string;
  stage_id: string;
  file_name: string;
  row_count: number;
  notes: string | null;
  uploaded_by: string;
  created_at: string;
};

export type QaAnalysisRun = {
  id: string;
  project_id: string;
  stage_id: string;
  upload_id: string | null;
  status: string;
  summary: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type QaItemStatus = {
  id: string;
  project_id: string;
  stage_id: string;
  event_id: string | null;
  attribute_id: string | null;
  status: ItemStatus;
  notes: string | null;
  last_run_id: string | null;
  updated_at: string;
};

export type ActivityLog = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action_type: string;
  summary: string;
  created_at: string;
};

export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return (data ?? []) as T;
}

export function useMyMemberships() {
  return useQuery({
    queryKey: ["memberships"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return [];
      const res = await db
        .from("workspace_members")
        .select("id, role, workspace_id, created_at, workspaces(*)")
        .eq("user_id", uid);
      return unwrap<
        Array<{ id: string; role: WorkspaceRole; workspace_id: string; workspaces: Workspace }>
      >(res);
    },
  });
}

export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: async () =>
      unwrap<Workspace>(await db.from("workspaces").select("*").eq("id", workspaceId).maybeSingle()),
  });
}

export function useMyRole(workspaceId: string) {
  return useQuery({
    queryKey: ["role", workspaceId],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return null;
      const res = await db
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", uid)
        .maybeSingle();
      if (res.error) throw res.error;
      return (res.data?.role ?? null) as WorkspaceRole | null;
    },
  });
}

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: ["members", workspaceId],
    queryFn: async () =>
      unwrap<
        Array<{
          id: string;
          role: WorkspaceRole;
          user_id: string;
          created_at: string;
          profiles: { display_name: string; avatar_url: string | null; email: string | null } | null;
        }>
      >(
        await db
          .from("workspace_members")
          .select("id, role, user_id, created_at, profiles(display_name, avatar_url, email)")
          .eq("workspace_id", workspaceId)
          .order("created_at"),
      ),
  });
}

export function usePendingInvites(workspaceId: string) {
  return useQuery({
    queryKey: ["invites", workspaceId],
    queryFn: async () =>
      unwrap<WorkspaceInvite[]>(
        await db
          .from("workspace_invites")
          .select("id, workspace_id, email, role, invited_by, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false }),
      ),
  });
}

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: ["projects", workspaceId],
    queryFn: async () =>
      unwrap<Project[]>(
        await db
          .from("projects")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false }),
      ),
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async () =>
      unwrap<Project>(await db.from("projects").select("*").eq("id", projectId).maybeSingle()),
  });
}

/* ---------------- Taxonomy (single source of truth) ---------------- */

export function useTaxonomyEvents(projectId: string) {
  return useQuery({
    queryKey: ["events", projectId],
    queryFn: async () =>
      unwrap<TaxonomyEvent[]>(
        await db
          .from("taxonomy_events")
          .select("*")
          .eq("project_id", projectId)
          .order("sort_order")
          .order("created_at"),
      ),
  });
}

export function useTaxonomyAttributes(projectId: string) {
  return useQuery({
    queryKey: ["attributes", projectId],
    queryFn: async () =>
      unwrap<TaxonomyAttribute[]>(
        await db
          .from("taxonomy_attributes")
          .select("*")
          .eq("project_id", projectId)
          .order("sort_order")
          .order("created_at"),
      ),
  });
}

export function useRules(projectId: string) {
  return useQuery({
    queryKey: ["rules", projectId],
    queryFn: async () =>
      unwrap<ValidationRule[]>(
        await db
          .from("validation_rules")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ),
  });
}

/* ---------------- QA stages ---------------- */

export function useStages(projectId: string) {
  return useQuery({
    queryKey: ["stages", projectId],
    queryFn: async () =>
      unwrap<QaStage[]>(
        await db.from("qa_stages").select("*").eq("project_id", projectId).order("sort_order"),
      ),
  });
}

export function useProjectItemStatuses(projectId: string) {
  return useQuery({
    queryKey: ["item-status", projectId],
    queryFn: async () =>
      unwrap<QaItemStatus[]>(
        await db.from("qa_item_status").select("*").eq("project_id", projectId),
      ),
  });
}

export function useUploads(stageId: string) {
  return useQuery({
    queryKey: ["uploads", stageId],
    enabled: Boolean(stageId),
    queryFn: async () =>
      unwrap<QaUpload[]>(
        await db
          .from("qa_uploads")
          .select("*")
          .eq("stage_id", stageId)
          .order("created_at", { ascending: false }),
      ),
  });
}

export function useRuns(stageId: string) {
  return useQuery({
    queryKey: ["runs", stageId],
    enabled: Boolean(stageId),
    queryFn: async () =>
      unwrap<QaAnalysisRun[]>(
        await db
          .from("qa_analysis_runs")
          .select("*")
          .eq("stage_id", stageId)
          .order("created_at", { ascending: false }),
      ),
  });
}

export function useActivity(params: { workspaceId?: string; projectId?: string; limit?: number }) {
  const { workspaceId, projectId, limit = 15 } = params;
  return useQuery({
    queryKey: ["activity", workspaceId ?? null, projectId ?? null, limit],
    queryFn: async () => {
      let q = db
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (projectId) q = q.eq("project_id", projectId);
      else if (workspaceId) q = q.eq("workspace_id", workspaceId);
      return unwrap<ActivityLog[]>(await q);
    },
    enabled: Boolean(workspaceId || projectId),
  });
}

/* ---------------- Live coverage ----------------
 * Coverage is ALWAYS computed against the current taxonomy.
 * Nothing is snapshotted: growing the taxonomy lowers coverage on every stage.
 */

export type CoverageItem = {
  key: string;
  kind: "event" | "attribute";
  id: string;
  label: string;
  eventName: string | null;
};

export function buildCoverageItems(
  events: TaxonomyEvent[],
  attributes: TaxonomyAttribute[],
): CoverageItem[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const items: CoverageItem[] = [];
  for (const e of events.filter((e) => e.is_active)) {
    items.push({ key: `event:${e.id}`, kind: "event", id: e.id, label: e.technical_name, eventName: null });
  }
  for (const a of attributes.filter((a) => a.is_active)) {
    const parent = a.event_id ? eventById.get(a.event_id) : undefined;
    if (a.event_id && (!parent || !parent.is_active)) continue;
    items.push({
      key: `attribute:${a.id}`,
      kind: "attribute",
      id: a.id,
      label: a.technical_name,
      eventName: parent?.technical_name ?? null,
    });
  }
  return items;
}

export function statusKey(row: { event_id: string | null; attribute_id: string | null }) {
  return row.event_id ? `event:${row.event_id}` : `attribute:${row.attribute_id}`;
}

export type StageCoverage = {
  total: number;
  verified: number;
  failed: number;
  notStarted: number;
  ratio: number;
};

export function stageCoverage(
  items: CoverageItem[],
  statuses: QaItemStatus[],
  stageId: string,
): StageCoverage {
  const map = new Map(
    statuses.filter((s) => s.stage_id === stageId).map((s) => [statusKey(s), s.status]),
  );
  let verified = 0;
  let failed = 0;
  for (const item of items) {
    const st = map.get(item.key);
    if (st === "verified") verified += 1;
    else if (st === "failed") failed += 1;
  }
  const total = items.length;
  return {
    total,
    verified,
    failed,
    notStarted: total - verified - failed,
    ratio: total === 0 ? 0 : verified / total,
  };
}

export { db };
