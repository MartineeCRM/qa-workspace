/* eslint-disable @typescript-eslint/no-explicit-any -- new relation tables are not in the generated schema */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RelationResults, RelationReview } from "./relation-analysis";

function validateSession(data: { sessionId: string }) {
  if (!data || typeof data.sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(data.sessionId))
    throw new Error("검증 실행 ID가 올바르지 않아요.");
  return { sessionId: data.sessionId };
}

export const getRelationResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(validateSession)
  .handler(async ({ data, context }): Promise<RelationResults> => {
    const db = context.supabase as any;
    const { data: analysis, error } = await db
      .from("qa_relation_analyses")
      .select("*")
      .eq("qa_session_id", data.sessionId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("관계 탐색 기록을 불러오지 못했어요.");
    if (!analysis) return { analysis: null, candidates: [] };
    const { data: candidates, error: candidateError } = await db
      .from("qa_relation_candidates")
      .select("*")
      .eq("analysis_id", analysis.id)
      .order("id");
    if (candidateError) throw new Error("관계 후보를 불러오지 못했어요.");
    return { analysis, candidates: candidates ?? [] };
  });

export const analyzeSessionRelations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateSession)
  .handler(async ({ data, context }): Promise<RelationResults> => {
    const { analyzeRelations } = await import("./relation-analysis.server");
    return analyzeRelations(data.sessionId, context.supabase, context.userId);
  });

export const reviewRelationCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { candidateId: string; status: RelationReview }) => {
    if (
      !data ||
      typeof data.candidateId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(data.candidateId) ||
      !["open", "confirmed", "normal", "deferred"].includes(data.status)
    )
      throw new Error("확인 상태가 올바르지 않아요.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: candidate, error } = await (context.supabase as any)
      .from("qa_relation_candidates")
      .update({
        review_status: data.status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.candidateId)
      .select("id")
      .maybeSingle();
    if (error || !candidate)
      throw new Error("확인 상태를 저장할 권한이 없거나 후보를 찾지 못했어요.");
    return { ok: true };
  });
