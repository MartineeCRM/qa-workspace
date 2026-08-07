export type JudgePromptTarget =
  | { kind: "event"; technicalName: string; runEvents: unknown[] }
  | { kind: "custom_attribute"; technicalName: string; snapshots: unknown[] };

export type JudgePromptInput = {
  rules: Array<{ id: string; name: string; description: string }>;
  targets: JudgePromptTarget[];
  scope?: {
    kind: "event" | "custom_attribute";
    technicalName: string;
    allowedFields: string[];
  };
};

export type JudgeResponse =
  | {
      ok: true;
      verdict: "passed" | "failed";
      reasoning: string;
      evidence: unknown;
    }
  | { ok: false; error: string };

export const JUDGE_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "qa_judgement",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["rule_id", "verdict", "reasoning", "evidence"],
          properties: {
            rule_id: { type: "string" },
            verdict: { type: "string", enum: ["failed"] },
            reasoning: { type: "string" },
            evidence: {
              type: "object",
              additionalProperties: false,
              required: ["mismatch_dimensions", "observed_summary", "refs"],
              properties: {
                mismatch_dimensions: { type: "array", items: { type: "string" } },
                observed_summary: { type: "string" },
                refs: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["target", "field"],
                    properties: {
                      target: { type: "string" },
                      field: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

function compactPromptEvidence(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length <= 12) return value.map(compactPromptEvidence);
    return {
      __kind: "array_summary",
      length: value.length,
      samples: [...value.slice(0, 5), ...value.slice(-2)].map(compactPromptEvidence),
    };
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, compactPromptEvidence(nested)]),
    );
  }
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}… (전체 ${value.length}자)`;
  }
  return value;
}

export function parseJudgeResponse(
  text: string,
  rules: JudgePromptInput["rules"],
  scope?: JudgePromptInput["scope"],
): JudgeResponse {
  let parsed: {
    results?: Array<{
      rule_id?: string;
      verdict?: string;
      reasoning?: string;
      evidence?: unknown;
    }>;
  };
  try {
    parsed = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    return { ok: false, error: "AI 응답을 JSON으로 해석하지 못했어요." };
  }
  if (!Array.isArray(parsed.results)) {
    return { ok: false, error: "AI 응답에 규칙별 results가 없어요." };
  }
  const ruleIds = new Set(rules.map((rule) => rule.id));
  const failed = parsed.results.filter(
    (result) => result.verdict === "failed" && ruleIds.has(result.rule_id ?? ""),
  );
  if (failed.length !== parsed.results.length) {
    return { ok: false, error: "AI가 요청하지 않은 규칙의 결과를 반환했어요." };
  }
  const scoped = scope
    ? failed.filter((result) => {
        const evidence = result.evidence as { refs?: unknown } | undefined;
        if (!Array.isArray(evidence?.refs)) return false;
        const currentRefs = evidence.refs.filter((ref) => {
          if (!ref || typeof ref !== "object") return false;
          const target = (ref as { target?: unknown }).target;
          return (
            typeof target === "string" &&
            (target === scope.technicalName || target.startsWith(`${scope.technicalName}.`))
          );
        });
        return (
          currentRefs.length > 0 &&
          currentRefs.every((ref) => {
            const field = (ref as { field?: unknown }).field;
            return (
              typeof field === "string" &&
              (scope.allowedFields.includes(field) ||
                (scope.kind === "custom_attribute" &&
                  (field === "value" ||
                    field === "payload" ||
                    scope.allowedFields.some((allowed) => field === `payload.${allowed}`))) ||
                field === "event" ||
                field === "occurred_at")
            );
          })
        );
      })
    : failed;
  const deduped = Array.from(
    new Map(scoped.map((result) => [result.reasoning?.trim(), result])).values(),
  );
  return {
    ok: true,
    verdict: deduped.length > 0 ? "failed" : "passed",
    reasoning: deduped
      .map((result) => result?.reasoning?.trim())
      .filter(Boolean)
      .join("\n"),
    evidence: deduped,
  };
}

export const JUDGE_SYSTEM_PROMPT = [
  "당신은 이벤트 트래킹 QA 판정 엔진입니다. 각 검증 규칙을 근거 로그와 독립적으로 대조하세요.",
  "",
  "판정 원칙:",
  "- 데이터 타입이 같다는 이유만으로 통과시키지 마세요.",
  "- 이 단계에 전달된 값은 앞선 Rule-based 데이터 타입 및 enum 검사를 통과했습니다. 특히 택소노미 타입이 array이면 실제 배열을 문자열이어야 한다고 판단하지 마세요.",
  "- '현재 판정 대상'만 판정하세요. 함께 제공된 연관 로그는 현재 대상의 규칙을 확인하기 위한 근거일 뿐, 연관 로그 자체의 독립적인 오류를 이 결과에 넣지 마세요.",
  "- 결과의 refs에는 반드시 현재 판정 대상과 허용된 판정 필드 중 하나를 포함하세요. 누락·타입·enum 검사에서 제외된 필드는 언급하지 마세요.",
  "- 같은 원인과 실제값이 여러 필드에서 반복되면 프로퍼티명을 묶어 한 번만 설명하세요.",
  "- 배열 타입은 배열 여부만 확인하고 끝내지 마세요. 배열 원소가 문자열이면 각 문자열의 내부 구조, 구분자, 필드명, 필드별 값 형식까지 검증하세요.",
  "- 배열의 문자열 예시가 `|` 등으로 구분된 `키_값` 구조라면 예시에 반복해서 나타나는 키 집합을 원소의 구조 계약으로 봅니다. 설명에서 선택 항목이라고 밝히지 않은 키가 실제 원소에 빠지면 실패입니다.",
  "- 먼저 프로퍼티명, 설명, 허용값, 예시값을 종합해 기대 계약을 데이터 타입, 구조, 표현 체계, 의미 영역, 정규화 규칙으로 분해하세요.",
  "- 실제값도 같은 차원으로 독립적으로 분류한 뒤 기대 계약과 하나씩 비교하세요.",
  "- 구조는 단일 값·목록·객체·날짜/시간·URL·식별자 등을 구분하세요.",
  "- 표현 체계는 사람이 읽는 명칭·코드/축약어·내부 식별자·URL/경로·자연어·정형 날짜/숫자·열거형 등을 구분하세요.",
  "- 정규화 규칙은 대소문자, 공백, 구분자, 단위, 시간대, 언어, URL 스킴 등을 포함합니다.",
  "- 데이터 타입이 같아도 구조, 표현 체계, 의미 영역, 정규화 규칙 중 하나라도 기대 계약과 다르면 실패입니다.",
  "- 실제값이 예시와 변환·번역·추론 가능한 관계여도 임의로 기대값에 맞춰 해석하지 마세요. 일부 단어가 유사한 것도 통과 근거가 아닙니다.",
  "- 예: 사람이 읽는 명칭과 URL, 명칭과 코드, 외부 공개 값과 내부 식별자, 정형 날짜와 자연어 날짜, 서로 다른 단위는 표현 계약 불일치입니다.",
  "- 위 예시는 특정 프로퍼티의 예외 목록이 아니라 서로 다른 표현 체계를 통과시키지 말라는 일반 원칙입니다.",
  "- 이벤트의 occurred_at은 이벤트 발생 시각이고, 어트리뷰트 스냅샷의 captured_at은 스냅샷을 조회한 시각입니다. 두 시각이 같아야 한다고 판단하지 마세요.",
  "- 어트리뷰트 값 안의 date 같은 발생 시각은 대응되는 이벤트의 occurred_at과 비교하세요. 스냅샷 captured_at과 비교하지 마세요.",
  "- 배열의 최신값 위치나 정렬 방향은 검증 규칙이나 택소노미 설명에 명시된 경우에만 판정하세요. 명시가 없으면 오름차순과 내림차순 모두 허용하며, 대상 이름이나 일반적인 사용 방식을 근거로 순서를 추측하지 마세요.",
  "- 보수적으로 판정하라는 원칙은 명시된 기대 계약에만 적용합니다. 정의되지 않은 시간 관계나 배열 순서 규칙을 새로 만들어 실패시키지 마세요.",
  "- 명시된 기대 계약을 적용할 때 실제값의 의미가 불확실하거나 근거가 부족하면 보수적으로 실패로 판정하고, 확인할 수 없는 차원을 이유에 적으세요.",
  "- 'A가 발생하면 B가 발생해야 한다' 같은 조건부 규칙은 A가 없으면 통과, A가 있는데 B가 없으면 실패입니다.",
  "- 로그가 없는 대상도 빈 배열 자체가 근거입니다. 추측으로 존재한다고 간주하지 마세요.",
  '- `__kind: "array_summary"`는 긴 배열의 길이와 대표값만 줄여 보낸 것입니다. 객체로 오해하지 마세요.',
  "- 모든 규칙을 판정하되 실패한 규칙만 results에 넣으세요. 모두 통과하면 빈 배열을 반환하세요.",
  "",
  "사용자에게 보여줄 reasoning 작성법:",
  "- 쉬운 한국어로 핵심만 1~2문장으로 쓰세요.",
  "- 첫 문장에 무엇이 잘못됐는지 바로 쓰고, 필요하면 둘째 문장에 실제로 들어온 값을 쓰세요.",
  "- 같은 결론을 반복하거나 판정 과정을 길게 설명하지 마세요. 자세한 분석은 evidence에만 넣으세요.",
  "- '입증', '혼재', '임의 해석', '표현 체계', '의미 영역', '정규화 규칙' 같은 딱딱한 말은 reasoning에서 쓰지 마세요.",
  '- 예: "`referral_source`가 없습니다. 대신 철자가 다른 `refferal_source`가 들어왔습니다."',
  "- evidence에는 원본 로그나 배열을 다시 복사하지 마세요. 짧은 observed_summary와 근거 대상·필드만 refs에 적으세요.",
  "",
  "응답 형식:",
  "- 다른 설명이나 마크다운 코드 블록 없이 순수 JSON만 출력하세요.",
  '- {"results":[{"rule_id":"실패한 규칙 ID","verdict":"failed","reasoning":"쉽고 짧은 실패 이유 1~2문장","evidence":{"mismatch_dimensions":["불일치 차원"],"observed_summary":"실제 근거의 짧은 요약","refs":[{"target":"대상 기술명","field":"근거 필드명"}]}}]} 형식입니다.',
  '- results에는 실패한 규칙만 넣고 각 verdict는 반드시 "failed"여야 합니다. 모두 통과하면 {"results":[]}를 반환하세요.',
].join("\n");

export function buildJudgeRequest(input: JudgePromptInput): string {
  const evidenceLines = input.targets.map((t) =>
    t.kind === "event"
      ? `- 이벤트 "${t.technicalName}" 로그: ${JSON.stringify(compactPromptEvidence(t.runEvents))}`
      : `- 어트리뷰트 "${t.technicalName}" 스냅샷: ${JSON.stringify(compactPromptEvidence(t.snapshots))}`,
  );

  return [
    ...(input.scope
      ? [
          `현재 판정 대상: ${input.scope.kind} ${JSON.stringify(input.scope.technicalName)}`,
          `허용된 판정 필드: ${JSON.stringify(input.scope.allowedFields)}`,
          "연관 로그는 비교 근거로만 사용하세요.",
          "",
        ]
      : []),
    "검증 규칙:",
    ...input.rules.map(
      (rule) =>
        `- ID=${JSON.stringify(rule.id)}, 이름=${JSON.stringify(rule.name)}, 조건=${JSON.stringify(rule.description)}`,
    ),
    "",
    "근거:",
    ...evidenceLines,
  ].join("\n");
}

export function buildJudgePrompt(input: JudgePromptInput): string {
  return `${JUDGE_SYSTEM_PROMPT}\n\n${buildJudgeRequest(input)}`;
}
