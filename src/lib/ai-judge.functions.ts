import { createServerFn } from "@tanstack/react-start";
import { buildJudgePrompt, parseJudgeResponse, type JudgePromptInput } from "@/lib/ai-judge-prompt";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "ANTHROPIC_API_KEY가 서버에 설정되지 않았어요." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
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
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
          max_tokens: 1024,
          temperature: 0,
          messages: [{ role: "user", content: buildJudgePrompt(data) }],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error && error.name === "AbortError"
            ? "Claude 판정 시간이 30초를 초과했어요."
            : "Claude API 서버에 연결할 수 없어요.",
      };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return { ok: false, error: `Claude API 오류 (HTTP ${response.status})` };
    }

    let body: { content?: { type: string; text?: string }[] };
    try {
      body = await response.json();
    } catch {
      return { ok: false, error: "Claude 응답을 JSON으로 해석하지 못했어요." };
    }
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";

    const parsed = parseJudgeResponse(text, data.rules);
    return parsed.ok ? { ...parsed, evidence: parsed.evidence as Json } : parsed;
  });
