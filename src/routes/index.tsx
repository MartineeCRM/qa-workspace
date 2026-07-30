import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Trackspec — 트래킹 커버리지 관리" },
      {
        name: "description",
        content:
          "택소노미와 검증 규칙, QA 환경별 실시간 커버리지를 한곳에서 관리해요.",
      },
      { property: "og:title", content: "Trackspec — 트래킹 커버리지 관리" },
      {
        property: "og:description",
        content: "택소노미 중심의 트래킹 커버리지 관리 도구예요.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/workspaces" });
  },
  component: () => null,
});
