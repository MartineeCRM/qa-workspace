import { describe, expect, it } from "vitest";
import {
  buildAttributeRecommendationPrompt,
  parseAttributeRecommendations,
} from "./attribute-recommendation";

describe("attribute recommendation", () => {
  it("requires a causal relationship and allows no recommendation", () => {
    const prompt = buildAttributeRecommendationPrompt({
      event: {
        id: "event-1",
        technicalName: "item_viewed",
        displayName: null,
        description: "상품 상세 조회",
        triggerDescription: "상세 화면 진입",
      },
      attributes: [
        {
          id: "attribute-1",
          technicalName: "item_viewed_history",
          displayName: null,
          description: "최근 조회 상품",
        },
      ],
    });
    expect(prompt).toContain("인과 관계");
    expect(prompt).toContain("빈 배열");
  });

  it("drops unknown IDs from the model response", () => {
    expect(
      parseAttributeRecommendations(
        JSON.stringify({
          recommendations: [
            { attribute_id: "known", reason: "최근 조회 목록이 바뀔 수 있어요." },
            { attribute_id: "invented", reason: "없는 대상" },
          ],
        }),
        new Set(["known"]),
      ),
    ).toEqual([{ attributeId: "known", reason: "최근 조회 목록이 바뀔 수 있어요." }]);
  });
});
