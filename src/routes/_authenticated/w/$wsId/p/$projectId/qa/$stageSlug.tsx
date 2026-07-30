import { useMemo, useRef, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Play, Upload } from "lucide-react";

import { EmptyState, Panel, PageHeader } from "@/components/app/layout-parts";
import { CoverageBar } from "@/components/app/coverage";
import { ItemStatusBadge, Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildCoverageItems,
  db,
  stageCoverage,
  statusKey,
  useProjectItemStatuses,
  useRules,
  useRuns,
  useStages,
  useTaxonomyAttributes,
  useTaxonomyEvents,
  useUploads,
  type CoverageItem,
} from "@/lib/queries";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { canEdit, errorMessage, formatDateTime, ITEM_STATUSES, ITEM_STATUS_LABEL, type ItemStatus } from "@/lib/domain";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug")({
  head: () => ({
    meta: [
      { title: "QA 환경 — 커버리지와 검증 결과" },
      {
        name: "description",
        content:
          "CSV 증적을 올리고 분석을 돌려서 현재 택소노미 기준의 검증 결과를 확인해요.",
      },
      { property: "og:title", content: "QA 환경 — 커버리지와 검증 결과" },
      {
        property: "og:description",
        content: "QA 환경 하나의 CSV 업로드, 분석 기록, 실시간 커버리지예요.",
      },
    ],
  }),
  component: StagePage,
});

type ParsedCsv = { headers: string[]; rows: Record<string, string>[] };

function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line: string) => {
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
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
  return { headers, rows };
}

const EVENT_COLUMNS = ["event", "event_name", "eventname", "name"];

function StagePage() {
  const { projectId, stageSlug } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug",
  });
  const qc = useQueryClient();
  const { role } = useWorkspaceContext();
  const { user } = useAuth();
  const editable = canEdit(role);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const { data: stages = [] } = useStages(projectId);
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: attributes = [] } = useTaxonomyAttributes(projectId);
  const { data: rules = [] } = useRules(projectId);
  const { data: statuses = [] } = useProjectItemStatuses(projectId);

  const stage = stages.find((s) => s.slug === stageSlug);
  const { data: uploads = [] } = useUploads(stage?.id ?? "");
  const { data: runs = [] } = useRuns(stage?.id ?? "");

  const items = useMemo(() => buildCoverageItems(events, attributes), [events, attributes]);
  const statusByKey = useMemo(() => {
    const map = new Map<string, ItemStatus>();
    for (const s of statuses) if (s.stage_id === stage?.id) map.set(statusKey(s), s.status);
    return map;
  }, [statuses, stage?.id]);

  if (stages.length > 0 && !stage) {
    return (
      <div className="p-6">
        <EmptyState title="QA 환경을 찾을 수 없어요" description="이 프로젝트에는 없는 환경이에요." />
      </div>
    );
  }
  if (!stage) return <div className="p-6" />;

  const cov = stageCoverage(items, statuses, stage.id);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const attrById = new Map(attributes.map((a) => [a.id, a]));

  function itemLabel(item: CoverageItem) {
    if (item.kind === "event") return item.label;
    const attr = attrById.get(item.id);
    const parent = attr?.event_id ? eventById.get(attr.event_id) : null;
    return `${parent ? `${parent.technical_name}.` : ""}${item.label}`;
  }

  const visibleItems = items.filter((item) => {
    const st = statusByKey.get(item.key) ?? "not_started";
    if (filter === "all") return true;
    if (filter === "unverified") return st !== "verified";
    return st === filter;
  });

  async function setStatus(item: CoverageItem, status: ItemStatus, runId?: string | null) {
    if (!stage) return;
    const payload = {
      project_id: projectId,
      stage_id: stage.id,
      event_id: item.kind === "event" ? item.id : null,
      attribute_id: item.kind === "attribute" ? item.id : null,
      status,
      last_run_id: runId ?? null,
      updated_by: user?.id ?? null,
    };
    const { error } = await db
      .from("qa_item_status")
      .upsert(payload, { onConflict: "stage_id,event_id,attribute_id" });
    if (error) return toast.error(errorMessage(error));
    qc.invalidateQueries({ queryKey: ["item-status", projectId] });
  }

  async function handleFile(file: File) {
    if (!stage) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        toast.error("CSV에 데이터 행이 없어요");
        return;
      }
      const { data: upload, error: uploadError } = await db
        .from("qa_uploads")
        .insert({
          project_id: projectId,
          stage_id: stage.id,
          file_name: file.name,
          row_count: parsed.rows.length,
          uploaded_by: user?.id ?? null,
        })
        .select()
        .single();
      if (uploadError) throw uploadError;

      await runAnalysis(parsed, upload.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runAnalysis(parsed: ParsedCsv, uploadId: string | null) {
    if (!stage) return;
    const eventColumn = parsed.headers.find((h) => EVENT_COLUMNS.includes(h.toLowerCase()));
    const seenEvents = new Set<string>();
    const seenAttributes = new Set<string>();

    for (const row of parsed.rows) {
      const eventName = eventColumn ? row[eventColumn] : "";
      if (eventName) seenEvents.add(eventName);
      for (const header of parsed.headers) {
        if (header === eventColumn) continue;
        if ((row[header] ?? "") === "") continue;
        seenAttributes.add(`${eventName}::${header}`);
        seenAttributes.add(`::${header}`);
      }
    }

    const rows = items.map((item) => {
      let status: ItemStatus = "not_started";
      if (item.kind === "event") {
        status = seenEvents.has(item.label) ? "verified" : "failed";
      } else {
        const attr = attrById.get(item.id);
        const parent = attr?.event_id ? eventById.get(attr.event_id) : null;
        const key = parent ? `${parent.technical_name}::${item.label}` : `::${item.label}`;
        if (seenAttributes.has(key)) status = "verified";
        else if (parent && !seenEvents.has(parent.technical_name)) status = "not_started";
        else status = "failed";
      }
      return {
        project_id: projectId,
        stage_id: stage.id,
        event_id: item.kind === "event" ? item.id : null,
        attribute_id: item.kind === "attribute" ? item.id : null,
        status,
        updated_by: user?.id ?? null,
      };
    });

    if (rows.length) {
      const { error } = await db
        .from("qa_item_status")
        .upsert(rows, { onConflict: "stage_id,event_id,attribute_id" });
      if (error) throw error;
    }

    const verified = rows.filter((r) => r.status === "verified").length;
    const { error: runError } = await db.from("qa_analysis_runs").insert({
      project_id: projectId,
      stage_id: stage.id,
      upload_id: uploadId,
      status: "completed",
      completed_at: new Date().toISOString(),
      created_by: user?.id ?? null,
      summary: {
        rows: parsed.rows.length,
        taxonomy_items: items.length,
        verified,
        failed: rows.length - verified,
        rules_applied: rules.filter((r) => r.is_enabled).length,
      },
    });
    if (runError) throw runError;

    qc.invalidateQueries({ queryKey: ["item-status", projectId] });
    qc.invalidateQueries({ queryKey: ["uploads", stage.id] });
    qc.invalidateQueries({ queryKey: ["runs", stage.id] });
    toast.success(`분석을 마쳤어요 — 전체 ${items.length}개 중 ${verified}개가 검증됐어요`);
  }

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        title={stage.name}
        description={
          stage.description ??
          "이 환경은 현재 택소노미를 검증해요. 검증 상태만 저장하고, 자체 규칙은 갖지 않아요."
        }
        actions={
          editable ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> CSV 올리고 분석하기
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel title="커버리지" description="현재 택소노미를 기준으로 실시간 계산돼요.">
          <div className="space-y-3 px-4 py-4">
            <CoverageBar verified={cov.verified} failed={cov.failed} total={cov.total} />
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Pill>검증 완료 {cov.verified}</Pill>
              <Pill>실패 {cov.failed}</Pill>
              <Pill>미시작 {cov.notStarted}</Pill>
              <Pill>택소노미 규칙 {rules.filter((r) => r.is_enabled).length}개</Pill>
            </div>
          </div>
        </Panel>
        <Panel title="최근 분석" description="검증 증적이에요.">
          {runs.length === 0 ? (
            <EmptyState icon={Play} title="아직 분석 기록이 없어요" description="CSV를 올리면 분석이 실행돼요." />
          ) : (
            <div className="space-y-1 px-4 py-4 text-sm">
              <p className="font-medium">{formatDateTime(runs[0].created_at)}</p>
              <p className="text-xs text-muted-foreground">
                {String(runs[0].summary?.rows ?? 0)}행 · 택소노미 {String(runs[0].summary?.taxonomy_items ?? 0)}개 중{" "}
                {String(runs[0].summary?.verified ?? 0)}개 검증
              </p>
            </div>
          )}
        </Panel>
      </div>

      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results">검증 결과</TabsTrigger>
          <TabsTrigger value="uploads">업로드·분석 기록</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 항목</SelectItem>
                <SelectItem value="unverified">미검증 항목</SelectItem>
                {ITEM_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ITEM_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              택소노미 {items.length}개 중 {visibleItems.length}개 표시 중이에요
            </p>
          </div>
          <Panel>
            {visibleItems.length === 0 ? (
              <EmptyState
                title="표시할 항목이 없어요"
                description="택소노미가 비어 있거나, 선택한 필터에 해당하는 항목이 없어요."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>항목</TableHead>
                    <TableHead className="w-28">종류</TableHead>
                    <TableHead className="w-36">상태</TableHead>
                    <TableHead className="w-44 text-right">상태 변경</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((item) => {
                    const st = statusByKey.get(item.key) ?? "not_started";
                    return (
                      <TableRow key={item.key}>
                        <TableCell className="mono-token text-xs">{itemLabel(item)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.kind === "event" ? "이벤트" : "속성"}
                        </TableCell>
                        <TableCell>
                          <ItemStatusBadge status={st} />
                        </TableCell>
                        <TableCell className="text-right">
                          {editable ? (
                            <Select value={st} onValueChange={(v) => setStatus(item, v as ItemStatus)}>
                              <SelectTrigger className="ml-auto h-8 w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ITEM_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {ITEM_STATUS_LABEL[s]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="uploads" className="mt-4 space-y-4">
          <Panel title="CSV 업로드" description="증적으로만 보관해요. 커버리지는 업로드로 고정되지 않아요.">
            {uploads.length === 0 ? (
              <EmptyState icon={FileUp} title="아직 업로드한 파일이 없어요" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>파일</TableHead>
                    <TableHead className="w-28">행 수</TableHead>
                    <TableHead className="w-56">업로드 시각</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploads.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="mono-token text-xs">{u.file_name}</TableCell>
                      <TableCell className="tabular-nums">{u.row_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(u.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>

          <Panel title="분석 기록" description="지난 검증 증적이에요.">
            {runs.length === 0 ? (
              <EmptyState icon={Play} title="아직 분석 기록이 없어요" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-56">실행 시각</TableHead>
                    <TableHead>요약</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {String(r.summary?.rows ?? 0)}행 · 검증 {String(r.summary?.verified ?? 0)} · 실패{" "}
                        {String(r.summary?.failed ?? 0)} · 규칙 {String(r.summary?.rules_applied ?? 0)}개 적용
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

    </div>
  );
}
