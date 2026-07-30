export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_type: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          project_id: string | null
          summary: string
          workspace_id: string
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          project_id?: string | null
          summary: string
          workspace_id: string
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          summary?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          project_key: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          project_key: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          project_key?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_analysis_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          project_id: string
          stage_id: string
          started_at: string
          status: string
          summary: Json
          upload_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          stage_id: string
          started_at?: string
          status?: string
          summary?: Json
          upload_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          stage_id?: string
          started_at?: string
          status?: string
          summary?: Json
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_analysis_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_analysis_runs_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "qa_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_analysis_runs_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "qa_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_item_status: {
        Row: {
          attribute_id: string | null
          created_at: string
          event_id: string | null
          id: string
          last_run_id: string | null
          notes: string | null
          project_id: string
          stage_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attribute_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          last_run_id?: string | null
          notes?: string | null
          project_id: string
          stage_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attribute_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          last_run_id?: string | null
          notes?: string | null
          project_id?: string
          stage_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_item_status_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_item_status_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_item_status_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "qa_analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_item_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_item_status_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "qa_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_stages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_uploads: {
        Row: {
          created_at: string
          file_name: string
          id: string
          notes: string | null
          project_id: string
          row_count: number
          stage_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          notes?: string | null
          project_id: string
          row_count?: number
          stage_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          notes?: string | null
          project_id?: string
          row_count?: number
          stage_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_uploads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "qa_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_attributes: {
        Row: {
          allowed_values: Json | null
          created_at: string
          created_by: string
          data_type: string
          description: string | null
          display_name: string | null
          event_id: string | null
          example_value: Json | null
          id: string
          is_active: boolean
          is_required: boolean
          project_id: string
          sort_order: number
          technical_name: string
          updated_at: string
        }
        Insert: {
          allowed_values?: Json | null
          created_at?: string
          created_by: string
          data_type?: string
          description?: string | null
          display_name?: string | null
          event_id?: string | null
          example_value?: Json | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          project_id: string
          sort_order?: number
          technical_name: string
          updated_at?: string
        }
        Update: {
          allowed_values?: Json | null
          created_at?: string
          created_by?: string
          data_type?: string
          description?: string | null
          display_name?: string | null
          event_id?: string | null
          example_value?: Json | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          project_id?: string
          sort_order?: number
          technical_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_attributes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxonomy_attributes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_events: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          display_name: string | null
          id: string
          is_active: boolean
          project_id: string
          sort_order: number
          technical_name: string
          trigger_description: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          project_id: string
          sort_order?: number
          technical_name: string
          trigger_description?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          project_id?: string
          sort_order?: number
          technical_name?: string
          trigger_description?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_rules: {
        Row: {
          attribute_id: string | null
          created_at: string
          created_by: string
          description: string | null
          event_id: string | null
          id: string
          is_enabled: boolean
          maximum_failure_count: number | null
          minimum_pass_rate: number | null
          name: string
          pass_condition_type: string
          project_id: string
          rule_config: Json
          rule_type: string
          severity: string
          updated_at: string
        }
        Insert: {
          attribute_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          event_id?: string | null
          id?: string
          is_enabled?: boolean
          maximum_failure_count?: number | null
          minimum_pass_rate?: number | null
          name: string
          pass_condition_type?: string
          project_id: string
          rule_config?: Json
          rule_type: string
          severity?: string
          updated_at?: string
        }
        Update: {
          attribute_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          event_id?: string | null
          id?: string
          is_enabled?: boolean
          maximum_failure_count?: number | null
          minimum_pass_rate?: number | null
          name?: string
          pass_condition_type?: string
          project_id?: string
          rule_config?: Json
          rule_type?: string
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_rules_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_rules_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_rules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_admin_ws: { Args: { _ws: string }; Returns: boolean }
      can_edit_ws: { Args: { _ws: string }; Returns: boolean }
      ensure_profile: {
        Args: { _display_name?: string }
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_ws_member: { Args: { _ws: string }; Returns: boolean }
      ws_of_project: { Args: { _p: string }; Returns: string }
      ws_role: { Args: { _ws: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
