-- Attribute tables lost their activity triggers when taxonomy_attributes was split.
CREATE OR REPLACE FUNCTION public.tg_log_taxonomy_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  row_data jsonb;
  project uuid;
  workspace uuid;
  parent_name text;
  entity_label text;
  entity_name text;
  action_label text;
  changed_fields text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
  ELSE
    row_data := to_jsonb(NEW);
  END IF;
  IF TG_OP = 'UPDATE' AND
     (row_data - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'taxonomy_event_properties' THEN
    SELECT project_id, technical_name INTO project, parent_name
    FROM public.taxonomy_events WHERE id = (row_data->>'event_id')::uuid;
    entity_label := '이벤트 프로퍼티';
  ELSIF TG_TABLE_NAME = 'taxonomy_custom_attribute_properties' THEN
    SELECT project_id, technical_name INTO project, parent_name
    FROM public.taxonomy_custom_attributes WHERE id = (row_data->>'custom_attribute_id')::uuid;
    entity_label := '어트리뷰트 하위 프로퍼티';
  ELSE
    project := (row_data->>'project_id')::uuid;
    entity_label := CASE TG_TABLE_NAME
      WHEN 'taxonomy_events' THEN '이벤트'
      WHEN 'taxonomy_custom_attributes' THEN '사용자 어트리뷰트'
      WHEN 'taxonomy_categories' THEN '택소노미 카테고리'
    END;
  END IF;
  workspace := public.ws_of_project(project);
  -- Cascaded child deletes are represented by the parent's deletion activity.
  IF workspace IS NOT NULL THEN
    entity_name := COALESCE(row_data->>'technical_name', row_data->>'name', '');
    IF parent_name IS NOT NULL THEN
      entity_name := parent_name || '.' || entity_name;
    END IF;
    action_label := CASE TG_OP
      WHEN 'INSERT' THEN '추가'
      WHEN 'UPDATE' THEN '수정'
      WHEN 'DELETE' THEN '삭제'
    END;
    IF TG_OP = 'UPDATE' THEN
      SELECT string_agg(CASE key
        WHEN 'technical_name' THEN '기술명'
        WHEN 'display_name' THEN '표시명'
        WHEN 'description' THEN '설명'
        WHEN 'trigger_description' THEN '발생 조건'
        WHEN 'data_type' THEN '데이터 타입'
        WHEN 'is_required' THEN '필수 여부'
        WHEN 'is_active' THEN '활성 여부'
        WHEN 'example_value' THEN '예시값'
        WHEN 'allowed_values' THEN '허용값'
        WHEN 'sort_order' THEN '정렬 순서'
        WHEN 'category_id' THEN '카테고리'
        WHEN 'event_id' THEN '소속 이벤트'
        WHEN 'custom_attribute_id' THEN '소속 어트리뷰트'
        WHEN 'name' THEN '이름'
        ELSE '기타 설정' END, ', ' ORDER BY key)
      INTO changed_fields
      FROM jsonb_each(row_data)
      WHERE key <> 'updated_at' AND value IS DISTINCT FROM to_jsonb(OLD)->key;
    END IF;
    INSERT INTO public.activity_logs
      (workspace_id, project_id, actor_user_id, entity_type, entity_id, action_type, summary, metadata)
    VALUES
      (workspace, project, auth.uid(), TG_TABLE_NAME, (row_data->>'id')::uuid,
       lower(TG_OP), entity_label || ' "' || entity_name || '" ' || action_label ||
       CASE WHEN changed_fields IS NOT NULL THEN ' (' || changed_fields || ')' ELSE '' END,
       jsonb_build_object('entity_name', entity_name, 'changed_fields', changed_fields));
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Replace the existing event/category loggers so each change is logged once.
DROP TRIGGER IF EXISTS log_activity_te ON public.taxonomy_events;
DROP TRIGGER IF EXISTS trg_taxonomy_categories_log ON public.taxonomy_categories;

CREATE TRIGGER log_activity_taxonomy_events AFTER INSERT OR UPDATE OR DELETE
ON public.taxonomy_events FOR EACH ROW EXECUTE FUNCTION public.tg_log_taxonomy_activity();
CREATE TRIGGER log_activity_taxonomy_event_properties AFTER INSERT OR UPDATE OR DELETE
ON public.taxonomy_event_properties FOR EACH ROW EXECUTE FUNCTION public.tg_log_taxonomy_activity();
CREATE TRIGGER log_activity_taxonomy_custom_attributes AFTER INSERT OR UPDATE OR DELETE
ON public.taxonomy_custom_attributes FOR EACH ROW EXECUTE FUNCTION public.tg_log_taxonomy_activity();
CREATE TRIGGER log_activity_taxonomy_custom_attribute_properties AFTER INSERT OR UPDATE OR DELETE
ON public.taxonomy_custom_attribute_properties FOR EACH ROW EXECUTE FUNCTION public.tg_log_taxonomy_activity();
CREATE TRIGGER log_activity_taxonomy_categories AFTER INSERT OR UPDATE OR DELETE
ON public.taxonomy_categories FOR EACH ROW EXECUTE FUNCTION public.tg_log_taxonomy_activity();

-- Keep the author's display name at the time of the activity, even after renaming.
CREATE OR REPLACE FUNCTION public.tg_activity_actor_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE actor_name text;
BEGIN
  SELECT NULLIF(btrim(display_name), '') INTO actor_name
  FROM public.profiles WHERE id = NEW.actor_user_id;
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) ||
    jsonb_build_object('actor_name', actor_name);
  RETURN NEW;
END;
$$;
CREATE TRIGGER activity_actor_name BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_activity_actor_name();
