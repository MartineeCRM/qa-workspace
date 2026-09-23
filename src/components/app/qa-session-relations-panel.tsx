import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "./layout-parts";
import { Button } from "@/components/ui/button";
import {
  analyzeSessionRelations,
  getRelationResults,
  reviewRelationCandidate,
} from "@/lib/relation-analysis.functions";
import { errorMessage, formatDateTime } from "@/lib/domain";
import { useMyRole, useProject } from "@/lib/queries";
import { RELATION_RUNNING_TIMEOUT, type RelationReview } from "@/lib/relation-analysis";

const reviewLabels: Record<RelationReview, string> = {
  open: "확인 필요",
  confirmed: "문제 확인",
  normal: "정상 차이",
  deferred: "판단 보류",
};

export function QaSessionRelationsPanel({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  const qc = useQueryClient();
  const { data: project } = useProject(projectId);
  const { data: role } = useMyRole(project?.workspace_id ?? "");
  const editable = ["owner", "admin", "editor"].includes(role ?? "");
  const queryKey = ["qa-relations", sessionId];
  const results = useQuery({
    queryKey,
    queryFn: () => getRelationResults({ data: { sessionId } }),
    refetchInterval: (query) =>
      query.state.data?.analysis?.status === "running" &&
      Date.now() - Date.parse(query.state.data.analysis.started_at) < RELATION_RUNNING_TIMEOUT
        ? 2_000
        : false,
  });
  const explore = useMutation({
    mutationFn: () => analyzeSessionRelations({ data: { sessionId } }),
    onSuccess: (data) => qc.setQueryData(queryKey, data),
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });
  const review = useMutation({
    mutationFn: (data: { candidateId: string; status: RelationReview }) =>
      reviewRelationCandidate({ data }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const analysis = results.data?.analysis;
  const candidates = results.data?.candidates ?? [];
  const running =
    explore.isPending ||
    (analysis?.status === "running" &&
      Date.now() - Date.parse(analysis.started_at) < RELATION_RUNNING_TIMEOUT);
  const error = explore.error ?? review.error ?? results.error;

  return (
    <Panel
      title={`이벤트 간 관계 확인${candidates.length ? ` · ${candidates.length}건` : ""}`}
      description="AI가 관련 있어 보이는 로그의 차이를 찾습니다. 기존 단건 판정과 별도로 확인해 주세요."
      actions={
        editable ? (
          <Button size="sm" variant="outline" disabled={running} onClick={() => explore.mutate()}>
            {running ? "관계 탐색 중…" : analysis ? "다시 탐색" : "관계 탐색"}
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <p className="border-b px-4 py-3 text-sm text-destructive" role="alert">
          {errorMessage(error, "관계 탐색에 실패했어요. 다시 시도해 주세요.")}
        </p>
      ) : null}
      {running ? (
        <p className="px-4 py-4 text-sm text-muted-foreground" role="status">
          로그를 함께 읽고 연결 근거와 의심되는 차이를 찾고 있어요.
        </p>
      ) : null}
      {analysis ? (
        <div className="border-b bg-surface px-4 py-3 text-xs text-muted-foreground">
          <p>
            {formatDateTime(analysis.started_at)} 분석 · 전체 {analysis.total_logs}행 중{" "}
            {analysis.covered_logs}행 탐색 완료
          </p>
          {analysis.status === "partial" ? (
            <p className="mt-1">
              일부 범위만 탐색했습니다. 입력 크기나 분석 한도 때문에 빠진 로그, 묶음 사이의 관계는
              확인하지 못했을 수 있어요.
            </p>
          ) : null}
          {analysis.error ? (
            <p className="mt-1 text-destructive" role="alert">
              {analysis.error}
            </p>
          ) : null}
          <p className="mt-1">
            로그를 추가하거나 교체했다면 다시 탐색해 주세요. 관계 후보는 확정된 오류가 아닙니다.
          </p>
        </div>
      ) : null}
      {!running && !results.isPending && !error && !candidates.length ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {!analysis
            ? "아직 관계를 탐색하지 않았어요. 규칙을 미리 등록하지 않아도 시작할 수 있어요."
            : analysis.status === "failed" || analysis.status === "running"
              ? "관계 탐색을 완료하지 못했어요. 다시 탐색해 주세요."
              : analysis.total_logs === 0
                ? "비교할 이벤트 로그가 없어요. CSV를 업로드한 뒤 탐색해 주세요."
                : "탐색한 범위에서 근거가 있는 관계 후보를 찾지 못했어요. 모든 관계가 정상이라는 뜻은 아닙니다."}
        </p>
      ) : null}
      {results.isPending ? (
        <p className="px-4 py-6 text-sm text-muted-foreground" role="status">
          관계 탐색 기록을 불러오고 있어요.
        </p>
      ) : null}
      <div className="divide-y">
        {candidates.map((candidate) => (
          <article key={candidate.id} className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{candidate.title}</h3>
              <span className="rounded-sm border bg-surface-strong px-2 py-0.5 text-xs text-muted-foreground">
                {reviewLabels[candidate.review_status]}
              </span>
            </div>
            <p className="text-sm">{candidate.reasoning}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["left", "right"] as const).map((side) => {
                const log = candidate.evidence[side];
                const field = candidate.evidence[`${side}_field`];
                const value = candidate.evidence[`${side}_value`];
                return (
                  <div key={side} className="min-w-0 rounded-md border bg-surface p-3">
                    <p className="mono-token break-all text-sm font-semibold">
                      {log.raw_event_name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(log.occurred_at)} · 사용자 {log.external_user_id}
                    </p>
                    <p className="mt-2 break-all text-sm">
                      <span className="mono-token">{field}</span> :{" "}
                      <code>{JSON.stringify(value)}</code>
                    </p>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        근거 로그 보기
                      </summary>
                      <p className="mt-2 break-all text-muted-foreground">
                        로그 ID: {log.source_event_id ?? log.id}
                      </p>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(log.raw_properties, null, 2)}
                      </pre>
                    </details>
                  </div>
                );
              })}
            </div>
            <div className="text-xs leading-relaxed text-muted-foreground">
              <p>
                <span className="font-semibold">연결 근거</span> · {candidate.connection_reason}
              </p>
              <p className="mt-1 break-all">
                {candidate.evidence.anchors
                  .map(
                    (anchor) =>
                      `${anchor.left_field} ↔ ${anchor.right_field}: ${JSON.stringify(anchor.value)}`,
                  )
                  .join(" · ")}
              </p>
              <p className="mt-2">
                <span className="font-semibold">정상 차이일 가능성</span> ·{" "}
                {candidate.normal_exceptions.join(" / ")}
              </p>
            </div>
            {editable ? (
              <div className="flex flex-wrap gap-2">
                {(["confirmed", "normal", "deferred", "open"] as const).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant="outline"
                    disabled={review.isPending || candidate.review_status === status}
                    aria-pressed={candidate.review_status === status}
                    onClick={() => review.mutate({ candidateId: candidate.id, status })}
                  >
                    {status === "open" ? "확인 필요로 되돌리기" : reviewLabels[status]}
                  </Button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </Panel>
  );
}
