import { createServerFn } from "@tanstack/react-start";
import { buildJudgePrompt, parseJudgeResponse, type JudgePromptInput } from "@/lib/ai-judge-prompt";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type OpenAIResponse = {
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

export function extractOpenAIResponseText(body: OpenAIResponse): string {
  return (
    body.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === "output_text")?.text ?? ""
  );
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
          max_output_tokens: 1024,
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

    const parsed = parseJudgeResponse(text, data.rules);
    return parsed.ok ? { ...parsed, evidence: parsed.evidence as Json } : parsed;
  });
