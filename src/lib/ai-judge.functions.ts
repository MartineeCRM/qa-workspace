import { createServerFn } from "@tanstack/react-start";
import { buildJudgePrompt, type JudgePromptInput } from "@/lib/ai-judge-prompt";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type JudgeAiResult =
  | { ok: true; verdict: "passed" | "failed"; reasoning: string; evidence: Json }
  | { ok: false; error: string };

export const judgeChecklistItemWithAI = createServerFn({ method: "POST" })
  .validator((data: JudgePromptInput) => data)
  .handler(async ({ data }): Promise<JudgeAiResult> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "ANTHROPIC_API_KEY가 서버에 설정되지 않았어요." };
    }

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 512,
          messages: [{ role: "user", content: buildJudgePrompt(data) }],
        }),
      });
    } catch {
      return { ok: false, error: "Claude API 서버에 연결할 수 없어요." };
    }

    if (!response.ok) {
      return { ok: false, error: `Claude API 오류 (HTTP ${response.status})` };
    }

    const body = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";

    try {
      const parsed = JSON.parse(text) as { verdict: string; reasoning: string; evidence: Json };
      if (parsed.verdict !== "passed" && parsed.verdict !== "failed") {
        return { ok: false, error: `Claude 응답의 verdict 값이 올바르지 않아요: ${parsed.verdict}` };
      }
      return {
        ok: true,
        verdict: parsed.verdict,
        reasoning: parsed.reasoning,
        evidence: parsed.evidence,
      };
    } catch {
      return { ok: false, error: "Claude 응답을 JSON으로 해석하지 못했어요." };
    }
  });
