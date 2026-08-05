import { createServerFn } from "@tanstack/react-start";
import {
  ATTRIBUTE_RECOMMENDATION_FORMAT,
  buildAttributeRecommendationPrompt,
  parseAttributeRecommendations,
  type AttributeRecommendationInput,
} from "@/lib/attribute-recommendation";
import { extractOpenAIResponseText } from "@/lib/ai-judge.functions";

export const recommendAttributesForEvent = createServerFn({ method: "POST" })
  .validator((data: AttributeRecommendationInput) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || data.attributes.length === 0) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? "gpt-5.6-sol",
          input: buildAttributeRecommendationPrompt(data),
          reasoning: { effort: "low" },
          text: { format: ATTRIBUTE_RECOMMENDATION_FORMAT },
          max_output_tokens: 512,
        }),
        signal: controller.signal,
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return [];
    const body = await response.json();
    return parseAttributeRecommendations(
      extractOpenAIResponseText(body),
      new Set(data.attributes.map((attribute) => attribute.id)),
    );
  });
