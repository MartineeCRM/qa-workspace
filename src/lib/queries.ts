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
  category_id: string | null;
  technical_name: string;
  display_name: string | null;
  description: string | null;
  trigger_description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TaxonomyCategory = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TaxonomyEventProperty = {
  id: string;
  event_id: string;
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

export type TaxonomyCustomAttribute = {
  id: string;
  project_id: string;
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

export type TaxonomyCustomAttributeProperty = {
  id: string;
  custom_attribute_id: string;
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

export type ValidationRuleTarget = {
  id: string;
  rule_id: string;
  target_type: "event" | "property" | "custom_attribute";
  target_id: string;
  created_at: string;
};

export type ValidationRule = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  validation_rule_targets: ValidationRuleTarget[];
};

export type QaEnvironment = {
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
  qa_environment_id: string;
  file_name: string;
  row_count: number;
  notes: string | null;
  uploaded_by: string;
  created_at: string;
};

export type QaAnalysisRun = {
  id: string;
  project_id: string;
  qa_environment_id: string;
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
  qa_environment_id: string;
  event_id: string | null;
  property_id: string | null;
  custom_attribute_id: string | null;
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
      unwrap<Workspace>(
        await db.from("workspaces").select("*").eq("id", workspaceId).maybeSingle(),
      ),
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
          profiles: {
            display_name: string;
            avatar_url: string | null;
            email: string | null;
          } | null;
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

export function useTaxonomyCategories(projectId: string) {
  return useQuery({
    queryKey: ["taxonomy-categories", projectId],
    queryFn: async () =>
      unwrap<TaxonomyCategory[]>(
        await db
          .from("taxonomy_categories")
          .select("*")
          .eq("project_id", projectId)
          .order("sort_order"),
      ),
  });
}

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

export function useTaxonomyEventProperties(projectId: string) {
  return useQuery({
    queryKey: ["taxonomy-event-properties", projectId],
    queryFn: async () =>
      unwrap<TaxonomyEventProperty[]>(
        await db
          .from("taxonomy_event_properties")
          .select("*, taxonomy_events!inner(project_id)")
          .eq("taxonomy_events.project_id", projectId)
          .order("sort_order")
          .order("created_at"),
      ),
  });
}

export function useTaxonomyCustomAttributes(projectId: string) {
  return useQuery({
    queryKey: ["taxonomy-custom-attributes", projectId],
    queryFn: async () =>
      unwrap<TaxonomyCustomAttribute[]>(
        await db
          .from("taxonomy_custom_attributes")
          .select("*")
          .eq("project_id", projectId)
          .order("sort_order")
          .order("created_at"),
      ),
  });
}

export function useTaxonomyCustomAttributeProperties(projectId: string) {
  return useQuery({
    queryKey: ["taxonomy-custom-attribute-properties", projectId],
    queryFn: async () =>
      unwrap<TaxonomyCustomAttributeProperty[]>(
        await db
          .from("taxonomy_custom_attribute_properties")
          .select("*, taxonomy_custom_attributes!inner(project_id)")
          .eq("taxonomy_custom_attributes.project_id", projectId)
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
          .select("*, validation_rule_targets(*)")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ),
  });
}

/* ---------------- QA environments ---------------- */

export function useEnvironments(projectId: string) {
  return useQuery({
    queryKey: ["environments", projectId],
    queryFn: async () =>
      unwrap<QaEnvironment[]>(
        await db
          .from("qa_environments")
          .select("*")
          .eq("project_id", projectId)
          .order("sort_order"),
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

export function useUploads(environmentId: string) {
  return useQuery({
    queryKey: ["uploads", environmentId],
    enabled: Boolean(environmentId),
    queryFn: async () =>
      unwrap<QaUpload[]>(
        await db
          .from("qa_uploads")
          .select("*")
          .eq("qa_environment_id", environmentId)
          .order("created_at", { ascending: false }),
      ),
  });
}

export function useRuns(environmentId: string) {
  return useQuery({
    queryKey: ["runs", environmentId],
    enabled: Boolean(environmentId),
    queryFn: async () =>
      unwrap<QaAnalysisRun[]>(
        await db
          .from("qa_analysis_runs")
          .select("*")
          .eq("qa_environment_id", environmentId)
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
 * Nothing is snapshotted: growing the taxonomy lowers coverage on every environment.
 */

export type CoverageItem = {
  key: string;
  kind: "event" | "property" | "attribute";
  id: string;
  label: string;
  eventName: string | null;
};

export function buildCoverageItems(
  events: TaxonomyEvent[],
  eventProperties: TaxonomyEventProperty[],
  customAttributes: TaxonomyCustomAttribute[],
): CoverageItem[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const items: CoverageItem[] = [];
  for (const e of events.filter((e) => e.is_active)) {
    items.push({
      key: `event:${e.id}`,
      kind: "event",
      id: e.id,
      label: e.technical_name,
      eventName: null,
    });
  }
  for (const p of eventProperties.filter((p) => p.is_active)) {
    const parent = eventById.get(p.event_id);
    if (!parent || !parent.is_active) continue;
    items.push({
      key: `property:${p.id}`,
      kind: "property",
      id: p.id,
      label: p.technical_name,
      eventName: parent.technical_name,
    });
  }
  for (const a of customAttributes.filter((a) => a.is_active)) {
    items.push({
      key: `attribute:${a.id}`,
      kind: "attribute",
      id: a.id,
      label: a.technical_name,
      eventName: null,
    });
  }
  return items;
}

export function statusKey(row: {
  event_id: string | null;
  property_id: string | null;
  custom_attribute_id: string | null;
}) {
  if (row.event_id) return `event:${row.event_id}`;
  if (row.property_id) return `property:${row.property_id}`;
  return `attribute:${row.custom_attribute_id}`;
}

export type EnvironmentCoverage = {
  total: number;
  verified: number;
  failed: number;
  notStarted: number;
  ratio: number;
};

export function environmentCoverage(
  items: CoverageItem[],
  statuses: QaItemStatus[],
  environmentId: string,
): EnvironmentCoverage {
  const map = new Map(
    statuses
      .filter((s) => s.qa_environment_id === environmentId)
      .map((s) => [statusKey(s), s.status]),
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
