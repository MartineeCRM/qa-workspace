export type QaRound = {
  id: string;
  project_id: string;
  qa_environment_id: string;
  round_number: number;
  name: string | null;
  previous_round_id: string | null;
  started_by: string;
  started_at: string;
  ended_at: string | null;
};

export type QaSession = {
  id: string;
  qa_round_id: string;
  name: string;
  started_by: string;
  started_at: string;
  ended_at: string | null;
  qa_channel_id: string | null;
};

export type QaChannel = {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

export type QaChecklistItem = {
  id: string;
  qa_session_id: string;
  target_type: "event" | "custom_attribute";
  target_id: string;
  created_at: string;
  executed_at: string | null;
};

export type QaChecklistItemResult = {
  id: string;
  checklist_item_id: string;
  ai_verdict: "passed" | "failed" | "not_collected" | null;
  ai_reasoning: string | null;
  ai_evidence: unknown;
  failed_layer: "existence" | "structural" | "qualitative" | null;
  final_status: "passed" | "failed" | "not_collected";
  judged_by: "rule" | "ai" | null;
  overridden_by: string | null;
  overridden_at: string | null;
  override_reason: string | null;
  updated_at: string;
};

export type QaAttributeSnapshot = {
  id: string;
  qa_session_id: string;
  external_user_id: string;
  snapshot_name: string;
  status: "requesting" | "captured" | "failed";
  payload: Record<string, unknown> | null;
  previous_snapshot_id: string | null;
  requested_at: string;
  captured_at: string | null;
};

export type QaRunEvent = {
  id: string;
  qa_session_id: string;
  source_event_id?: string | null;
  event_id: string | null;
  raw_event_name: string;
  occurred_at: string;
  created_at: string;
  external_user_id: string;
  raw_properties: Record<string, unknown>;
};

export type ChecklistDisposition = "unresolved" | "passed_override" | "carried_over" | "discussing";

export type QaChecklistItemWithDisposition = QaChecklistItem & {
  disposition: ChecklistDisposition;
  carried_from_item_id: string | null;
  assigned_to: string | null;
  disposed_by: string | null;
  disposed_at: string | null;
};

export type QaDiscussionComment = {
  id: string;
  discussion_id: string;
  author_id: string | null;
  external_author_name: string | null;
  body: string;
  is_resolution: boolean;
  created_at: string;
};

export type QaDiscussion = {
  id: string;
  checklist_item_result_id: string;
  status: "open" | "resolved";
  created_by: string;
  created_at: string;
  target_type: "event" | "property" | "custom_attribute";
  target_id: string;
  target_label: string;
  workflow_status: "open" | "talk" | "fixing" | "done" | "dismissed" | "verified";
  workflow_updated_by: string | null;
  workflow_updated_by_external_name: string | null;
  updated_at: string;
  qa_discussion_comments: QaDiscussionComment[];
};

export type ProjectQaIssue = QaDiscussion & {
  checklist_item_id: string;
  event_id: string;
  qa_session_id: string;
  qa_channel_id: string | null;
  session_name: string;
  qa_environment_id: string;
  round_id: string;
  round_number: number;
};

export type RoundHistoryEntry = {
  roundNumber: number;
  reasoning: string | null;
  evidence?: unknown;
  finalStatus: "passed" | "failed" | "not_collected";
};
