import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ensureSession } from "@/lib/auto-session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const ok = await ensureSession();
    if (!ok) throw new Error("Could not open the workspace. Please refresh.");
    return {};
  },
  component: () => <Outlet />,
});
