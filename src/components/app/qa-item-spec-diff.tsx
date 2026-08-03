import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/domain";
import { buildEventSpecDiffRows, type SpecDiffRow, type SpecDiffVerdict } from "@/lib/qa-workflow";
import {
  useAddDiscoveredEventProperty,
  useRenameEventProperty,
  useUpdateEventPropertyAllowedValues,
  useUpdateEventPropertyDataType,
  useUpdateEventPropertyRequired,
  type TaxonomyEventProperty,
} from "@/lib/queries";

type FilterKey = "필수 누락" | "미정의" | "타입" | "값·형식" | "통과" | "전체";
type FixAction = "type" | "optional" | "allow_value" | "add" | "rename";

const OBSERVED_TYPE_TO_TAXONOMY_TYPE: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  array: "array",
};

// Unlike observedSample (a real typed value from the log, where JSON.stringify
// usefully distinguishes e.g. the string "true" from the boolean true), the
// taxonomy's example_value is always free descriptive text authored in a
// spreadsheet — even for boolean/number properties, e.g. is_login's example is
// the string "true", not the boolean. Stringifying it would just double-quote
// and escape a value that's already meant to be read as plain text.
function formatExampleValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function verdictBadge(verdict: SpecDiffVerdict) {
  if (verdict === "missing_required") {
    return { label: "필수 누락", className: "bg-[#fdecec] text-[#dc2626]" };
  }
  if (verdict === "type_mismatch") {
    return { label: "타입", className: "bg-[#fdecec] text-[#dc2626]" };
  }
  if (verdict === "value_mismatch") {
    return { label: "값", className: "bg-[#fdecec] text-[#dc2626]" };
  }
  if (verdict === "semantic_mismatch") {
    return { label: "형식·의미", className: "bg-[#fdecec] text-[#dc2626]" };
  }
  if (verdict === "undefined_property") {
    return { label: "미정의", className: "bg-[#fdf3e3] text-[#b45309]" };
  }
  return { label: "통과", className: "bg-[#e8f5ec] text-[#16a34a]" };
}

function typeChip(type: string, tone: "as-is" | "mismatch" | "undefined" | "pass") {
  const toneClass =
    tone === "mismatch"
      ? "bg-[#fdecec] text-[#dc2626] font-semibold"
      : tone === "undefined"
        ? "bg-[#fdf3e3] text-[#b45309] font-semibold"
        : tone === "pass"
          ? "bg-[#e8f5ec] text-[#16a34a] font-semibold"
          : "bg-[#f1f4f8] text-[#64748b]";
  return (
    <code className={cn("rounded-md px-1.5 py-0.5 font-mono text-[12.5px]", toneClass)}>
      {type}
    </code>
  );
}

export function QaItemSpecDiffTable({
  projectId,
  eventId,
  properties,
  rawPropertiesList,
  aiFailedPropertyIds,
  onReanalyze,
  onCreateIssue,
}: {
  projectId: string;
  eventId: string;
  properties: TaxonomyEventProperty[];
  rawPropertiesList: Record<string, unknown>[];
  aiFailedPropertyIds: Set<string>;
  onReanalyze: () => Promise<void>;
  onCreateIssue: (target: { id: string; label: string }) => void;
}) {
  const { user } = useAuth();
  const updateDataType = useUpdateEventPropertyDataType(projectId);
  const updateRequired = useUpdateEventPropertyRequired(projectId);
  const updateAllowedValues = useUpdateEventPropertyAllowedValues(projectId);
  const renameProperty = useRenameEventProperty(projectId);
  const addProperty = useAddDiscoveredEventProperty(projectId);
  const [filter, setFilter] = useState<FilterKey>("전체");
  const [fixes, setFixes] = useState<Record<string, FixAction | null>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setFixes({});
  }, [eventId]);

  const rows = useMemo(
    () =>
      buildEventSpecDiffRows({
        properties: properties.map((p) => ({
          id: p.id,
          technical_name: p.technical_name,
          data_type: p.data_type,
          is_required: p.is_required,
          allowed_values: Array.isArray(p.allowed_values) ? (p.allowed_values as string[]) : null,
          example_value: p.example_value,
        })),
        rawPropertiesList,
        aiFailedPropertyIds,
      }),
    [properties, rawPropertiesList, aiFailedPropertyIds],
  );

  const typeMismatchRows = rows.filter((r) => r.verdict === "type_mismatch");
  const undefinedRows = rows.filter((r) => r.verdict === "undefined_property");
  const missingRows = rows.filter((r) => r.verdict === "missing_required");
  const valueRows = rows.filter(
    (r) => r.verdict === "value_mismatch" || r.verdict === "semantic_mismatch",
  );
  const passedRows = rows.filter((r) => r.verdict === "pass");
  const mismatchRows = rows.filter((r) => r.verdict !== "pass");
  const mismatchTotal = mismatchRows.length;

  const filters: Array<{ key: FilterKey; label: string }> = [
    { key: "필수 누락", label: `필수 누락 ${missingRows.length}` },
    { key: "미정의", label: `미정의 ${undefinedRows.length}` },
    { key: "타입", label: `타입 ${typeMismatchRows.length}` },
    { key: "값·형식", label: `값·형식 ${valueRows.length}` },
    { key: "통과", label: `통과 ${passedRows.length}` },
    { key: "전체", label: `전체 ${rows.length}` },
  ];

  const shown =
    filter === "전체"
      ? rows
      : filter === "필수 누락"
        ? missingRows
        : filter === "타입"
          ? typeMismatchRows
          : filter === "미정의"
            ? undefinedRows
            : filter === "값·형식"
              ? valueRows
              : passedRows;

  function actionsFor(row: SpecDiffRow): Array<{ key: FixAction; label: string }> {
    if (row.verdict === "pass") {
      return [];
    }
    if (row.verdict === "missing_required") {
      return [{ key: "optional", label: "택소노미에서 선택값으로" }];
    }
    if (row.verdict === "type_mismatch") {
      const observedTaxonomyType = OBSERVED_TYPE_TO_TAXONOMY_TYPE[row.observedType];
      const actions: Array<{ key: FixAction; label: string }> = [];
      if (observedTaxonomyType) {
        actions.push({ key: "type", label: `택소노미를 ${observedTaxonomyType}(으)로` });
      }
      return actions;
    }
    if (row.verdict === "value_mismatch") {
      return [{ key: "allow_value", label: `${JSON.stringify(row.observedSample)} 허용값 추가` }];
    }
    if (row.verdict === "semantic_mismatch") {
      return [];
    }
    // undefined_property
    const actions: Array<{ key: FixAction; label: string }> = [];
    if (row.typoCandidate) {
      actions.push({ key: "rename", label: `이름 매핑 · ${row.typoCandidate.name} 수정` });
    }
    actions.push({
      key: "add",
      label: row.typoCandidate ? "새 프로퍼티로 추가" : "택소노미에 추가",
    });
    return actions;
  }

  function toggleFix(name: string, action: FixAction) {
    setFixes((prev) => ({ ...prev, [name]: prev[name] === action ? null : action }));
  }

  const activeMismatchNames = useMemo(
    () => new Set(mismatchRows.map((r) => r.name)),
    [mismatchRows],
  );
  const resolvedCount = Object.entries(fixes).filter(
    ([name, action]) => Boolean(action) && activeMismatchNames.has(name),
  ).length;
  const pendingEntries = Object.entries(fixes).filter(
    (entry): entry is [string, FixAction] => Boolean(entry[1]) && activeMismatchNames.has(entry[0]),
  );

  async function applyPending() {
    if (!user || pendingEntries.length === 0) return;
    setApplying(true);
    try {
      for (const [name, action] of pendingEntries) {
        const row = rows.find((r) => r.name === name);
        if (!row) continue;
        if (action === "type") {
          const dataType = OBSERVED_TYPE_TO_TAXONOMY_TYPE[row.observedType];
          if (!row.propertyId || !dataType) continue;
          await updateDataType.mutateAsync({ propertyId: row.propertyId, dataType });
        } else if (action === "optional") {
          if (!row.propertyId) continue;
          await updateRequired.mutateAsync({ propertyId: row.propertyId, isRequired: false });
        } else if (action === "allow_value") {
          if (!row.propertyId) continue;
          await updateAllowedValues.mutateAsync({
            propertyId: row.propertyId,
            allowedValues: [...(row.allowedValues ?? []), String(row.observedSample)],
          });
        } else if (action === "rename" && row.typoCandidate) {
          await renameProperty.mutateAsync({
            propertyId: row.typoCandidate.id,
            newTechnicalName: row.name,
          });
        } else if (action === "add") {
          await addProperty.mutateAsync({
            eventId,
            technicalName: row.name,
            dataType: OBSERVED_TYPE_TO_TAXONOMY_TYPE[row.observedType] ?? "string",
            sampleValue: row.observedSample,
            userId: user.id,
          });
        }
      }
      await onReanalyze();
      toast.success(`택소노미에 ${pendingEntries.length}건 반영하고 다시 판정했어요`);
      setFixes((prev) => {
        const next = { ...prev };
        for (const [name] of pendingEntries) delete next[name];
        return next;
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setApplying(false);
    }
  }

  return (
    <Panel
      title="스펙 대조"
      description="실제 로그로 들어온 형태(AS-IS)와 택소노미가 기대하는 형태(TO-BE)를 나란히 봅니다."
      actions={
        <div className="flex flex-wrap gap-1 rounded-lg bg-[#f1f4f8] p-[3px]">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs",
                filter === f.key
                  ? "bg-white font-semibold text-[#1c2431] shadow-sm"
                  : "text-[#8b97a8]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {/* Fixed-pixel action/badge columns need real minimum width — on a narrow
          left column this scrolls internally instead of bleeding into the right
          column (min-width:0 on the row grid alone isn't enough to fix that; the
          columns themselves have a floor via minmax(...)). */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-[minmax(150px,1fr)_minmax(110px,1fr)_minmax(150px,1.2fr)_66px_170px] gap-3 bg-[#fbfcfd] px-4 py-2 text-[11px] tracking-wide text-[#64748b]">
          <div>프로퍼티</div>
          <div>AS-IS · 실제 수신</div>
          <div>TO-BE · 택소노미 정의</div>
          <div>판정</div>
          <div>확인 및 처리</div>
        </div>

        {shown.length === 0 ? (
          <p className="min-w-[700px] px-4 py-6 text-center text-[12.5px] text-[#8b97a8]">
            이 필터에 해당하는 프로퍼티가 없어요.
          </p>
        ) : (
          <ul className="min-w-[700px]">
            {shown.map((row) => {
              const chosen = fixes[row.name] ?? null;
              const badge = verdictBadge(row.verdict);
              return (
                <li
                  key={row.name}
                  className={cn("border-b border-[#f4f6f9]", chosen ? "bg-[#fbfdfb]" : "bg-white")}
                >
                  <div className="grid grid-cols-[minmax(150px,1fr)_minmax(110px,1fr)_minmax(150px,1.2fr)_66px_170px] items-start gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <code className="mono-token break-all text-[12.5px]">{row.name}</code>
                      {row.typoCandidate ? (
                        <p className="mt-0.5 text-[11px] font-semibold text-[#4b4f8a]">
                          택소노미에 {row.typoCandidate.name} 있음
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      {typeChip(
                        row.observedType,
                        row.verdict === "type_mismatch" ? "mismatch" : "as-is",
                      )}
                      {row.observedSample !== undefined ? (
                        <p className="mt-0.5 truncate text-[11px] text-[#a3adbb]">
                          수신 값: {JSON.stringify(row.observedSample)}
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      {row.expectedType ? (
                        typeChip(row.expectedType, row.verdict === "pass" ? "pass" : "as-is")
                      ) : (
                        <code className="rounded-md bg-[#f1f4f8] px-1.5 py-0.5 text-[12.5px] text-[#a3adbb]">
                          정의 없음
                        </code>
                      )}
                      <p className="mt-0.5 truncate text-[11px] text-[#a3adbb]">
                        {!row.expectedType
                          ? "스펙에 누락"
                          : row.expectedExample !== null && row.expectedExample !== undefined
                            ? `예: ${formatExampleValue(row.expectedExample)}`
                            : "예시값 없음 · 택소노미에 추가해주세요"}
                      </p>
                    </div>
                    <div>
                      <span
                        className={cn(
                          "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {row.propertyId ? (
                        <Link
                          from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
                          to="/w/$wsId/p/$projectId/taxonomy"
                          params={(prev) => ({ wsId: prev.wsId, projectId: prev.projectId })}
                          search={{ propertyId: row.propertyId }}
                          className="rounded-md border border-[#e3e8ef] px-2 py-1 text-left text-[11.5px] leading-tight text-[#64748b] hover:border-[#2b6a9c] hover:text-[#2b6a9c]"
                        >
                          택소노미에서 수정
                        </Link>
                      ) : null}
                      {row.verdict !== "pass" ? (
                        <button
                          type="button"
                          onClick={() =>
                            onCreateIssue({
                              id: row.propertyId ?? `observed:${row.name}`,
                              label: row.name,
                            })
                          }
                          className="rounded-md border border-[#f0dfc0] bg-[#fdf9f1] px-2 py-1 text-left text-[11.5px] font-semibold leading-tight text-[#b45309]"
                        >
                          이슈 있음
                        </button>
                      ) : null}
                      {actionsFor(row).map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => toggleFix(row.name, a.key)}
                          className={cn(
                            "rounded-md px-2 py-1 text-left text-[11.5px] leading-tight",
                            chosen === a.key
                              ? "border border-[#4b4f8a] bg-[#f6f7fd] font-semibold text-[#4b4f8a]"
                              : "border border-[#e3e8ef] text-[#64748b]",
                          )}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {chosen === "rename" && row.typoCandidate ? (
                    <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#d9dcf3] bg-[#f6f7fd] px-3 py-2.5">
                      <p className="text-[11.5px] font-semibold text-[#4b4f8a]">
                        택소노미 이름 변경
                      </p>
                      <code className="rounded-md border border-[#d9dcf3] bg-white px-2 py-1 font-mono text-[12.5px] text-[#8b97a8] line-through">
                        {row.typoCandidate.name}
                      </code>
                      <span className="text-[#8b97a8]">→</span>
                      <code className="rounded-md border border-[#4b4f8a] bg-white px-2 py-1 font-mono text-[12.5px] font-semibold">
                        {row.name}
                      </code>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#eef1f5] bg-[#fbfcfd] px-4 py-3">
        <p className="text-[12.5px] text-[#5c6878]">
          {resolvedCount === 0
            ? `해소 방향 미정 ${mismatchTotal}건 — 각 행에서 택소노미를 고칠지, 구현을 고칠지 정해주세요.`
            : `해소 방향 정함 ${resolvedCount} · 남음 ${mismatchTotal - resolvedCount}`}
        </p>
      </div>

      {pendingEntries.length > 0 ? (
        <div className="m-4 rounded-[14px] border border-[#d9dcf3] bg-[#f6f7fd] px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-[13px] font-bold text-[#4b4f8a]">
              택소노미 변경 예정 {pendingEntries.length}건
            </p>
            <div className="flex-1" />
            <Button
              size="sm"
              disabled={applying}
              onClick={applyPending}
              className="bg-[#4b4f8a] hover:bg-[#3e4275]"
            >
              택소노미에 반영
            </Button>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[#5c6878]">
            택소노미 수정은 프로젝트 전체에 영향을 줘요. 반영 버튼을 눌러야 실제로 저장되고, 저장
            직후 이 세션을 다시 분석해 판정을 갱신해요.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {pendingEntries.map(([name, action]) => {
              const row = rows.find((r) => r.name === name);
              const label =
                action === "type"
                  ? `${name} : ${row?.expectedType} → ${OBSERVED_TYPE_TO_TAXONOMY_TYPE[row?.observedType ?? ""] ?? row?.observedType}`
                  : action === "optional"
                    ? `${name} : 필수 → 선택`
                    : action === "allow_value"
                      ? `${name} : 허용값 + ${JSON.stringify(row?.observedSample)}`
                      : action === "rename"
                        ? `${row?.typoCandidate?.name} → ${name}`
                        : `+ ${name} (${row?.observedType})`;
              return (
                <span
                  key={name}
                  className="mono-token rounded-md border border-[#d9dcf3] bg-white px-2 py-1 text-[11.5px] text-[#4b4f8a]"
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
