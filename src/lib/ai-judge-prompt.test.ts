import { describe, expect, it } from "vitest";
import { buildJudgePrompt, parseJudgeResponse } from "./ai-judge-prompt";

describe("buildJudgePrompt", () => {
  it("includes the rule description and every target's evidence", () => {
    const prompt = buildJudgePrompt({
      rules: [
        {
          id: "rule-1",
          name: "등급 일치",
          description: "profile_update 이후 membership_grade가 같은 값이어야 함",
        },
      ],
      targets: [
        {
          kind: "event",
          technicalName: "profile_update",
          runEvents: [{ membership_grade: "GOLD" }],
        },
        {
          kind: "custom_attribute",
          technicalName: "membership_grade",
          snapshots: [{ membership_grade: "SILVER" }],
        },
      ],
    });
    expect(prompt).toContain("profile_update 이후 membership_grade가 같은 값이어야 함");
    expect(prompt).toContain('이벤트 "profile_update"');
    expect(prompt).toContain('어트리뷰트 "membership_grade"');
    expect(prompt).toContain("GOLD");
    expect(prompt).toContain("SILVER");
    expect(prompt).toContain('"verdict"');
  });

  it("does not throw and still includes the rule description and JSON format instructions when targets is empty", () => {
    const prompt = buildJudgePrompt({
      rules: [{ id: "rule-1", name: "전체 규칙", description: "연결된 대상이 없는 규칙" }],
      targets: [],
    });
    expect(prompt).toContain("연결된 대상이 없는 규칙");
    expect(prompt).toContain('"verdict"');
    expect(prompt).toContain("JSON");
  });

  it("instructs the engine to evaluate every rule and conditional missing events", () => {
    const prompt = buildJudgePrompt({
      rules: [
        { id: "rule-a", name: "URL 형식", description: "URL은 https://로 시작해야 함" },
        { id: "rule-b", name: "후속 이벤트", description: "A가 발생하면 B가 발생해야 함" },
      ],
      targets: [],
    });

    expect(prompt).toContain("rule-a");
    expect(prompt).toContain("rule-b");
    expect(prompt).toContain("A가 없으면 통과");
    expect(prompt).toContain("A가 있는데 B가 없으면 실패");
    expect(prompt).toContain('기대 예시가 "일본"인데 실제값이 "OKA"');
    expect(prompt).toContain("불확실하거나 근거가 부족하면 보수적으로 실패");
  });
});

describe("parseJudgeResponse", () => {
  const rules = [
    { id: "format", name: "URL 형식", description: "https URL" },
    { id: "sequence", name: "후속 이벤트", description: "A 이후 B" },
  ];

  it("fails the item when any rule fails and keeps every rule's evidence", () => {
    const result = parseJudgeResponse(
      JSON.stringify({
        results: [
          { rule_id: "format", verdict: "passed", reasoning: "", evidence: {} },
          {
            rule_id: "sequence",
            verdict: "failed",
            reasoning: "A는 있지만 B가 없습니다",
            evidence: { a: 1, b: 0 },
          },
        ],
      }),
      rules,
    );

    expect(result).toMatchObject({
      ok: true,
      verdict: "failed",
      reasoning: "A는 있지만 B가 없습니다",
    });
  });

  it("rejects a response that omits one of the requested rules", () => {
    const result = parseJudgeResponse(
      JSON.stringify({
        results: [{ rule_id: "format", verdict: "passed", reasoning: "", evidence: {} }],
      }),
      rules,
    );

    expect(result).toEqual({
      ok: false,
      error: "AI가 일부 규칙의 판정 결과를 올바르게 반환하지 않았어요.",
    });
  });
});
