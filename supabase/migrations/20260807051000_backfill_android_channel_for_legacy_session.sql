UPDATE public.qa_sessions AS session
SET qa_channel_id = channel.id
FROM public.qa_rounds AS round
JOIN public.qa_channels AS channel
  ON channel.project_id = round.project_id
 AND channel.slug = 'android'
WHERE session.qa_round_id = round.id
  AND round.project_id = '59a62862-b1b8-40d4-8d1e-45b725b1029a'
  AND session.name = '전체검증 - 보희'
  AND session.qa_channel_id IS NULL;
