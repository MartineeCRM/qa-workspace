import { createContext, useContext } from "react";
import type { WorkspaceRole } from "@/lib/domain";
import type { Workspace } from "@/lib/queries";

type Ctx = { workspace: Workspace; role: WorkspaceRole | null };

export const WorkspaceContext = createContext<Ctx | null>(null);

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaceContext must be used inside a workspace route");
  return ctx;
}
