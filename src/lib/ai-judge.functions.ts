import { createServerFn } from "@tanstack/react-start";
import {
  buildJudgePrompt,
  JUDGE_RESPONSE_FORMAT,
  parseJudgeResponse,
  type JudgePromptInput,
} from "@/lib/ai-judge-prompt";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type OpenAIResponse = {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

export function extractOpenAIResponseText(body: OpenAIResponse): string {
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text ?? "")
    .join("")
    .trim();
}

export function judgeOutputTokenBudget(ruleCount: number): number {
  return Math.min(8_192, Math.max(2_048, 1_024 + ruleCount * 384));
}

export type JudgeAiResult =
  | {
      ok: true;
      verdict: "passed" | "failed";
      reasoning: string;
      evidence: Json;
    }
  | { ok: false; error: string };

export const judgeChecklistItemWithAI = createServerFn({ method: "POST" })
  .validator((data: JudgePromptInput) => data)
  .handler(async ({ data }): Promise<JudgeAiResult> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "OPENAI_API_KEY가 서버에 설정되지 않았어요." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? "gpt-5.6-sol",
          input: buildJudgePrompt(data),
          reasoning: { effort: "low" },
          text: { format: JUDGE_RESPONSE_FORMAT },
          max_output_tokens: judgeOutputTokenBudget(data.rules.length),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "OpenAI 판정 시간이 30초를 초과했어요."
            : "OpenAI API 서버에 연결할 수 없어요.",
      };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return { ok: false, error: `OpenAI API 오류 (HTTP ${response.status})` };
    }

    let body: OpenAIResponse;
    try {
      body = await response.json();
    } catch {
      return { ok: false, error: "OpenAI 응답을 JSON으로 해석하지 못했어요." };
    }
    const text = extractOpenAIResponseText(body);
    if (body.status === "incomplete") {
      return {
        ok: false,
        error:
          body.incomplete_details?.reason === "max_output_tokens"
            ? "AI 판정이 출력 한도에서 잘렸어요. 규칙을 줄이거나 다시 분석해주세요."
            : "AI 판정이 완료되기 전에 중단됐어요. 다시 분석해주세요.",
      };
    }
    if (!text) return { ok: false, error: "AI가 판정 본문을 반환하지 않았어요." };

    const parsed = parseJudgeResponse(text, data.rules);
    return parsed.ok ? { ...parsed, evidence: parsed.evidence as Json } : parsed;
  });
