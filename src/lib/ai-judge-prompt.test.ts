import { describe, expect, it } from "vitest";
import {
  buildJudgePrompt,
  buildJudgeRequest,
  JUDGE_RESPONSE_FORMAT,
  JUDGE_SYSTEM_PROMPT,
  parseJudgeResponse,
} from "./ai-judge-prompt";

describe("buildJudgePrompt", () => {
  it("keeps reusable instructions separate from request-specific evidence", () => {
    const request = buildJudgeRequest({
      rules: [{ id: "rule-1", name: "등급", description: "GOLD만 허용" }],
      targets: [],
    });

    expect(JUDGE_SYSTEM_PROMPT).toContain("판정 원칙");
    expect(JUDGE_SYSTEM_PROMPT).toContain("응답 형식");
    expect(JUDGE_SYSTEM_PROMPT).not.toContain("rule-1");
    expect(request).toContain("rule-1");
    expect(request).not.toContain("판정 원칙");
  });

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

  it("marks the current target and keeps related logs as evidence only", () => {
    const request = buildJudgeRequest({
      scope: {
        kind: "event",
        technicalName: "cart_add_completed",
        allowedFields: ["item_id"],
      },
      rules: [{ id: "cart-rule", name: "장바구니", description: "장바구니 상태 비교" }],
      targets: [],
    });

    expect(request).toContain('현재 판정 대상: event "cart_add_completed"');
    expect(request).toContain('허용된 판정 필드: ["item_id"]');
    expect(request).toContain("연관 로그는 비교 근거로만 사용하세요");
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
    expect(prompt).toContain("데이터 타입, 구조, 표현 체계, 의미 영역, 정규화 규칙");
    expect(prompt).toContain(
      "택소노미 타입이 array이면 실제 배열을 문자열이어야 한다고 판단하지 마세요",
    );
    expect(prompt).toContain(
      "각 문자열의 내부 구조, 구분자, 필드명, 필드별 값 형식까지 검증하세요",
    );
    expect(prompt).toContain("사람이 읽는 명칭과 URL");
    expect(prompt).toContain("임의로 기대값에 맞춰 해석하지 마세요");
    expect(prompt).toContain("mismatch_dimensions");
    expect(prompt).toContain("불확실하거나 근거가 부족하면 보수적으로 실패");
    expect(prompt).toContain("occurred_at은 이벤트 발생 시각");
    expect(prompt).toContain("captured_at은 스냅샷을 조회한 시각");
    expect(prompt).toContain("스냅샷 captured_at과 비교하지 마세요");
    expect(prompt).toContain("명시가 없으면 오름차순과 내림차순 모두 허용");
    expect(prompt).toContain(
      "정의되지 않은 시간 관계나 배열 순서 규칙을 새로 만들어 실패시키지 마세요",
    );
    expect(prompt).toContain("쉬운 한국어로 핵심만 1~2문장");
    expect(prompt).toContain("자세한 분석은 evidence에만 넣으세요");
    expect(prompt).toContain("`referral_source`가 없습니다");
    expect(prompt).toContain("실패한 규칙만 results에 넣으세요");
    expect(prompt).toContain("원본 로그나 배열을 다시 복사하지 마세요");
  });

  it("summarizes long arrays instead of asking the model to echo every value", () => {
    const values = Array.from({ length: 20 }, (_, index) => `search-${index}`);
    const prompt = buildJudgePrompt({
      rules: [{ id: "rule-1", name: "검색 기록", description: "검색어 배열" }],
      targets: [
        {
          kind: "custom_attribute",
          technicalName: "search_history",
          snapshots: [{ payload: { search_history: values } }],
        },
      ],
    });

    expect(prompt).toContain('"__kind":"array_summary"');
    expect(prompt).toContain('"length":20');
    expect(prompt).toContain("search-0");
    expect(prompt).toContain("search-19");
    expect(prompt).not.toContain("search-10");
  });

  it("defines a strict structured-output schema without raw evidence fields", () => {
    expect(JUDGE_RESPONSE_FORMAT).toMatchObject({ type: "json_schema", strict: true });
    expect(JSON.stringify(JUDGE_RESPONSE_FORMAT)).not.toContain("expected_contract");
    expect(JSON.stringify(JUDGE_RESPONSE_FORMAT)).toContain("observed_summary");
    expect(JSON.stringify(JUDGE_RESPONSE_FORMAT)).toContain("refs");
  });
});

describe("parseJudgeResponse", () => {
  const rules = [
    { id: "format", name: "URL 형식", description: "https URL" },
    { id: "sequence", name: "후속 이벤트", description: "A 이후 B" },
  ];

  it("fails the item when a failed rule is returned", () => {
    const result = parseJudgeResponse(
      JSON.stringify({
        results: [
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

  it("treats an empty failure list as passed", () => {
    const result = parseJudgeResponse(JSON.stringify({ results: [] }), rules);

    expect(result).toMatchObject({ ok: true, verdict: "passed" });
  });

  it("rejects a failure for an unknown rule", () => {
    const result = parseJudgeResponse(
      JSON.stringify({
        results: [{ rule_id: "unknown", verdict: "failed", reasoning: "오류", evidence: {} }],
      }),
      rules,
    );

    expect(result).toEqual({
      ok: false,
      error: "AI가 요청하지 않은 규칙의 결과를 반환했어요.",
    });
  });

  it("accepts JSON wrapped in a markdown code fence", () => {
    const response = {
      results: [],
    };

    expect(
      parseJudgeResponse(`\`\`\`json\n${JSON.stringify(response)}\n\`\`\``, rules),
    ).toMatchObject({
      ok: true,
      verdict: "passed",
    });
  });

  it("drops failures that belong only to a related log", () => {
    const result = parseJudgeResponse(
      JSON.stringify({
        results: [
          {
            rule_id: "sequence",
            verdict: "failed",
            reasoning: "cart_remove_completed 로그가 잘못됐습니다",
            evidence: {
              refs: [{ target: "cart_remove_completed", field: "item_id" }],
            },
          },
        ],
      }),
      rules,
      { kind: "event", technicalName: "cart_add_completed", allowedFields: ["item_id"] },
    );

    expect(result).toMatchObject({ ok: true, verdict: "passed", evidence: [] });
  });

  it("keeps only current-target failures for structurally eligible fields", () => {
    const result = parseJudgeResponse(
      JSON.stringify({
        results: [
          {
            rule_id: "format",
            verdict: "failed",
            reasoning: "현재 item_id 형식이 잘못됐습니다",
            evidence: {
              refs: [{ target: "cart_add_completed", field: "item_id" }],
            },
          },
          {
            rule_id: "sequence",
            verdict: "failed",
            reasoning: "누락 필드를 다시 검사했습니다",
            evidence: {
              refs: [{ target: "cart_add_completed", field: "missing_property" }],
            },
          },
        ],
      }),
      rules,
      { kind: "event", technicalName: "cart_add_completed", allowedFields: ["item_id"] },
    );

    expect(result).toMatchObject({
      ok: true,
      verdict: "failed",
      reasoning: "현재 item_id 형식이 잘못됐습니다",
      evidence: [expect.objectContaining({ rule_id: "format" })],
    });
  });

  it("keeps a custom-attribute failure referenced through its value", () => {
    const result = parseJudgeResponse(
      JSON.stringify({
        results: [
          {
            rule_id: "format",
            verdict: "failed",
            reasoning: "배열 원소에 필수 내부 필드가 없습니다",
            evidence: { refs: [{ target: "cart_list", field: "value" }] },
          },
        ],
      }),
      rules,
      { kind: "custom_attribute", technicalName: "cart_list", allowedFields: ["cart_list"] },
    );

    expect(result).toMatchObject({
      ok: true,
      verdict: "failed",
      reasoning: "배열 원소에 필수 내부 필드가 없습니다",
    });
  });
});
