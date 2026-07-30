DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_contract_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deprecate_contract_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_contract_version(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ws_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_ws(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_ws(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ws_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ws_of_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ws_of_contract(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ws_of_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.project_of_contract(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.version_status(uuid) TO authenticated;