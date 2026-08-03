import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WorkspaceRole } from "@/lib/domain";

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

export function useAddDiscoveredEventProperty(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      eventId: string;
      technicalName: string;
      dataType: string;
      sampleValue: unknown;
      userId: string;
    }) => {
      // Taxonomy is shared across every round/session, so the same undefined
      // property can surface from more than one checklist item (e.g. a stale
      // result from before this property was added elsewhere). Upsert with
      // ignoreDuplicates so re-adding an already-known property is a no-op
      // instead of a unique_violation error.
      const { error } = await db.from("taxonomy_event_properties").upsert(
        {
          event_id: input.eventId,
          technical_name: input.technicalName,
          data_type: input.dataType,
          is_required: false,
          allowed_values: null,
          example_value: input.sampleValue,
          created_by: input.userId,
        },
        { onConflict: "event_id,technical_name", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taxonomy-event-properties", projectId] });
    },
  });
}

// Spec-diff "택소노미를 X로" resolution — the log's observed type is right and the
// taxonomy definition is wrong, so fix the taxonomy in place rather than flag the
// implementation.
export function useUpdateEventPropertyDataType(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { propertyId: string; dataType: string }) => {
      const { error } = await db
        .from("taxonomy_event_properties")
        .update({ data_type: input.dataType })
        .eq("id", input.propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taxonomy-event-properties", projectId] });
    },
  });
}

// Spec-diff "이름 매핑" resolution — the log's property name is right (the taxonomy
// name was a typo), so rename the existing taxonomy property to match the log
// instead of adding a second, near-duplicate property.
export function useRenameEventProperty(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { propertyId: string; newTechnicalName: string }) => {
      const { error } = await db
        .from("taxonomy_event_properties")
        .update({ technical_name: input.newTechnicalName })
        .eq("id", input.propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["taxonomy-event-properties", projectId] });
    },
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

export type EnvironmentCoverage = {
  total: number;
  verified: number;
  failed: number;
  notStarted: number;
  ratio: number;
};

export { db };
