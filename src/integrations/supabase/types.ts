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
      bank_accounts: {
        Row: {
          active: boolean
          bank_name: string
          created_at: string
          holder_name: string
          iban: string
          id: string
        }
        Insert: {
          active?: boolean
          bank_name: string
          created_at?: string
          holder_name: string
          iban: string
          id?: string
        }
        Update: {
          active?: boolean
          bank_name?: string
          created_at?: string
          holder_name?: string
          iban?: string
          id?: string
        }
        Relationships: []
      }
      license_keys: {
        Row: {
          activated_at: string | null
          activation_token: string | null
          assigned_at: string | null
          assigned_order_id: string | null
          claimed_at: string | null
          created_at: string
          duration_days: number | null
          duration_minutes: number | null
          expires_at: string | null
          hwid: string | null
          id: string
          key_value: string
          last_validated_at: string | null
          product_id: string
          revoked: boolean
          status: Database["public"]["Enums"]["key_status"]
        }
        Insert: {
          activated_at?: string | null
          activation_token?: string | null
          assigned_at?: string | null
          assigned_order_id?: string | null
          claimed_at?: string | null
          created_at?: string
          duration_days?: number | null
          duration_minutes?: number | null
          expires_at?: string | null
          hwid?: string | null
          id?: string
          key_value: string
          last_validated_at?: string | null
          product_id: string
          revoked?: boolean
          status?: Database["public"]["Enums"]["key_status"]
        }
        Update: {
          activated_at?: string | null
          activation_token?: string | null
          assigned_at?: string | null
          assigned_order_id?: string | null
          claimed_at?: string | null
          created_at?: string
          duration_days?: number | null
          duration_minutes?: number | null
          expires_at?: string | null
          hwid?: string | null
          id?: string
          key_value?: string
          last_validated_at?: string | null
          product_id?: string
          revoked?: boolean
          status?: Database["public"]["Enums"]["key_status"]
        }
        Relationships: [
          {
            foreignKeyName: "license_keys_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_discounts: {
        Row: {
          code_snapshot: string
          created_at: string
          discount_try: number
          order_id: string
          promo_code_id: string
        }
        Insert: {
          code_snapshot: string
          created_at?: string
          discount_try: number
          order_id: string
          promo_code_id: string
        }
        Update: {
          code_snapshot?: string
          created_at?: string
          discount_try?: number
          order_id?: string
          promo_code_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_discounts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_discounts_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      order_keys: {
        Row: {
          delivered_at: string
          id: string
          license_key_id: string
          order_id: string
        }
        Insert: {
          delivered_at?: string
          id?: string
          license_key_id: string
          order_id: string
        }
        Update: {
          delivered_at?: string
          id?: string
          license_key_id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_keys_license_key_id_fkey"
            columns: ["license_key_id"]
            isOneToOne: true
            referencedRelation: "license_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_keys_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_note: string | null
          approved_at: string | null
          created_at: string
          id: string
          price_try: number
          product_id: string
          receipt_path: string | null
          reference_code: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          user_id: string
          user_note: string | null
        }
        Insert: {
          admin_note?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          price_try: number
          product_id: string
          receipt_path?: string | null
          reference_code: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id: string
          user_note?: string | null
        }
        Update: {
          admin_note?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          price_try?: number
          product_id?: string
          receipt_path?: string | null
          reference_code?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id?: string
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          default_license_days: number | null
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          description: string | null
          duration: Database["public"]["Enums"]["duration_type"]
          featured: boolean
          id: string
          image_url: string | null
          manual_fulfillment: boolean
          name: string
          price_try: number
          slug: string
          stock_hint: number | null
          unlimited_stock: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          default_license_days?: number | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          description?: string | null
          duration?: Database["public"]["Enums"]["duration_type"]
          featured?: boolean
          id?: string
          image_url?: string | null
          manual_fulfillment?: boolean
          name: string
          price_try: number
          slug: string
          stock_hint?: number | null
          unlimited_stock?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          default_license_days?: number | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          description?: string | null
          duration?: Database["public"]["Enums"]["duration_type"]
          featured?: boolean
          id?: string
          image_url?: string | null
          manual_fulfillment?: boolean
          name?: string
          price_try?: number
          slug?: string
          stock_hint?: number | null
          unlimited_stock?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          discount_type: Database["public"]["Enums"]["promo_type"]
          discount_value: number
          expires_at: string | null
          id: string
          max_uses: number | null
          min_amount: number
          note: string | null
          product_id: string | null
          updated_at: string
          used_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          discount_type?: Database["public"]["Enums"]["promo_type"]
          discount_value: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_amount?: number
          note?: string | null
          product_id?: string | null
          updated_at?: string
          used_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          discount_type?: Database["public"]["Enums"]["promo_type"]
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_amount?: number
          note?: string | null
          product_id?: string | null
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      activate_license: { Args: { _hwid: string; _key: string }; Returns: Json }
      admin_set_license: {
        Args: {
          _action: string
          _id: string
          _value_int?: number
          _value_ts?: string
        }
        Returns: {
          activated_at: string | null
          activation_token: string | null
          assigned_at: string | null
          assigned_order_id: string | null
          claimed_at: string | null
          created_at: string
          duration_days: number | null
          duration_minutes: number | null
          expires_at: string | null
          hwid: string | null
          id: string
          key_value: string
          last_validated_at: string | null
          product_id: string
          revoked: boolean
          status: Database["public"]["Enums"]["key_status"]
        }
        SetofOptions: {
          from: "*"
          to: "license_keys"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_promo_code: {
        Args: { _code: string; _order_id: string }
        Returns: {
          code: string
          discount_try: number
          final_price: number
        }[]
      }
      approve_order: {
        Args: { _order_id: string }
        Returns: {
          activation_token: string
          license_key: string
        }[]
      }
      claim_license_by_token: {
        Args: { _token: string }
        Returns: {
          activation_token: string
          claimed_at: string
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          key_value: string
          product_name: string
        }[]
      }
      finalize_free_order: {
        Args: { _order_id: string }
        Returns: {
          activation_token: string
          license_key: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      remove_promo_code: { Args: { _order_id: string }; Returns: undefined }
      validate_license: { Args: { _hwid: string; _key: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      delivery_type: "key" | "account" | "link" | "link_token"
      duration_type: "monthly" | "yearly" | "lifetime"
      key_status: "available" | "assigned" | "revoked"
      order_status: "pending" | "reviewing" | "approved" | "rejected"
      promo_type: "percent" | "fixed"
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
      delivery_type: ["key", "account", "link", "link_token"],
      duration_type: ["monthly", "yearly", "lifetime"],
      key_status: ["available", "assigned", "revoked"],
      order_status: ["pending", "reviewing", "approved", "rejected"],
      promo_type: ["percent", "fixed"],
    },
  },
} as const
