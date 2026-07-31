export type ParsedRunEventRow = {
  raw_event_name: string;
  occurred_at: string;
  external_user_id: string;
  raw_properties: Record<string, unknown>;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function parseRunEventsCsv(text: string): ParsedRunEventRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toUpperCase());
  const nameIdx = headers.indexOf("NAME");
  const timeIdx = headers.indexOf("TIME");
  const userIdIdx = headers.indexOf("USER_ID");
  const propsIdx = headers.indexOf("PROPERTIES");

  if (nameIdx === -1 || timeIdx === -1 || userIdIdx === -1) {
    throw new Error("CSV에 NAME, TIME, USER_ID 컬럼이 필요해요");
  }

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    let raw_properties: Record<string, unknown> = {};
    const rawProps = propsIdx === -1 ? "" : (cells[propsIdx] ?? "");
    if (rawProps) {
      try {
        const parsed = JSON.parse(rawProps);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          raw_properties = parsed as Record<string, unknown>;
        }
      } catch {
        raw_properties = {};
      }
    }
    return {
      raw_event_name: cells[nameIdx] ?? "",
      occurred_at: cells[timeIdx] ?? "",
      external_user_id: cells[userIdIdx] ?? "",
      raw_properties,
    };
  });
}
