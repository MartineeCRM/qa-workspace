export type JudgePromptTarget =
  | { kind: "event"; technicalName: string; runEvents: unknown[] }
  | { kind: "custom_attribute"; technicalName: string; snapshots: unknown[] };

export type JudgePromptInput = {
  rules: Array<{ id: string; name: string; description: string }>;
  targets: JudgePromptTarget[];
};

export type JudgeResponse =
  | {
      ok: true;
      verdict: "passed" | "failed";
      reasoning: string;
      evidence: unknown;
    }
  | { ok: false; error: string };

export function parseJudgeResponse(text: string, rules: JudgePromptInput["rules"]): JudgeResponse {
  let parsed: {
    results?: Array<{
      rule_id?: string;
      verdict?: string;
      reasoning?: string;
      evidence?: unknown;
    }>;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "AI 응답을 JSON으로 해석하지 못했어요." };
  }
  if (!Array.isArray(parsed.results)) {
    return { ok: false, error: "AI 응답에 규칙별 results가 없어요." };
  }
  const byRuleId = new Map(parsed.results.map((result) => [result.rule_id, result]));
  const results = rules.map((rule) => byRuleId.get(rule.id));
  if (
    results.some(
      (result) => !result || (result.verdict !== "passed" && result.verdict !== "failed"),
    )
  ) {
    return { ok: false, error: "AI가 일부 규칙의 판정 결과를 올바르게 반환하지 않았어요." };
  }
  const failed = results.filter((result) => result?.verdict === "failed");
  return {
    ok: true,
    verdict: failed.length > 0 ? "failed" : "passed",
    reasoning: failed
      .map((result) => result?.reasoning?.trim())
      .filter(Boolean)
      .join("\n"),
    evidence: parsed.results,
  };
}

export function buildJudgePrompt(input: JudgePromptInput): string {
  const evidenceLines = input.targets.map((t) =>
    t.kind === "event"
      ? `- 이벤트 "${t.technicalName}" 로그: ${JSON.stringify(t.runEvents)}`
      : `- 어트리뷰트 "${t.technicalName}" 스냅샷: ${JSON.stringify(t.snapshots)}`,
  );

  return [
    "당신은 이벤트 트래킹 QA 판정 엔진입니다. 각 검증 규칙을 근거 로그와 독립적으로 대조하세요.",
    "",
    "검증 규칙:",
    ...input.rules.map(
      (rule) =>
        `- ID=${JSON.stringify(rule.id)}, 이름=${JSON.stringify(rule.name)}, 조건=${JSON.stringify(rule.description)}`,
    ),
    "",
    "근거:",
    ...evidenceLines,
    "",
    "판정 원칙:",
    "- 문자열의 형식, URL 스킴, 대소문자, 값의 의미를 규칙에 적힌 그대로 엄격히 검사하세요.",
    "- 'A가 발생하면 B가 발생해야 한다' 같은 조건부 규칙은 A가 없으면 통과, A가 있는데 B가 없으면 실패입니다.",
    "- 로그가 없는 대상도 빈 배열 자체가 근거입니다. 추측으로 존재한다고 간주하지 마세요.",
    "- 각 규칙 ID마다 반드시 결과 하나를 반환하세요.",
    "",
    "다른 설명 없이 다음 JSON 형식으로만 응답하세요:",
    "마크다운 코드 블록(```json 등) 없이 순수 JSON 텍스트만 출력하세요.",
    '{"results":[{"rule_id":"규칙 ID","verdict":"failed","reasoning":"실패 이유","evidence":{"observed":"실제 근거"}}]}',
    '각 verdict는 반드시 "passed" 또는 "failed" 중 하나여야 합니다.',
  ].join("\n");
}
