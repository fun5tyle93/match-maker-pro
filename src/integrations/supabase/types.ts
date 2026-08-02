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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      current_session: {
        Row: {
          id: number
          session_id: string | null
        }
        Insert: {
          id?: number
          session_id?: string | null
        }
        Update: {
          id?: number
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "current_session_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          id: string
          is_eternal: boolean
          name: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_eternal?: boolean
          name: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          is_eternal?: boolean
          name?: string
          year?: number
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_player_id: string
          away_player_name: string
          away_score: number | null
          home_player_id: string
          home_player_name: string
          home_score: number | null
          id: string
          is_bye: boolean
          is_completed: boolean
          match_number: number | null
          phase: string
          playoff_round: number | null
          round: number
          session_id: string
        }
        Insert: {
          away_player_id: string
          away_player_name: string
          away_score?: number | null
          home_player_id: string
          home_player_name: string
          home_score?: number | null
          id?: string
          is_bye?: boolean
          is_completed?: boolean
          match_number?: number | null
          phase?: string
          playoff_round?: number | null
          round: number
          session_id: string
        }
        Update: {
          away_player_id?: string
          away_player_name?: string
          away_score?: number | null
          home_player_id?: string
          home_player_name?: string
          home_score?: number | null
          id?: string
          is_bye?: boolean
          is_completed?: boolean
          match_number?: number | null
          phase?: string
          playoff_round?: number | null
          round?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      player_stats: {
        Row: {
          championships: number
          draws: number
          goal_difference: number
          goals_against: number
          goals_for: number
          id: string
          league_id: string
          losses: number
          player_id: string
          player_name: string
          points: number
          points_against: number
          vice_championships: number
          wins: number
        }
        Insert: {
          championships?: number
          draws?: number
          goal_difference?: number
          goals_against?: number
          goals_for?: number
          id?: string
          league_id: string
          losses?: number
          player_id?: string
          player_name: string
          points?: number
          points_against?: number
          vice_championships?: number
          wins?: number
        }
        Update: {
          championships?: number
          draws?: number
          goal_difference?: number
          goals_against?: number
          goals_for?: number
          id?: string
          league_id?: string
          losses?: number
          player_id?: string
          player_name?: string
          points?: number
          points_against?: number
          vice_championships?: number
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      training_players: {
        Row: {
          id: string
          player_id: string
          player_name: string
          session_id: string
        }
        Insert: {
          id?: string
          player_id: string
          player_name: string
          session_id: string
        }
        Update: {
          id?: string
          player_id?: string
          player_name?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          date: string
          id: string
          is_completed: boolean
          matches_per_pairing: number
          name: string | null
          round_count: number
          tournament_type: string
          transferred_to_leagues: string[] | null
        }
        Insert: {
          date?: string
          id?: string
          is_completed?: boolean
          matches_per_pairing?: number
          name?: string | null
          round_count?: number
          tournament_type?: string
          transferred_to_leagues?: string[] | null
        }
        Update: {
          date?: string
          id?: string
          is_completed?: boolean
          matches_per_pairing?: number
          name?: string | null
          round_count?: number
          tournament_type?: string
          transferred_to_leagues?: string[] | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
