import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  Activity,
  Braces,
  CircleAlert,
  CircleCheck,
  Layers,
  ListTree,
  MessagesSquare,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { EmptyState, Panel, Stat } from "@/components/app/layout-parts";
import { CoverageLegend, CoverageRow, CoverageTableHeader } from "@/components/app/coverage";
import {
  buildCoverageItems,
  useActivity,
  useEnvironments,
  useProject,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
  type QaEnvironment,
} from "@/lib/queries";
import {
  useProjectChecklistCoverageRows,
  useProjectQaIssues,
  useQaChannelExclusions,
  useQaChannels,
} from "@/lib/qa-rounds-queries";
import { checklistCoverageItems, environmentChecklistCoverage } from "@/lib/qa-workflow";
import { formatDateTime } from "@/lib/domain";

const issueStatus: Record<
  "open" | "talk" | "fixing" | "done",
  { label: string; icon: LucideIcon; iconClass: string; badgeClass: string }
> = {
  open: {
    label: "이슈 있음",
    icon: CircleAlert,
    iconClass: "bg-destructive/10 text-destructive",
    badgeClass: "border-destructive/25 bg-destructive/10 text-destructive",
  },
  talk: {
    label: "확인 필요",
    icon: MessagesSquare,
    iconClass: "bg-amber-100 text-amber-700",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
  fixing: {
    label: "개발 수정 중",
    icon: Wrench,
    iconClass: "bg-blue-100 text-blue-700",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
  },
  done: {
    label: "다음 검증 대기",
    icon: CircleCheck,
    iconClass: "bg-emerald-100 text-emerald-700",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

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
  const { data: stages = [] } = useEnvironments(projectId);
  const { data: coverageRows = [] } = useProjectChecklistCoverageRows(projectId);
  const { data: qaIssues = [] } = useProjectQaIssues(projectId);
  const { data: channels = [] } = useQaChannels(projectId);
  const { data: exclusions } = useQaChannelExclusions(
    events.map((event) => event.id),
    eventProperties.map((property) => property.id),
  );
  const { data: activity = [] } = useActivity({ projectId, limit: 12 });

  const items = buildCoverageItems(events, eventProperties, customAttributes);
  const activeEvents = events.filter((e) => e.is_active).length;
  const activeEventProperties = eventProperties.filter((property) => property.is_active).length;
  const activeAttributes = customAttributes.filter((a) => a.is_active).length;
  const coverageChannels = channels.filter((channel) => channel.is_active);

  // See checklistCoverageItems in qa-workflow.ts: the checklist schema only
  // tracks events/custom attributes, so this is a narrower set than `items`.
  const checklistItems = checklistCoverageItems(items);
  const environmentById = new Map(stages.map((s) => [s.id, s]));
  const eventById = new Map(events.map((event) => [event.id, event]));
  const issues = qaIssues.filter(
    (issue) => issue.workflow_status !== "dismissed" && issue.workflow_status !== "verified",
  );

  return (
    <div className="space-y-5 p-6">
      {project?.description ? (
        <p className="max-w-2xl text-sm text-muted-foreground">{project.description}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={ListTree} label="이벤트" value={activeEvents} />
        <Stat icon={Braces} label="이벤트 프로퍼티" value={activeEventProperties} />
        <Stat icon={Layers} label="어트리뷰트" value={activeAttributes} />
      </div>

      <Panel
        title="QA 환경별 실시간 커버리지"
        description="모든 환경은 현재 택소노미를 기준으로 측정돼요. 커버리지는 스냅샷으로 굳지 않아요."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            <CoverageLegend />
            <Link
              to="/w/$wsId/p/$projectId/taxonomy"
              params={{ wsId, projectId }}
              className="text-xs font-medium text-primary hover:underline"
            >
              택소노미 편집
            </Link>
          </div>
        }
      >
        {stages.length === 0 ? (
          <EmptyState
            title="QA 환경이 없어요"
            description="프로젝트를 만들면 기본 환경이 함께 생겨요."
          />
        ) : (
          <div role="table" aria-label="QA 환경별 검증 진행률과 통과율">
            <CoverageTableHeader />
            {stages.map((stage: QaEnvironment) => {
              const cov = environmentChecklistCoverage(
                checklistItems,
                coverageRows,
                stage.id,
                coverageChannels.map((channel) => channel.id),
                exclusions?.events,
              );
              return (
                <div key={stage.id} role="rowgroup">
                  <CoverageRow
                    aggregate
                    label={
                      <Link
                        to="/w/$wsId/p/$projectId/qa/$stageSlug"
                        params={{ wsId, projectId, stageSlug: stage.slug }}
                        className="hover:underline"
                      >
                        {stage.name}
                      </Link>
                    }
                    verified={cov.verified}
                    failed={cov.failed}
                    total={cov.total}
                  />
                  {coverageChannels.map((channel) => {
                    const channelCoverage = environmentChecklistCoverage(
                      checklistItems,
                      coverageRows,
                      stage.id,
                      [channel.id],
                      exclusions?.events,
                    );
                    return (
                      <CoverageRow
                        key={channel.id}
                        label={channel.name}
                        verified={channelCoverage.verified}
                        failed={channelCoverage.failed}
                        total={channelCoverage.total}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
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
              {issues.slice(0, 12).map((issue) => {
                const stage = environmentById.get(issue.qa_environment_id);
                const event = eventById.get(issue.event_id);
                const channel = channels.find((candidate) => candidate.id === issue.qa_channel_id);
                const status = issueStatus[issue.workflow_status as keyof typeof issueStatus];
                if (!status) return null;
                const StatusIcon = status.icon;
                return (
                  <li key={issue.id} className="px-4 py-2.5">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-md ${status.iconClass}`}
                      >
                        <StatusIcon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to="/w/$wsId/p/$projectId/issues"
                            params={{
                              wsId,
                              projectId,
                            }}
                            className="mono-token truncate text-sm font-medium hover:underline"
                          >
                            {issue.target_type === "custom_attribute"
                              ? issue.target_label
                              : issue.target_type === "event"
                                ? (event?.technical_name ?? issue.event_id)
                                : `${event?.technical_name ?? issue.event_id}.${issue.target_label}`}
                          </Link>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.badgeClass}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[stage?.name, channel?.name ?? "플랫폼 미지정", issue.session_name]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
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
    </div>
  );
}
