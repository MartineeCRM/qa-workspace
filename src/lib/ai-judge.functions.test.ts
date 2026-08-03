import { describe, expect, it } from "vitest";
import { extractOpenAIResponseText } from "./ai-judge.functions";

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
});
