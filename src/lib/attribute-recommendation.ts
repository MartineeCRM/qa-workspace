export type AttributeRecommendationInput = {
  event: {
    id: string;
    technicalName: string;
    displayName: string | null;
    description: string | null;
    triggerDescription: string | null;
  };
  attributes: Array<{
    id: string;
    technicalName: string;
    displayName: string | null;
    description: string | null;
  }>;
};

export type AttributeRecommendation = {
  attributeId: string;
  reason: string;
};

export const ATTRIBUTE_RECOMMENDATION_FORMAT = {
  type: "json_schema",
  name: "attribute_recommendations",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["recommendations"],
    properties: {
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["attribute_id", "reason"],
          properties: {
            attribute_id: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export function buildAttributeRecommendationPrompt(input: AttributeRecommendationInput): string {
  return [
    "당신은 이벤트 트래킹 QA 실행 도우미입니다.",
    "사용자가 방금 실행한 이벤트 때문에 값이 바뀔 가능성이 높은 custom attribute만 추천하세요.",
    "이름이 비슷하다는 이유만으로 추천하지 말고, 이벤트와 어트리뷰트의 설명·트리거에 인과 관계가 있을 때만 추천하세요.",
    "확신할 근거가 없으면 빈 배열을 반환하세요. 최대 5개만 추천하세요.",
    "reason은 사용자가 스냅샷을 찍어야 하는 이유를 쉬운 한국어 한 문장으로 쓰세요.",
    `이벤트: ${JSON.stringify(input.event)}`,
    `후보 어트리뷰트: ${JSON.stringify(input.attributes)}`,
    '다른 설명 없이 {"recommendations":[{"attribute_id":"후보 ID","reason":"짧은 이유"}]} 형식의 JSON만 반환하세요.',
  ].join("\n");
}

export function parseAttributeRecommendations(
  text: string,
  validAttributeIds: Set<string>,
): AttributeRecommendation[] {
  let parsed: { recommendations?: Array<{ attribute_id?: string; reason?: string }> };
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.recommendations)) return [];
  return parsed.recommendations
    .filter(
      (item) =>
        typeof item.attribute_id === "string" &&
        validAttributeIds.has(item.attribute_id) &&
        typeof item.reason === "string" &&
        item.reason.trim(),
    )
    .slice(0, 5)
    .map((item) => ({
      attributeId: item.attribute_id as string,
      reason: (item.reason as string).trim(),
    }));
}
