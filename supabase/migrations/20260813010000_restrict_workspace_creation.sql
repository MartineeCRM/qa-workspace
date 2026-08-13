DROP POLICY ws_insert ON public.workspaces;

CREATE POLICY ws_insert ON public.workspaces
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
);
