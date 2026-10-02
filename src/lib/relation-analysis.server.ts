/* eslint-disable @typescript-eslint/no-explicit-any -- new relation tables are not in the generated schema */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildRelationBatches,
  parseRelationResponse,
  RELATION_PROMPT_VERSION,
  RELATION_RUNNING_TIMEOUT,
  relationResponseFormat,
  RELATION_SYSTEM_PROMPT,
  type RelationDefinition,
  type RelationFinding,
  type RelationResults,
} from "./relation-analysis";
import type { QaRunEvent } from "./qa-rounds-queries";

function unwrap(result: { data: any; error: any }) {
  if (result.error)
    throw new Error(result.error.message ?? "관계 탐색 데이터를 읽거나 저장하지 못했어요.");
  return result.data;
}

export async function loadRelationLogs(db: any, sessionId: string) {
  const logs: QaRunEvent[] = [];
  let total = 0;
  for (let offset = 0; offset < 20_000; offset += 1_000) {
    const response = await db
      .from("qa_run_events")
      .select("*", { count: "exact" })
      .eq("qa_session_id", sessionId)
      .order("occurred_at")
      .order("id")
      .range(offset, offset + 999);
    logs.push(...unwrap(response));
    total = response.count ?? logs.length;
    if (logs.length >= total || response.data.length === 0) break;
  }
  return { logs, total };
}

export async function analyzeRelations(
  sessionId: string,
  userDb: any,
  userId: string,
): Promise<RelationResults> {
  const session = unwrap(
    await userDb.from("qa_sessions").select("qa_round_id").eq("id", sessionId).maybeSingle(),
  );
  if (!session) throw new Error("검증 실행을 찾을 수 없어요.");
  const round = unwrap(
    await userDb.from("qa_rounds").select("project_id").eq("id", session.qa_round_id).single(),
  );
  const project = unwrap(
    await userDb.from("projects").select("workspace_id").eq("id", round.project_id).single(),
  );
  if (!unwrap(await userDb.rpc("can_edit_ws", { _ws: project.workspace_id })))
    throw new Error("분석을 실행할 권한이 없어요.");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI 분석 설정이 없어요. 관리자에게 문의해 주세요.");
  const db = supabaseAdmin as any;
  const [{ logs, total }, eventResult, propertyResult] = await Promise.all([
    loadRelationLogs(userDb, sessionId),
    userDb
      .from("taxonomy_events")
      .select("id,technical_name,description")
      .eq("project_id", round.project_id),
    userDb
      .from("taxonomy_event_properties")
      .select(
        "technical_name,description,data_type,example_value,event_id,taxonomy_events!inner(project_id)",
      )
      .eq("taxonomy_events.project_id", round.project_id),
  ]);
  const events = unwrap(eventResult);
  const properties = unwrap(propertyResult);
  const definitions: RelationDefinition[] = events.map((event: any) => ({
    event: event.technical_name,
    description: event.description,
    properties: properties
      .filter((p: any) => p.event_id === event.id)
      .map(({ technical_name, description, data_type, example_value }: any) => ({
        technical_name,
        description,
        data_type,
        example_value,
      })),
  }));
  const model = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";
  const inputHash = createHash("sha256")
    .update(JSON.stringify({ logs, total, definitions, model, version: RELATION_PROMPT_VERSION }))
    .digest("hex");
  let analysis = unwrap(
    await db
      .from("qa_relation_analyses")
      .select("*")
      .eq("qa_session_id", sessionId)
      .eq("input_hash", inputHash)
      .maybeSingle(),
  );
  const candidatesFor = async (id: string) =>
    unwrap(await db.from("qa_relation_candidates").select("*").eq("analysis_id", id).order("id"));
  if (analysis?.status === "complete" || (analysis?.status === "partial" && !analysis.error)) {
    analysis = unwrap(
      await db
        .from("qa_relation_analyses")
        .update({ requested_at: new Date().toISOString() })
        .eq("id", analysis.id)
        .select("*")
        .single(),
    );
    return { analysis, candidates: await candidatesFor(analysis.id) };
  }
  if (
    analysis?.status === "running" &&
    Date.now() - Date.parse(analysis.started_at) < RELATION_RUNNING_TIMEOUT
  )
    return { analysis, candidates: await candidatesFor(analysis.id) };
  const batches = buildRelationBatches(logs, definitions);
  const initial = {
    qa_session_id: sessionId,
    input_hash: inputHash,
    status: "running",
    total_logs: total,
    covered_logs: 0,
    completed_batches: 0,
    planned_batches: batches.length,
    model,
    prompt_version: RELATION_PROMPT_VERSION,
    definitions,
    started_by: userId,
    started_at: new Date().toISOString(),
    requested_at: new Date().toISOString(),
    completed_at: null,
    error: null,
    input_tokens: 0,
    output_tokens: 0,
  };
  if (analysis) {
    const updated = await db
      .from("qa_relation_analyses")
      .update(initial)
      .eq("id", analysis.id)
      .eq("started_at", analysis.started_at)
      .select("*")
      .maybeSingle();
    analysis = unwrap(updated);
    if (!analysis) throw new Error("관계 탐색이 이미 진행 중이에요.");
  } else {
    const inserted = await db.from("qa_relation_analyses").insert(initial).select("*").single();
    if (inserted.error?.code === "23505")
      throw new Error("관계 탐색이 이미 진행 중이에요. 잠시 후 다시 확인해 주세요.");
    analysis = unwrap(inserted);
  }

  const covered = new Set<string>();
  const found = new Map<string, RelationFinding>();
  let completed = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let errorMessage: string | null = null;
  try {
    for (const batch of batches) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model,
          store: false,
          input: [
            { role: "developer", content: RELATION_SYSTEM_PROMPT },
            { role: "user", content: batch.input },
          ],
          reasoning: { effort: "low" },
          text: { format: relationResponseFormat(batch.logs) },
          max_output_tokens: 3_000,
          prompt_cache_key: RELATION_PROMPT_VERSION,
        }),
      });
      if (!response.ok)
        throw new Error(`AI 관계 탐색 요청에 실패했어요 (HTTP ${response.status}).`);
      const body = await response.json();
      inputTokens += body.usage?.input_tokens ?? 0;
      outputTokens += body.usage?.output_tokens ?? 0;
      if (body.status === "incomplete")
        throw new Error("AI 응답이 출력 한도에서 중단됐어요. 완료된 범위만 표시합니다.");
      const text = (body.output ?? [])
        .flatMap((item: any) => item.content ?? [])
        .filter((item: any) => item.type === "output_text")
        .map((item: any) => item.text ?? "")
        .join("");
      for (const finding of parseRelationResponse(text, batch.logs))
        found.set(finding.fingerprint, finding);
      batch.logs.forEach((log) => covered.add(log.id));
      completed += 1;
    }
  } catch (error) {
    errorMessage =
      error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)
        ? "AI 관계 탐색 시간이 초과됐어요. 다시 탐색해 주세요."
        : error instanceof Error
          ? error.message
          : "AI 관계 탐색에 실패했어요.";
  }
  try {
    const previous = unwrap(
      await db
        .from("qa_relation_candidates")
        .select(
          "fingerprint,review_status,reviewed_by,reviewed_at,qa_relation_analyses!inner(qa_session_id)",
        )
        .eq("qa_relation_analyses.qa_session_id", sessionId)
        .not("reviewed_at", "is", null)
        .order("reviewed_at", { ascending: true }),
    );
    const reviews = new Map(previous.map((candidate: any) => [candidate.fingerprint, candidate]));
    const candidates = [...found.values()].map((finding) => {
      const review = reviews.get(finding.fingerprint) as any;
      return {
        ...finding,
        analysis_id: analysis.id,
        review_status: review?.review_status ?? "open",
        reviewed_by: review?.reviewed_by ?? null,
        reviewed_at: review?.reviewed_at ?? null,
      };
    });
    if (candidates.length)
      unwrap(
        await db
          .from("qa_relation_candidates")
          .upsert(candidates, { onConflict: "analysis_id,fingerprint" }),
      );
    // Retries reuse this analysis, so remove obsolete machine candidates only.
    const stale = (await candidatesFor(analysis.id)).filter(
      (candidate: any) => !found.has(candidate.fingerprint) && !candidate.reviewed_at,
    );
    if (stale.length)
      unwrap(
        await db
          .from("qa_relation_candidates")
          .delete()
          .in(
            "id",
            stale.map((candidate: any) => candidate.id),
          ),
      );
    const status = errorMessage
      ? completed
        ? "partial"
        : "failed"
      : covered.size < total
        ? "partial"
        : "complete";
    analysis = unwrap(
      await db
        .from("qa_relation_analyses")
        .update({
          status,
          covered_logs: covered.size,
          completed_batches: completed,
          error: errorMessage,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          completed_at: new Date().toISOString(),
        })
        .eq("id", analysis.id)
        .select("*")
        .single(),
    );
    return { analysis, candidates: await candidatesFor(analysis.id) };
  } catch {
    await db
      .from("qa_relation_analyses")
      .update({
        status: "failed",
        error: "관계 후보 저장에 실패했어요. 다시 탐색해 주세요.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", analysis.id);
    throw new Error("관계 후보 저장에 실패했어요. 다시 탐색해 주세요.");
  }
}
