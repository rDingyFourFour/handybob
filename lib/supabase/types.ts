export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      askbob_sessions: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          prompt: string;
          job_id: string | null;
          customer_id: string | null;
          quote_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          prompt: string;
          job_id?: string | null;
          customer_id?: string | null;
          quote_id?: string | null;
          created_at?: string;
        };
        Update: {
          workspace_id?: string;
          user_id?: string;
          prompt?: string;
          job_id?: string | null;
          customer_id?: string | null;
          quote_id?: string | null;
          created_at?: string;
        };
      };
      askbob_responses: {
        Row: {
          id: string;
          session_id: string;
          steps: string[];
          materials: Json | null;
          safety_cautions: string[] | null;
          cost_time_considerations: string[] | null;
          escalation_guidance: string[] | null;
          raw_model_output: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          steps?: string[];
          materials?: Json | null;
          safety_cautions?: string[] | null;
          cost_time_considerations?: string[] | null;
          escalation_guidance?: string[] | null;
          raw_model_output?: Json | null;
          created_at?: string;
        };
        Update: {
          session_id?: string;
          steps?: string[];
          materials?: Json | null;
          safety_cautions?: string[] | null;
          cost_time_considerations?: string[] | null;
          escalation_guidance?: string[] | null;
          raw_model_output?: Json | null;
          created_at?: string;
        };
      };
      askbob_job_task_snapshots: {
        Row: {
          id: string;
          workspace_id: string;
          job_id: string;
          task: string;
          payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          job_id: string;
          task: string;
          payload: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          workspace_id?: string;
          job_id?: string;
          task?: string;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
