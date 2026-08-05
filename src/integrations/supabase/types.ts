export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_type: string;
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: Json;
          project_id: string | null;
          summary: string;
          workspace_id: string;
        };
        Insert: {
          action_type: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: Json;
          project_id?: string | null;
          summary: string;
          workspace_id: string;
        };
        Update: {
          action_type?: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          project_id?: string | null;
          summary?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_logs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          email: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_attribute_api_settings: {
        Row: {
          auth_secret: string | null;
          base_url: string;
          project_id: string;
          updated_at: string;
          updated_by: string | null;
          user_id_param_name: string;
        };
        Insert: {
          auth_secret?: string | null;
          base_url: string;
          project_id: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id_param_name?: string;
        };
        Update: {
          auth_secret?: string | null;
          base_url?: string;
          project_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          user_id_param_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_attribute_api_settings_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          name: string;
          project_key: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          name: string;
          project_key: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          name?: string;
          project_key?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_analysis_runs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string;
          id: string;
          project_id: string;
          qa_environment_id: string;
          started_at: string;
          status: string;
          summary: Json;
          upload_id: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          project_id: string;
          qa_environment_id: string;
          started_at?: string;
          status?: string;
          summary?: Json;
          upload_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          project_id?: string;
          qa_environment_id?: string;
          started_at?: string;
          status?: string;
          summary?: Json;
          upload_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "qa_analysis_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_analysis_runs_stage_id_fkey";
            columns: ["qa_environment_id"];
            isOneToOne: false;
            referencedRelation: "qa_environments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_analysis_runs_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "qa_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_attribute_snapshots: {
        Row: {
          captured_at: string | null;
          external_user_id: string;
          id: string;
          payload: Json | null;
          previous_snapshot_id: string | null;
          qa_session_id: string;
          requested_at: string;
          snapshot_name: string;
          status: string;
        };
        Insert: {
          captured_at?: string | null;
          external_user_id: string;
          id?: string;
          payload?: Json | null;
          previous_snapshot_id?: string | null;
          qa_session_id: string;
          requested_at?: string;
          snapshot_name: string;
          status?: string;
        };
        Update: {
          captured_at?: string | null;
          external_user_id?: string;
          id?: string;
          payload?: Json | null;
          previous_snapshot_id?: string | null;
          qa_session_id?: string;
          requested_at?: string;
          snapshot_name?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qa_attribute_snapshots_previous_snapshot_id_fkey";
            columns: ["previous_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "qa_attribute_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_attribute_snapshots_qa_session_id_fkey";
            columns: ["qa_session_id"];
            isOneToOne: false;
            referencedRelation: "qa_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_checklist_item_results: {
        Row: {
          ai_evidence: Json | null;
          ai_reasoning: string | null;
          ai_verdict: string | null;
          checklist_item_id: string;
          created_at: string;
          failed_layer: string | null;
          final_status: string;
          id: string;
          overridden_at: string | null;
          overridden_by: string | null;
          override_reason: string | null;
          updated_at: string;
        };
        Insert: {
          ai_evidence?: Json | null;
          ai_reasoning?: string | null;
          ai_verdict?: string | null;
          checklist_item_id: string;
          created_at?: string;
          failed_layer?: string | null;
          final_status?: string;
          id?: string;
          overridden_at?: string | null;
          overridden_by?: string | null;
          override_reason?: string | null;
          updated_at?: string;
        };
        Update: {
          ai_evidence?: Json | null;
          ai_reasoning?: string | null;
          ai_verdict?: string | null;
          checklist_item_id?: string;
          created_at?: string;
          failed_layer?: string | null;
          final_status?: string;
          id?: string;
          overridden_at?: string | null;
          overridden_by?: string | null;
          override_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qa_checklist_item_results_checklist_item_id_fkey";
            columns: ["checklist_item_id"];
            isOneToOne: false;
            referencedRelation: "qa_round_checklist_items";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_discussion_comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          discussion_id: string;
          id: string;
          is_resolution: boolean;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          discussion_id: string;
          id?: string;
          is_resolution?: boolean;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          discussion_id?: string;
          id?: string;
          is_resolution?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "qa_discussion_comments_discussion_id_fkey";
            columns: ["discussion_id"];
            isOneToOne: false;
            referencedRelation: "qa_discussions";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_discussions: {
        Row: {
          checklist_item_result_id: string;
          created_at: string;
          created_by: string;
          id: string;
          status: string;
          target_id: string;
          target_label: string;
          target_type: string;
          workflow_status: string;
        };
        Insert: {
          checklist_item_result_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          status?: string;
          target_id?: string;
          target_label?: string;
          target_type?: string;
          workflow_status?: string;
        };
        Update: {
          checklist_item_result_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          status?: string;
          target_id?: string;
          target_label?: string;
          target_type?: string;
          workflow_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qa_discussions_checklist_item_result_id_fkey";
            columns: ["checklist_item_result_id"];
            isOneToOne: false;
            referencedRelation: "qa_checklist_item_results";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_environments: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          project_id: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          project_id: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          project_id?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qa_stages_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_item_status: {
        Row: {
          created_at: string;
          custom_attribute_id: string | null;
          event_id: string | null;
          id: string;
          last_run_id: string | null;
          notes: string | null;
          project_id: string;
          property_id: string | null;
          qa_environment_id: string;
          status: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          custom_attribute_id?: string | null;
          event_id?: string | null;
          id?: string;
          last_run_id?: string | null;
          notes?: string | null;
          project_id: string;
          property_id?: string | null;
          qa_environment_id: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          custom_attribute_id?: string | null;
          event_id?: string | null;
          id?: string;
          last_run_id?: string | null;
          notes?: string | null;
          project_id?: string;
          property_id?: string | null;
          qa_environment_id?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "qa_item_status_custom_attribute_id_fkey";
            columns: ["custom_attribute_id"];
            isOneToOne: false;
            referencedRelation: "taxonomy_custom_attributes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_item_status_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "taxonomy_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_item_status_last_run_id_fkey";
            columns: ["last_run_id"];
            isOneToOne: false;
            referencedRelation: "qa_analysis_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_item_status_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_item_status_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "taxonomy_event_properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_item_status_stage_id_fkey";
            columns: ["qa_environment_id"];
            isOneToOne: false;
            referencedRelation: "qa_environments";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_round_checklist_items: {
        Row: {
          assigned_to: string | null;
          carried_from_item_id: string | null;
          created_at: string;
          disposed_at: string | null;
          disposed_by: string | null;
          disposition: string;
          executed_at: string | null;
          id: string;
          qa_session_id: string;
          target_id: string;
          target_type: string;
        };
        Insert: {
          assigned_to?: string | null;
          carried_from_item_id?: string | null;
          created_at?: string;
          disposed_at?: string | null;
          disposed_by?: string | null;
          disposition?: string;
          executed_at?: string | null;
          id?: string;
          qa_session_id: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          assigned_to?: string | null;
          carried_from_item_id?: string | null;
          created_at?: string;
          disposed_at?: string | null;
          disposed_by?: string | null;
          disposition?: string;
          executed_at?: string | null;
          id?: string;
          qa_session_id?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qa_round_checklist_items_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_round_checklist_items_carried_from_item_id_fkey";
            columns: ["carried_from_item_id"];
            isOneToOne: false;
            referencedRelation: "qa_round_checklist_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_round_checklist_items_disposed_by_fkey";
            columns: ["disposed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_round_checklist_items_qa_session_id_fkey";
            columns: ["qa_session_id"];
            isOneToOne: false;
            referencedRelation: "qa_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_rounds: {
        Row: {
          ended_at: string | null;
          id: string;
          name: string | null;
          previous_round_id: string | null;
          project_id: string;
          qa_environment_id: string;
          round_number: number;
          started_at: string;
          started_by: string;
        };
        Insert: {
          ended_at?: string | null;
          id?: string;
          name?: string | null;
          previous_round_id?: string | null;
          project_id: string;
          qa_environment_id: string;
          round_number: number;
          started_at?: string;
          started_by: string;
        };
        Update: {
          ended_at?: string | null;
          id?: string;
          name?: string | null;
          previous_round_id?: string | null;
          project_id?: string;
          qa_environment_id?: string;
          round_number?: number;
          started_at?: string;
          started_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qa_rounds_previous_round_id_fkey";
            columns: ["previous_round_id"];
            isOneToOne: false;
            referencedRelation: "qa_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_rounds_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_rounds_qa_environment_id_fkey";
            columns: ["qa_environment_id"];
            isOneToOne: false;
            referencedRelation: "qa_environments";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_run_events: {
        Row: {
          created_at: string;
          event_id: string | null;
          external_user_id: string;
          id: string;
          occurred_at: string;
          qa_session_id: string;
          raw_event_name: string;
          raw_properties: Json;
        };
        Insert: {
          created_at?: string;
          event_id?: string | null;
          external_user_id: string;
          id?: string;
          occurred_at: string;
          qa_session_id: string;
          raw_event_name: string;
          raw_properties?: Json;
        };
        Update: {
          created_at?: string;
          event_id?: string | null;
          external_user_id?: string;
          id?: string;
          occurred_at?: string;
          qa_session_id?: string;
          raw_event_name?: string;
          raw_properties?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "qa_run_events_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "taxonomy_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_run_events_qa_session_id_fkey";
            columns: ["qa_session_id"];
            isOneToOne: false;
            referencedRelation: "qa_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_channels: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          is_required: boolean;
          name: string;
          project_id: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          name: string;
          project_id: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          name?: string;
          project_id?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      qa_sessions: {
        Row: {
          ended_at: string | null;
          id: string;
          name: string;
          qa_channel_id: string | null;
          qa_round_id: string;
          started_at: string;
          started_by: string;
        };
        Insert: {
          ended_at?: string | null;
          id?: string;
          name: string;
          qa_channel_id?: string | null;
          qa_round_id: string;
          started_at?: string;
          started_by: string;
        };
        Update: {
          ended_at?: string | null;
          id?: string;
          name?: string;
          qa_channel_id?: string | null;
          qa_round_id?: string;
          started_at?: string;
          started_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qa_sessions_qa_channel_id_fkey";
            columns: ["qa_channel_id"];
            isOneToOne: false;
            referencedRelation: "qa_channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_sessions_qa_round_id_fkey";
            columns: ["qa_round_id"];
            isOneToOne: false;
            referencedRelation: "qa_rounds";
            referencedColumns: ["id"];
          },
        ];
      };
      qa_uploads: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          notes: string | null;
          project_id: string;
          qa_environment_id: string;
          row_count: number;
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          notes?: string | null;
          project_id: string;
          qa_environment_id: string;
          row_count?: number;
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          notes?: string | null;
          project_id?: string;
          qa_environment_id?: string;
          row_count?: number;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "qa_uploads_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "qa_uploads_stage_id_fkey";
            columns: ["qa_environment_id"];
            isOneToOne: false;
            referencedRelation: "qa_environments";
            referencedColumns: ["id"];
          },
        ];
      };
      taxonomy_categories: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          name: string;
          project_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          name: string;
          project_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          name?: string;
          project_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "taxonomy_categories_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      taxonomy_custom_attribute_properties: {
        Row: {
          allowed_values: Json | null;
          created_at: string;
          created_by: string;
          custom_attribute_id: string;
          data_type: string;
          description: string | null;
          display_name: string | null;
          example_value: Json | null;
          id: string;
          is_active: boolean;
          is_required: boolean;
          sort_order: number;
          technical_name: string;
          updated_at: string;
        };
        Insert: {
          allowed_values?: Json | null;
          created_at?: string;
          created_by: string;
          custom_attribute_id: string;
          data_type?: string;
          description?: string | null;
          display_name?: string | null;
          example_value?: Json | null;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          sort_order?: number;
          technical_name: string;
          updated_at?: string;
        };
        Update: {
          allowed_values?: Json | null;
          created_at?: string;
          created_by?: string;
          custom_attribute_id?: string;
          data_type?: string;
          description?: string | null;
          display_name?: string | null;
          example_value?: Json | null;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          sort_order?: number;
          technical_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "taxonomy_custom_attribute_properties_custom_attribute_id_fkey";
            columns: ["custom_attribute_id"];
            isOneToOne: false;
            referencedRelation: "taxonomy_custom_attributes";
            referencedColumns: ["id"];
          },
        ];
      };
      taxonomy_custom_attributes: {
        Row: {
          allowed_values: Json | null;
          created_at: string;
          created_by: string;
          data_type: string;
          description: string | null;
          display_name: string | null;
          example_value: Json | null;
          id: string;
          is_active: boolean;
          is_required: boolean;
          project_id: string;
          sort_order: number;
          technical_name: string;
          updated_at: string;
        };
        Insert: {
          allowed_values?: Json | null;
          created_at?: string;
          created_by: string;
          data_type?: string;
          description?: string | null;
          display_name?: string | null;
          example_value?: Json | null;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          project_id: string;
          sort_order?: number;
          technical_name: string;
          updated_at?: string;
        };
        Update: {
          allowed_values?: Json | null;
          created_at?: string;
          created_by?: string;
          data_type?: string;
          description?: string | null;
          display_name?: string | null;
          example_value?: Json | null;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          project_id?: string;
          sort_order?: number;
          technical_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "taxonomy_custom_attributes_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      taxonomy_event_channel_exclusions: {
        Row: { channel_id: string; event_id: string };
        Insert: { channel_id: string; event_id: string };
        Update: { channel_id?: string; event_id?: string };
        Relationships: [];
      };
      taxonomy_property_channel_exclusions: {
        Row: { channel_id: string; property_id: string };
        Insert: { channel_id: string; property_id: string };
        Update: { channel_id?: string; property_id?: string };
        Relationships: [];
      };
      taxonomy_event_properties: {
        Row: {
          allowed_values: Json | null;
          created_at: string;
          created_by: string;
          data_type: string;
          description: string | null;
          display_name: string | null;
          event_id: string;
          example_value: Json | null;
          id: string;
          is_active: boolean;
          is_required: boolean;
          sort_order: number;
          technical_name: string;
          updated_at: string;
        };
        Insert: {
          allowed_values?: Json | null;
          created_at?: string;
          created_by: string;
          data_type?: string;
          description?: string | null;
          display_name?: string | null;
          event_id: string;
          example_value?: Json | null;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          sort_order?: number;
          technical_name: string;
          updated_at?: string;
        };
        Update: {
          allowed_values?: Json | null;
          created_at?: string;
          created_by?: string;
          data_type?: string;
          description?: string | null;
          display_name?: string | null;
          event_id?: string;
          example_value?: Json | null;
          id?: string;
          is_active?: boolean;
          is_required?: boolean;
          sort_order?: number;
          technical_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "taxonomy_event_properties_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "taxonomy_events";
            referencedColumns: ["id"];
          },
        ];
      };
      taxonomy_events: {
        Row: {
          category_id: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          display_name: string | null;
          id: string;
          is_active: boolean;
          project_id: string;
          sort_order: number;
          technical_name: string;
          trigger_description: string | null;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          display_name?: string | null;
          id?: string;
          is_active?: boolean;
          project_id: string;
          sort_order?: number;
          technical_name: string;
          trigger_description?: string | null;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          display_name?: string | null;
          id?: string;
          is_active?: boolean;
          project_id?: string;
          sort_order?: number;
          technical_name?: string;
          trigger_description?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "taxonomy_events_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "taxonomy_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "taxonomy_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      validation_rule_targets: {
        Row: {
          created_at: string;
          id: string;
          rule_id: string;
          target_id: string;
          target_type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          rule_id: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          rule_id?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "validation_rule_targets_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "validation_rules";
            referencedColumns: ["id"];
          },
        ];
      };
      validation_rules: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          is_enabled: boolean;
          name: string;
          project_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          is_enabled?: boolean;
          name: string;
          project_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_enabled?: boolean;
          name?: string;
          project_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "validation_rules_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_invites: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          invited_by: string;
          role: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          invited_by: string;
          role: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          invited_by?: string;
          role?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          id: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      carry_over_qa_checklist_items: {
        Args: { _assignee_id?: string | null; _item_ids: string[] };
        Returns: { round_id: string; session_id: string }[];
      };
      can_admin_ws: { Args: { _ws: string }; Returns: boolean };
      can_edit_ws: { Args: { _ws: string }; Returns: boolean };
      ensure_profile: {
        Args: { _display_name?: string };
        Returns: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          email: string | null;
          id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "profiles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      is_ws_member: { Args: { _ws: string }; Returns: boolean };
      set_qa_checklist_disposition: {
        Args: { _disposition: string; _item_id: string };
        Returns: undefined;
      };
      ws_of_project: { Args: { _p: string }; Returns: string };
      ws_role: { Args: { _ws: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
