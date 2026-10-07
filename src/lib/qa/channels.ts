import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/qa/db";
import type { QaChannel } from "@/lib/qa/types";

export function useQaChannels(projectId: string, activeOnly = true) {
  return useQuery({
    queryKey: ["qa-channels", projectId, activeOnly],
    enabled: Boolean(projectId),
    queryFn: async () => {
      let query = db
        .from("qa_channels")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order");
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data as QaChannel[];
    },
  });
}

export function useQaChannelExclusions(eventIds: string[], propertyIds: string[]) {
  return useQuery({
    queryKey: ["qa-channel-exclusions", eventIds, propertyIds],
    queryFn: async () => {
      const [eventsResult, propertiesResult] = await Promise.all([
        eventIds.length > 0
          ? db
              .from("taxonomy_event_channel_exclusions")
              .select("event_id, channel_id")
              .in("event_id", eventIds)
          : Promise.resolve({ data: [], error: null }),
        propertyIds.length > 0
          ? db
              .from("taxonomy_property_channel_exclusions")
              .select("property_id, channel_id")
              .in("property_id", propertyIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (eventsResult.error) throw eventsResult.error;
      if (propertiesResult.error) throw propertiesResult.error;
      return {
        events: new Set<string>(
          (eventsResult.data ?? []).map(
            (row: { event_id: string; channel_id: string }) => `${row.event_id}:${row.channel_id}`,
          ),
        ),
        properties: new Set<string>(
          (propertiesResult.data ?? []).map(
            (row: { property_id: string; channel_id: string }) =>
              `${row.property_id}:${row.channel_id}`,
          ),
        ),
      };
    },
  });
}
