-- Migration 20260729073454 tried to replace the workspace-owner trigger but
-- dropped a trigger name ("workspaces_owner") that never existed, so the
-- original trigger from 20260729031949 ("trg_workspace_owner") was never
-- removed. Both triggers call the same tg_workspace_owner() function, which
-- is idempotent (ON CONFLICT DO NOTHING), so this was harmless — just a
-- redundant insert on every workspace creation. Drop the leftover duplicate.
DROP TRIGGER IF EXISTS trg_workspace_owner ON public.workspaces;
