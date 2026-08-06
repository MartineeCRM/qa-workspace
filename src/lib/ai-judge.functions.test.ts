import { describe, expect, it } from "vitest";
import { extractOpenAIResponseText, judgeOutputTokenBudget } from "./ai-judge.functions";

describe("extractOpenAIResponseText", () => {
  it("extracts the Responses API output text", () => {
    expect(
      extractOpenAIResponseText({
        output: [
          { content: [{ type: "reasoning" }] },
          { content: [{ type: "output_text", text: '{"results":[]}' }] },
        ],
      }),
    ).toBe('{"results":[]}');
  });

  it("joins every output text block", () => {
    expect(
      extractOpenAIResponseText({
        output: [
          { content: [{ type: "output_text", text: '{"results":' }] },
          { content: [{ type: "output_text", text: "[]}" }] },
        ],
      }),
    ).toBe('{"results":[]}');
  });
});

describe("judgeOutputTokenBudget", () => {
  it("grows with rule count and stays bounded", () => {
    expect(judgeOutputTokenBudget(1)).toBe(1_024);
    expect(judgeOutputTokenBudget(10)).toBe(1_792);
    expect(judgeOutputTokenBudget(100)).toBe(4_096);
  });
});
