CREATE OR REPLACE FUNCTION public.tg_log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _ws uuid; _proj uuid; _action text; _name text; _id uuid; _j jsonb;
BEGIN
  _action := lower(TG_OP);
  _j := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' AND (_j - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN RETURN NEW; END IF;
  _id := (_j->>'id')::uuid;
  _name := COALESCE(_j->>'name', _j->>'technical_name', '');
  IF TG_TABLE_NAME = 'workspaces' THEN
    _ws := (_j->>'id')::uuid;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    _ws := (_j->>'workspace_id')::uuid; _proj := (_j->>'id')::uuid;
  ELSE
    _proj := (_j->>'project_id')::uuid;
    _ws := public.ws_of_project(_proj);
  END IF;
  IF _ws IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity_logs (workspace_id, project_id, actor_user_id, entity_type, entity_id, action_type, summary)
  VALUES (_ws, _proj, auth.uid(), TG_TABLE_NAME, _id, _action,
          initcap(replace(TG_TABLE_NAME,'_',' ')) || ' "' || _name || '" ' || _action);
  RETURN NEW;
END; $function$;