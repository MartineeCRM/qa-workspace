import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Activity, AlertTriangle, Layers, ListTree, ShieldCheck } from "lucide-react";

import { EmptyState, Panel, Stat } from "@/components/app/layout-parts";
import { CoverageBar } from "@/components/app/coverage";
import { Pill } from "@/components/app/badges";
import {
  buildCoverageItems,
  useActivity,
  useEnvironments,
  useProject,
  useRules,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
  type QaEnvironment,
} from "@/lib/queries";
import { useProjectChecklistCoverageRows } from "@/lib/qa-rounds-queries";
import {
  checklistCoverageIssues,
  checklistCoverageItems,
  environmentChecklistCoverage,
} from "@/lib/qa-workflow";
import { formatDateTime } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/")({
  head: () => ({
    meta: [
      { title: "프로젝트 개요 — 트래킹 커버리지" },
      {
        name: "description",
        content:
          "이 고객의 실시간 트래킹 커버리지예요. 택소노미 규모와 QA 환경별 검증 진행률을 한눈에 볼 수 있어요.",
      },
      { property: "og:title", content: "프로젝트 개요 — 트래킹 커버리지" },
      {
        property: "og:description",
        content: "QA 환경별 실시간 트래킹 커버리지와 팔로업이 필요한 이슈를 확인해요.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectOverview,
});

function ProjectOverview() {
  const { wsId, projectId } = useParams({ from: "/_authenticated/w/$wsId/p/$projectId/" });
  const { data: project } = useProject(projectId);
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: eventProperties = [] } = useTaxonomyEventProperties(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: rules = [] } = useRules(projectId);
  const { data: stages = [] } = useEnvironments(projectId);
  const { data: coverageRows = [] } = useProjectChecklistCoverageRows(projectId);
  const { data: activity = [] } = useActivity({ projectId, limit: 12 });

  const items = buildCoverageItems(events, eventProperties, customAttributes);
  const activeEvents = events.filter((e) => e.is_active).length;
  const activeAttributes = items.length - activeEvents;

  // See checklistCoverageItems in qa-workflow.ts: the checklist schema only
  // tracks events/custom attributes, so this is a narrower set than `items`.
  const checklistItems = checklistCoverageItems(items);
  const itemByKey = new Map(checklistItems.map((i) => [i.key, i]));
  const environmentById = new Map(stages.map((s) => [s.id, s]));
  const issues = checklistCoverageIssues(
    coverageRows,
    stages.map((s) => s.id),
  )
    .map((issue) => ({
      id: issue.checklistItemId,
      stage: environmentById.get(issue.environmentId),
      item: itemByKey.get(issue.itemKey),
      status: issue.status,
      roundId: issue.roundId,
      sessionId: issue.sessionId,
      checklistItemId: issue.checklistItemId,
    }))
    .filter((i) => i.stage && i.item)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "failed" ? -1 : 1));

  return (
    <div className="space-y-5 p-6">
      {project?.description ? (
        <p className="max-w-2xl text-sm text-muted-foreground">{project.description}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={ListTree} label="이벤트" value={activeEvents} />
        <Stat icon={Layers} label="속성" value={activeAttributes} />
        <Stat icon={ShieldCheck} label="전체 커버리지 항목" value={checklistItems.length} />
      </div>

      <Panel
        title="QA 환경별 실시간 커버리지"
        description="모든 환경은 현재 택소노미를 기준으로 측정돼요. 커버리지는 스냅샷으로 굳지 않아요."
        actions={
          <Link
            to="/w/$wsId/p/$projectId/taxonomy"
            params={{ wsId, projectId }}
            className="text-xs font-medium text-primary hover:underline"
          >
            택소노미 편집
          </Link>
        }
      >
        {stages.length === 0 ? (
          <EmptyState
            title="QA 환경이 없어요"
            description="프로젝트를 만들면 기본 환경이 함께 생겨요."
          />
        ) : (
          <ul className="divide-y">
            {stages.map((stage: QaEnvironment) => {
              const cov = environmentChecklistCoverage(checklistItems, coverageRows, stage.id);
              return (
                <li key={stage.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <Link
                      to="/w/$wsId/p/$projectId/qa/$stageSlug"
                      params={{ wsId, projectId, stageSlug: stage.slug }}
                      className="text-sm font-medium hover:underline"
                    >
                      {stage.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      실패 {cov.failed}건 · 미시작 {cov.notStarted}건
                    </span>
                  </div>
                  <CoverageBar
                    className="mt-2"
                    verified={cov.verified}
                    failed={cov.failed}
                    total={cov.total}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="팔로업이 필요한 QA 이슈"
          description="실패했거나 논의 중인 항목이에요. 위에서부터 처리하면 커버리지가 올라가요."
        >
          {issues.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="지금 팔로업할 이슈가 없어요"
              description="실패나 논의중으로 표시된 항목이 생기면 여기에 모여요."
            />
          ) : (
            <ul className="divide-y">
              {issues.slice(0, 12).map((issue) => (
                <li key={issue.id} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={
                        issue.status === "failed"
                          ? "mt-0.5 size-4 text-destructive"
                          : "mt-0.5 size-4 text-muted-foreground"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
                          params={{
                            wsId,
                            projectId,
                            stageSlug: issue.stage!.slug,
                            roundId: issue.roundId,
                            sessionId: issue.sessionId,
                            itemId: issue.checklistItemId,
                          }}
                          className="mono-token truncate text-sm font-medium hover:underline"
                        >
                          {issue.item!.label}
                        </Link>
                        <Pill>{issue.stage!.name}</Pill>
                        <Pill>{issue.status === "failed" ? "실패" : "논의중"}</Pill>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {issues.length > 12 ? (
                <li className="px-4 py-2 text-xs text-muted-foreground">
                  외 {issues.length - 12}건이 더 있어요.
                </li>
              ) : null}
            </ul>
          )}
        </Panel>

        <Panel title="최근 활동" description="이 프로젝트에서 최근에 일어난 변경이에요.">
          {activity.length === 0 ? (
            <EmptyState icon={Activity} title="아직 활동 기록이 없어요" />
          ) : (
            <ul className="divide-y">
              {activity.map((entry) => (
                <li key={entry.id} className="px-4 py-2 text-sm">
                  <p>{entry.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="text-xs text-muted-foreground">
        택소노미에는 이벤트 {events.length}개, 속성{" "}
        {eventProperties.length + customAttributes.length}개, 검증 규칙 {rules.length}개가 등록돼
        있어요.
      </p>
    </div>
  );
}
