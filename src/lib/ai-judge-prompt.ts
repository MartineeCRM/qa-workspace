export type JudgePromptTarget =
  | { kind: "event"; technicalName: string; runEvents: unknown[] }
  | { kind: "custom_attribute"; technicalName: string; snapshots: unknown[] };

export type JudgePromptInput = {
  ruleDescription: string;
  targets: JudgePromptTarget[];
};

export function buildJudgePrompt(input: JudgePromptInput): string {
  const evidenceLines = input.targets.map((t) =>
    t.kind === "event"
      ? `- 이벤트 "${t.technicalName}" 로그: ${JSON.stringify(t.runEvents)}`
      : `- 어트리뷰트 "${t.technicalName}" 스냅샷: ${JSON.stringify(t.snapshots)}`,
  );

  return [
    "당신은 이벤트 트래킹 QA 판정관입니다. 아래 검증 규칙과 근거 로그를 보고 통과 또는 실패를 판단하세요.",
    "",
    `규칙: ${input.ruleDescription}`,
    "",
    "근거:",
    ...evidenceLines,
    "",
    "다른 설명 없이 다음 JSON 형식으로만 응답하세요:",
    '{"verdict": "passed" | "failed", "reasoning": "판단 이유 (한국어, 1-2문장)", "evidence": <근거로 사용한 로그 중 핵심 부분>}',
  ].join("\n");
}
