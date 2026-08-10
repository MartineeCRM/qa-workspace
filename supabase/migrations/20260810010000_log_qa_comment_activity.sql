CREATE OR REPLACE FUNCTION public.tg_log_qa_comment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _workspace_id uuid;
  _project_id uuid;
  _target_label text;
  _event_name text;
  _actor_name text;
BEGIN
  SELECT
    project.workspace_id,
    project.id,
    discussion.target_label,
    event.technical_name
  INTO _workspace_id, _project_id, _target_label, _event_name
  FROM public.qa_discussions discussion
  JOIN public.qa_checklist_item_results result
    ON result.id = discussion.checklist_item_result_id
  JOIN public.qa_round_checklist_items item
    ON item.id = result.checklist_item_id
  JOIN public.qa_sessions session
    ON session.id = item.qa_session_id
  JOIN public.qa_rounds round
    ON round.id = session.qa_round_id
  JOIN public.projects project
    ON project.id = round.project_id
  LEFT JOIN public.taxonomy_events event
    ON event.id = item.target_id
  WHERE discussion.id = NEW.discussion_id;

  SELECT COALESCE(
    NULLIF(btrim(NEW.external_author_name), ''),
    NULLIF(btrim(profile.display_name), ''),
    '이름 없는 사용자'
  )
  INTO _actor_name
  FROM (SELECT 1) seed
  LEFT JOIN public.profiles profile ON profile.id = NEW.author_id;

  SELECT CASE
    WHEN discussion.target_type = 'property'
      THEN concat_ws('.', NULLIF(_event_name, ''), discussion.target_label)
    ELSE discussion.target_label
  END
  INTO _target_label
  FROM public.qa_discussions discussion
  WHERE discussion.id = NEW.discussion_id;

  IF _workspace_id IS NOT NULL THEN
    INSERT INTO public.activity_logs (
      workspace_id,
      project_id,
      actor_user_id,
      entity_type,
      entity_id,
      action_type,
      summary
    ) VALUES (
      _workspace_id,
      _project_id,
      NEW.author_id,
      'qa_comment',
      NEW.id,
      'commented',
      format('%s님이 %s에 댓글을 남겼어요.', _actor_name, COALESCE(_target_label, 'QA 이슈'))
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_qa_comment_activity ON public.qa_discussion_comments;
CREATE TRIGGER trg_log_qa_comment_activity
AFTER INSERT ON public.qa_discussion_comments
FOR EACH ROW EXECUTE FUNCTION public.tg_log_qa_comment_activity();

INSERT INTO public.activity_logs (
  workspace_id,
  project_id,
  actor_user_id,
  entity_type,
  entity_id,
  action_type,
  summary,
  created_at
)
SELECT
  project.workspace_id,
  project.id,
  comment.author_id,
  'qa_comment',
  comment.id,
  'commented',
  format(
    '%s님이 %s에 댓글을 남겼어요.',
    COALESCE(NULLIF(btrim(comment.external_author_name), ''), NULLIF(btrim(profile.display_name), ''), '이름 없는 사용자'),
    CASE
      WHEN discussion.target_type = 'property'
        THEN concat_ws('.', NULLIF(event.technical_name, ''), discussion.target_label)
      ELSE discussion.target_label
    END
  ),
  comment.created_at
FROM public.qa_discussion_comments comment
JOIN public.qa_discussions discussion ON discussion.id = comment.discussion_id
JOIN public.qa_checklist_item_results result ON result.id = discussion.checklist_item_result_id
JOIN public.qa_round_checklist_items item ON item.id = result.checklist_item_id
JOIN public.qa_sessions session ON session.id = item.qa_session_id
JOIN public.qa_rounds round ON round.id = session.qa_round_id
JOIN public.projects project ON project.id = round.project_id
LEFT JOIN public.taxonomy_events event ON event.id = item.target_id
LEFT JOIN public.profiles profile ON profile.id = comment.author_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.activity_logs activity
  WHERE activity.entity_type = 'qa_comment'
    AND activity.entity_id = comment.id
    AND activity.action_type = 'commented'
);

NOTIFY pgrst, 'reload schema';
