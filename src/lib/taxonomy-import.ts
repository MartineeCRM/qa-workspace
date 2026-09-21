import yaml from "js-yaml";

export type ImportedAttribute = {
  technical_name: string;
  display_name: string | null;
  description: string | null;
  data_type: string;
  is_required: boolean;
  allowed_values: string[] | null;
  example_value?: string | null;
  /** array of object 하위 필드. array of object가 아니면 무시돼요. */
  properties?: ImportedAttribute[];
};

export type ImportedEvent = {
  technical_name: string;
  display_name: string | null;
  description: string | null;
  trigger_description: string | null;
  attributes: ImportedAttribute[];
};

export type ImportedTaxonomy = {
  events: ImportedEvent[];
  userAttributes: ImportedAttribute[];
};

const DATA_TYPES = new Set(["string", "number", "boolean", "array", "array of object"]);

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function toBool(value: unknown, defaultValue: boolean): boolean {
  const v = str(value).toLowerCase();
  if (!v) return defaultValue;
  return v === "true" || v === "y" || v === "yes" || v === "1" || v === "required" || v === "필수";
}

function unwrapQuotedValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return trimmed.length >= 2 && (quote === '"' || quote === "'") && trimmed.at(-1) === quote
    ? trimmed.slice(1, -1).trim()
    : trimmed;
}

export function parseAllowedValues(value: string): string[] {
  return value.split(/[|,]/).map(unwrapQuotedValue).filter(Boolean);
}

function toList(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const list = value.map((v) => unwrapQuotedValue(str(v))).filter(Boolean);
    return list.length ? list : null;
  }
  const raw = str(value);
  if (!raw) return null;
  const list = parseAllowedValues(raw);
  return list.length ? list : null;
}

function normaliseAttribute(
  input: Record<string, unknown>,
  requiredByDefault: boolean,
  warnings: string[],
  allowSubProperties = true,
): ImportedAttribute | null {
  const technical = str(input.technical_name ?? input.name ?? input.attribute);
  if (!technical) return null;
  const rawType = str(input.data_type ?? input.type).toLowerCase() || "string";
  const dataType = DATA_TYPES.has(rawType) ? rawType : "string";
  if (rawType !== dataType) {
    const eventName = str(input.event ?? input.event_name);
    const label = eventName ? `${eventName}.${technical}` : technical;
    warnings.push(`${label}: 알 수 없는 타입 "${rawType}" → string으로 등록했어요`);
  }

  let properties: ImportedAttribute[] | undefined;
  if (allowSubProperties && dataType === "array of object") {
    const rawProps = (input.properties ?? input.attributes ?? input.fields) as unknown;
    if (Array.isArray(rawProps)) {
      properties = rawProps
        .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
        // 하위 필드는 한 단계만 지원해요. 그 안의 properties는 무시해요.
        .map((p) => normaliseAttribute(p, false, warnings, false))
        .filter((p): p is ImportedAttribute => p !== null);
    }
  }

  return {
    technical_name: technical,
    display_name: str(input.display_name ?? input.label) || null,
    description: str(input.description) || null,
    data_type: dataType,
    is_required: toBool(input.is_required ?? input.required, requiredByDefault),
    allowed_values: toList(input.allowed_values ?? input.allowed ?? input.enum),
    example_value:
      input.example_value == null
        ? null
        : typeof input.example_value === "object"
          ? JSON.stringify(input.example_value)
          : String(input.example_value),
    ...(properties ? { properties } : {}),
  };
}

/* ---------------- CSV ---------------- */

// 따옴표 안의 줄바꿈은 셀 값의 일부로 취급해야 하므로, 줄 단위가 아니라
// 전체 텍스트를 한 번에 스캔해서 행을 나눈다.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        quoted = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cur.trim());
      cur = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cur.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      cur = "";
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  row.push(cur.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function parseCsvTaxonomy(text: string, warnings: string[]): ImportedTaxonomy {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV에 데이터 행이 없어요");
  const headers = rows[0].map((h) => h.toLowerCase());
  const dataRows = rows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });

  const events = new Map<string, ImportedEvent>();
  const userAttributes: ImportedAttribute[] = [];

  const ensureEvent = (name: string) => {
    let ev = events.get(name);
    if (!ev) {
      ev = {
        technical_name: name,
        display_name: null,
        description: null,
        trigger_description: null,
        attributes: [],
      };
      events.set(name, ev);
    }
    return ev;
  };

  // array of object 하위 필드(user_attribute_property)는 부모가 먼저 만들어져 있어야 하니 뒤로 미뤄요.
  const subPropertyRows: Record<string, string>[] = [];

  for (const row of dataRows) {
    const kind = (row.type || row.kind || "").toLowerCase();
    if (kind === "user_attribute_property") {
      subPropertyRows.push(row);
      continue;
    }
    const eventName = str(row.event ?? row.event_name);
    if (kind === "event" || (!kind && eventName && !str(row.technical_name))) {
      const ev = ensureEvent(eventName || str(row.technical_name));
      ev.display_name = str(row.display_name) || ev.display_name;
      ev.description = str(row.description) || ev.description;
      ev.trigger_description =
        str(row.trigger_description ?? row.trigger) || ev.trigger_description;
      continue;
    }
    const attr = normaliseAttribute(row, Boolean(eventName), warnings);
    if (!attr) continue;
    if (kind === "user_attribute" || (!eventName && kind !== "attribute")) {
      userAttributes.push(attr);
    } else if (eventName) {
      ensureEvent(eventName).attributes.push(attr);
    } else {
      userAttributes.push(attr);
    }
  }

  for (const row of subPropertyRows) {
    const parent = userAttributes.find((a) => a.technical_name === str(row.parent));
    if (!parent || parent.data_type !== "array of object") continue;
    const attr = normaliseAttribute(row, false, warnings, false);
    if (!attr) continue;
    (parent.properties ??= []).push(attr);
  }

  return { events: [...events.values()], userAttributes };
}

/* ---------------- JSON / YAML ---------------- */

function parseStructured(value: unknown, warnings: string[]): ImportedTaxonomy {
  if (!value || typeof value !== "object") throw new Error("파일 구조를 이해하지 못했어요");
  const root = value as Record<string, unknown>;
  const rawEvents = (root.events ?? root.taxonomy ?? []) as unknown;
  const rawUserAttrs = (root.user_attributes ?? root.userAttributes ?? []) as unknown;

  const events: ImportedEvent[] = [];
  if (Array.isArray(rawEvents)) {
    for (const raw of rawEvents) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Record<string, unknown>;
      const technical = str(e.technical_name ?? e.name ?? e.event);
      if (!technical) continue;
      const attrsRaw = (e.attributes ?? e.properties ?? []) as unknown;
      const attributes: ImportedAttribute[] = [];
      if (Array.isArray(attrsRaw)) {
        for (const a of attrsRaw) {
          if (!a || typeof a !== "object") continue;
          const attr = normaliseAttribute(a as Record<string, unknown>, true, warnings);
          if (attr) attributes.push(attr);
        }
      }
      events.push({
        technical_name: technical,
        display_name: str(e.display_name ?? e.label) || null,
        description: str(e.description) || null,
        trigger_description: str(e.trigger_description ?? e.trigger) || null,
        attributes,
      });
    }
  }

  const userAttributes: ImportedAttribute[] = [];
  if (Array.isArray(rawUserAttrs)) {
    for (const a of rawUserAttrs) {
      if (!a || typeof a !== "object") continue;
      const attr = normaliseAttribute(a as Record<string, unknown>, false, warnings);
      if (attr) userAttributes.push(attr);
    }
  }

  if (events.length === 0 && userAttributes.length === 0) {
    throw new Error("events 또는 user_attributes 항목을 찾지 못했어요");
  }
  return { events, userAttributes };
}

export function parseTaxonomyFile(fileName: string, text: string): ImportedTaxonomy {
  return parseTaxonomyFileWithWarnings(fileName, text);
}

export function parseTaxonomyFileWithWarnings(
  fileName: string,
  text: string,
): ImportedTaxonomy & { warnings: string[] } {
  const warnings: string[] = [];
  const lower = fileName.toLowerCase();
  let result: ImportedTaxonomy;
  if (lower.endsWith(".csv")) result = parseCsvTaxonomy(text, warnings);
  else if (lower.endsWith(".json")) result = parseStructured(JSON.parse(text), warnings);
  else if (lower.endsWith(".yaml") || lower.endsWith(".yml"))
    result = parseStructured(yaml.load(text), warnings);
  else {
    // 확장자를 모르면 내용으로 추측해요.
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("["))
      result = parseStructured(JSON.parse(trimmed), warnings);
    else if (trimmed.split(/\r?\n/)[0].includes(",")) result = parseCsvTaxonomy(text, warnings);
    else result = parseStructured(yaml.load(text), warnings);
  }
  return { ...result, warnings };
}

/* ---------------- 예시 데이터셋 ---------------- */

const SAMPLE: ImportedTaxonomy = {
  events: [
    {
      technical_name: "purchase",
      display_name: "구매 완료",
      description: "결제가 최종 완료된 시점에 수집해요.",
      trigger_description: "결제 성공 응답을 받은 직후 1회 발생해요.",
      attributes: [
        {
          technical_name: "order_no",
          display_name: "주문번호",
          description: "주문 고유 번호예요.",
          data_type: "string",
          is_required: true,
          allowed_values: null,
        },
        {
          technical_name: "payment_method",
          display_name: "결제수단",
          description: "사용한 결제수단이에요.",
          data_type: "string",
          is_required: true,
          allowed_values: ["card", "bank_transfer", "point"],
        },
        {
          technical_name: "amount",
          display_name: "결제금액",
          description: "부가세 포함 최종 결제 금액이에요.",
          data_type: "number",
          is_required: true,
          allowed_values: null,
        },
      ],
    },
    {
      technical_name: "view_item",
      display_name: "상품 상세 조회",
      description: "상품 상세 페이지 진입 시 수집해요.",
      trigger_description: "상품 상세 화면이 노출될 때 발생해요.",
      attributes: [
        {
          technical_name: "item_id",
          display_name: "상품 ID",
          description: "상품 고유 식별자예요.",
          data_type: "string",
          is_required: true,
          allowed_values: null,
        },
        {
          technical_name: "price",
          display_name: "상품 가격",
          description: "노출 시점의 판매가예요.",
          data_type: "number",
          is_required: false,
          allowed_values: null,
        },
      ],
    },
  ],
  userAttributes: [
    {
      technical_name: "user_grade",
      display_name: "회원 등급",
      description: "이벤트와 무관하게 유지되는 어트리뷰트예요.",
      data_type: "string",
      is_required: false,
      allowed_values: ["bronze", "silver", "gold"],
    },
    {
      technical_name: "cart_items",
      display_name: "장바구니 상품 목록",
      description: "현재 담긴 상품을 항목별로 담아요.",
      data_type: "array of object",
      is_required: false,
      allowed_values: null,
      properties: [
        {
          technical_name: "item_id",
          display_name: "상품 ID",
          description: "상품 고유 식별자예요.",
          data_type: "string",
          is_required: true,
          allowed_values: null,
        },
        {
          technical_name: "quantity",
          display_name: "수량",
          description: "담긴 개수예요.",
          data_type: "number",
          is_required: true,
          allowed_values: null,
        },
      ],
    },
  ],
};

/** events[].attributes → properties로 이름을 바꿔서 내보내요 (이벤트 속성을 부르는 실제 용어와 맞춰요). */
function eventForExport(e: ImportedEvent) {
  const { attributes, ...rest } = e;
  return { ...rest, properties: attributes };
}

export function sampleJson() {
  return JSON.stringify(
    {
      events: SAMPLE.events.map(eventForExport),
      user_attributes: SAMPLE.userAttributes,
    },
    null,
    2,
  );
}

export function sampleYaml() {
  return yaml.dump(
    { events: SAMPLE.events.map(eventForExport), user_attributes: SAMPLE.userAttributes },
    { lineWidth: 100 },
  );
}

export function sampleCsv() {
  const header =
    "type,event,technical_name,parent,display_name,data_type,required,allowed_values,description,trigger_description";
  const esc = (v: string | null) => {
    const s = v ?? "";
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header];
  for (const e of SAMPLE.events) {
    lines.push(
      [
        "event",
        e.technical_name,
        "",
        "",
        esc(e.display_name),
        "",
        "",
        "",
        esc(e.description),
        esc(e.trigger_description),
      ].join(","),
    );
    for (const a of e.attributes) {
      lines.push(
        [
          "attribute",
          e.technical_name,
          a.technical_name,
          "",
          esc(a.display_name),
          a.data_type,
          a.is_required ? "true" : "false",
          esc(a.allowed_values ? a.allowed_values.join("|") : ""),
          esc(a.description),
          "",
        ].join(","),
      );
    }
  }
  for (const a of SAMPLE.userAttributes) {
    lines.push(
      [
        "user_attribute",
        "",
        a.technical_name,
        "",
        esc(a.display_name),
        a.data_type,
        a.is_required ? "true" : "false",
        esc(a.allowed_values ? a.allowed_values.join("|") : ""),
        esc(a.description),
        "",
      ].join(","),
    );
    // array of object 하위 필드는 parent 컬럼에 부모 technical_name을 적어요.
    for (const p of a.properties ?? []) {
      lines.push(
        [
          "user_attribute_property",
          "",
          p.technical_name,
          a.technical_name,
          esc(p.display_name),
          p.data_type,
          p.is_required ? "true" : "false",
          esc(p.allowed_values ? p.allowed_values.join("|") : ""),
          esc(p.description),
          "",
        ].join(","),
      );
    }
  }
  return lines.join("\n");
}

export function downloadText(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
