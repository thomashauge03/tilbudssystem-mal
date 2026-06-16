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
      admin_costs: {
        Row: {
          id: string
          percentage: number
          year: number
        }
        Insert: {
          id?: string
          percentage?: number
          year: number
        }
        Update: {
          id?: string
          percentage?: number
          year?: number
        }
        Relationships: []
      }
      amendment_lines: {
        Row: {
          amendment_id: string
          created_at: string
          description: string | null
          id: string
          paid: boolean
          quantity: number | null
          sort_order: number
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          amendment_id: string
          created_at?: string
          description?: string | null
          id?: string
          paid?: boolean
          quantity?: number | null
          sort_order?: number
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          amendment_id?: string
          created_at?: string
          description?: string | null
          id?: string
          paid?: boolean
          quantity?: number | null
          sort_order?: number
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "amendment_lines_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "amendments"
            referencedColumns: ["id"]
          },
        ]
      }
      amendments: {
        Row: {
          amendment_number: string
          change_description: string | null
          created_at: string
          customer_email: string | null
          id: string
          internal_description: string | null
          invoiced_amount: number
          is_additional_work: boolean
          is_mass_settlement: boolean
          is_price_increase: boolean
          notified_date: string | null
          other_notes: string | null
          project_id: string | null
          project_manager: string | null
          project_ref: string | null
          reason: string | null
          revised_date: string | null
          updated_at: string
        }
        Insert: {
          amendment_number: string
          change_description?: string | null
          created_at?: string
          customer_email?: string | null
          id?: string
          internal_description?: string | null
          invoiced_amount?: number
          is_additional_work?: boolean
          is_mass_settlement?: boolean
          is_price_increase?: boolean
          notified_date?: string | null
          other_notes?: string | null
          project_id?: string | null
          project_manager?: string | null
          project_ref?: string | null
          reason?: string | null
          revised_date?: string | null
          updated_at?: string
        }
        Update: {
          amendment_number?: string
          change_description?: string | null
          created_at?: string
          customer_email?: string | null
          id?: string
          internal_description?: string | null
          invoiced_amount?: number
          is_additional_work?: boolean
          is_mass_settlement?: boolean
          is_price_increase?: boolean
          notified_date?: string | null
          other_notes?: string | null
          project_id?: string | null
          project_manager?: string | null
          project_ref?: string | null
          reason?: string | null
          revised_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "amendments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          company_name: string
          company_tagline: string
          default_offer_text: string
          email_subject_template: string
          id: string
          offer_validity_days: number
          our_refs: string[]
          payment_terms: string
          units: Json
          updated_at: string
          vat_pct: number
        }
        Insert: {
          company_name?: string
          company_tagline?: string
          default_offer_text?: string
          email_subject_template?: string
          id?: string
          offer_validity_days?: number
          our_refs?: string[]
          payment_terms?: string
          units?: Json
          updated_at?: string
          vat_pct?: number
        }
        Update: {
          company_name?: string
          company_tagline?: string
          default_offer_text?: string
          email_subject_template?: string
          id?: string
          offer_validity_days?: number
          our_refs?: string[]
          payment_terms?: string
          units?: Json
          updated_at?: string
          vat_pct?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      offer_lines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          included: boolean
          offer_id: string
          paid: boolean
          quantity: number | null
          sort_order: number
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          included?: boolean
          offer_id: string
          paid?: boolean
          quantity?: number | null
          sort_order?: number
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          included?: boolean
          offer_id?: string
          paid?: boolean
          quantity?: number | null
          sort_order?: number
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_lines_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          admin_cost_pct: number | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          id: string
          invoiced_amount: number
          offer_date: string
          offer_number: number
          offer_text: string | null
          our_ref: string | null
          project_id: string | null
          project_number: string | null
          status: string
          their_ref: string | null
          title: string
          updated_at: string
          valid_until: string
        }
        Insert: {
          admin_cost_pct?: number | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoiced_amount?: number
          offer_date?: string
          offer_number?: number
          offer_text?: string | null
          our_ref?: string | null
          project_id?: string | null
          project_number?: string | null
          status?: string
          their_ref?: string | null
          title: string
          updated_at?: string
          valid_until?: string
        }
        Update: {
          admin_cost_pct?: number | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoiced_amount?: number
          offer_date?: string
          offer_number?: number
          offer_text?: string | null
          our_ref?: string | null
          project_id?: string | null
          project_number?: string | null
          status?: string
          their_ref?: string | null
          title?: string
          updated_at?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amendment_id: string | null
          amount: number
          created_at: string
          description: string | null
          id: string
          invoice_date: string | null
          offer_id: string | null
          paid: boolean
          paid_date: string | null
        }
        Insert: {
          amendment_id?: string | null
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_date?: string | null
          offer_id?: string | null
          paid?: boolean
          paid_date?: string | null
        }
        Update: {
          amendment_id?: string | null
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_date?: string | null
          offer_id?: string | null
          paid?: boolean
          paid_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "amendments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string | null
          description: string | null
          id: string
          name: string
          project_number: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          id?: string
          name: string
          project_number?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          id?: string
          name?: string
          project_number?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
