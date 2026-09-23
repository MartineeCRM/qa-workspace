import { expect, it, vi } from "vitest";
import { useActivity as getActivityQuery } from "./queries";

const { query } = vi.hoisted(() => ({
  query: {
    select: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    eq: vi.fn(),
    data: [] as { id: string }[],
    count: 25,
    error: null as Error | null,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((options) => options),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(() => query) },
}));

it("fetches every activity across page boundaries and propagates query failures", async () => {
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const entries = Array.from({ length: 25 }, (_, id) => ({ id: String(id) }));
  query.range.mockImplementation((from: number, to: number) => {
    query.data = entries.slice(from, to + 1);
    return query;
  });

  const collected: { id: string }[] = [];
  for (const page of [1, 2, 3]) {
    // useQuery is mocked to expose the query options without mounting React.
    const options = getActivityQuery({ projectId: "project-1", limit: 12, page }) as unknown as {
      queryKey: unknown[];
      queryFn: () => Promise<{ entries: { id: string }[]; total: number }>;
    };
    expect(options.queryKey).toEqual(["activity", null, "project-1", 12, page]);
    const result = await options.queryFn();
    expect(result.total).toBe(25);
    collected.push(...result.entries);
  }
  expect(collected).toEqual(entries);
  expect(query.select).toHaveBeenCalledWith(
    "*, actor:profiles!activity_logs_actor_user_id_fkey(display_name)",
    { count: "exact" },
  );
  expect(query.eq).toHaveBeenCalledWith("project_id", "project-1");
  expect(query.order).toHaveBeenCalledWith("id", { ascending: false });

  query.error = new Error("Activity unavailable");
  const options = getActivityQuery({ projectId: "project-1" }) as unknown as {
    queryFn: () => Promise<unknown>;
  };
  await expect(options.queryFn()).rejects.toThrow("Activity unavailable");
});
