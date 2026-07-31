import { describe, expect, it } from "vitest";
import { buildJudgePrompt } from "./ai-judge-prompt";

describe("buildJudgePrompt", () => {
  it("includes the rule description and every target's evidence", () => {
    const prompt = buildJudgePrompt({
      ruleDescription: "profile_update 이후 membership_grade가 같은 값이어야 함",
      targets: [
        { kind: "event", technicalName: "profile_update", runEvents: [{ membership_grade: "GOLD" }] },
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
});
