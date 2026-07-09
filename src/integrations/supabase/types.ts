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
      blog_posts: {
        Row: {
          author_id: string | null
          content: string
          cover_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          slug: string
          tags: string[]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id?: string | null
          content?: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug: string
          tags?: string[]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string | null
          content?: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          tags?: string[]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          image_url: string | null
          product_id: string | null
          promo_code_id: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          telegram_message_id: number | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          image_url?: string | null
          product_id?: string | null
          promo_code_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          telegram_message_id?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          image_url?: string | null
          product_id?: string | null
          promo_code_id?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          telegram_message_id?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          discount_try: number
          id: string
          order_id: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_try: number
          id?: string
          order_id?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_try?: number
          id?: string
          order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_try: number
          updated_at: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_try?: number
          updated_at?: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_try?: number
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      cross_sell_rules: {
        Row: {
          active: boolean
          created_at: string
          discount_percent: number
          from_category: string
          id: string
          note: string | null
          promo_code: string | null
          to_category: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          discount_percent: number
          from_category: string
          id?: string
          note?: string | null
          promo_code?: string | null
          to_category: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          discount_percent?: number
          from_category?: string
          id?: string
          note?: string | null
          promo_code?: string | null
          to_category?: string
          updated_at?: string
        }
        Relationships: []
      }
      crypto_deposits: {
        Row: {
          amount_try: number
          amount_usdt: number
          block_timestamp: string | null
          created_at: string
          from_address: string | null
          id: string
          notes: string | null
          rate_used: number
          status: string
          to_address: string
          tx_hash: string
          user_id: string
        }
        Insert: {
          amount_try: number
          amount_usdt: number
          block_timestamp?: string | null
          created_at?: string
          from_address?: string | null
          id?: string
          notes?: string | null
          rate_used: number
          status?: string
          to_address: string
          tx_hash: string
          user_id: string
        }
        Update: {
          amount_try?: number
          amount_usdt?: number
          block_timestamp?: string | null
          created_at?: string
          from_address?: string | null
          id?: string
          notes?: string | null
          rate_used?: number
          status?: string
          to_address?: string
          tx_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      crypto_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          min_amount_usdt: number
          singleton: boolean
          trc20_address: string
          updated_at: string
          usdt_try_rate: number | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          min_amount_usdt?: number
          singleton?: boolean
          trc20_address?: string
          updated_at?: string
          usdt_try_rate?: number | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          min_amount_usdt?: number
          singleton?: boolean
          trc20_address?: string
          updated_at?: string
          usdt_try_rate?: number | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_sales: {
        Row: {
          created_at: string
          discount_type: string
          discount_value: number
          ends_at: string
          id: string
          is_active: boolean
          label: string | null
          product_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_type: string
          discount_value: number
          ends_at: string
          id?: string
          is_active?: boolean
          label?: string | null
          product_id: string
          starts_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          product_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
      low_stock_alerts: {
        Row: {
          last_available: number
          last_sent_at: string
          product_id: string
        }
        Insert: {
          last_available?: number
          last_sent_at?: string
          product_id: string
        }
        Update: {
          last_available?: number
          last_sent_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "low_stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          abandonment: boolean
          created_at: string
          marketing: boolean
          order_updates: boolean
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
          wallet_events: boolean
        }
        Insert: {
          abandonment?: boolean
          created_at?: string
          marketing?: boolean
          order_updates?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
          wallet_events?: boolean
        }
        Update: {
          abandonment?: boolean
          created_at?: string
          marketing?: boolean
          order_updates?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
          wallet_events?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_discounts: {
        Row: {
          code_snapshot: string
          created_at: string
          discount_try: number
          id: string
          order_id: string
          product_id: string | null
          promo_code_id: string | null
        }
        Insert: {
          code_snapshot: string
          created_at?: string
          discount_try: number
          id?: string
          order_id: string
          product_id?: string | null
          promo_code_id?: string | null
        }
        Update: {
          code_snapshot?: string
          created_at?: string
          discount_try?: number
          id?: string
          order_id?: string
          product_id?: string | null
          promo_code_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_discounts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_discounts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          unit_price_try: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity?: number
          unit_price_try: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          unit_price_try?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_keys: {
        Row: {
          delivered_at: string
          id: string
          license_key_id: string | null
          order_id: string
        }
        Insert: {
          delivered_at?: string
          id?: string
          license_key_id?: string | null
          order_id: string
        }
        Update: {
          delivered_at?: string
          id?: string
          license_key_id?: string | null
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
          abandonment_notified_at: string | null
          admin_note: string | null
          approved_at: string | null
          checkout_fields: Json | null
          created_at: string
          custom_fields: Json | null
          external_delivery_data: string | null
          external_order_id: string | null
          external_status: string | null
          id: string
          item_count: number
          paid_with: string
          price_try: number
          product_id: string | null
          receipt_path: string | null
          reference_code: string
          referral_commission_paid: boolean
          shopier_order_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          user_id: string
          user_note: string | null
        }
        Insert: {
          abandonment_notified_at?: string | null
          admin_note?: string | null
          approved_at?: string | null
          checkout_fields?: Json | null
          created_at?: string
          custom_fields?: Json | null
          external_delivery_data?: string | null
          external_order_id?: string | null
          external_status?: string | null
          id?: string
          item_count?: number
          paid_with?: string
          price_try: number
          product_id?: string | null
          receipt_path?: string | null
          reference_code: string
          referral_commission_paid?: boolean
          shopier_order_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          user_id: string
          user_note?: string | null
        }
        Update: {
          abandonment_notified_at?: string | null
          admin_note?: string | null
          approved_at?: string | null
          checkout_fields?: Json | null
          created_at?: string
          custom_fields?: Json | null
          external_delivery_data?: string | null
          external_order_id?: string | null
          external_status?: string | null
          id?: string
          item_count?: number
          paid_with?: string
          price_try?: number
          product_id?: string | null
          receipt_path?: string | null
          reference_code?: string
          referral_commission_paid?: boolean
          shopier_order_id?: string | null
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
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
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
          avg_rating: number
          category: string | null
          cost_try: number | null
          created_at: string
          default_license_days: number | null
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          description: string | null
          duration: Database["public"]["Enums"]["duration_type"]
          external_id: string | null
          external_price: number | null
          featured: boolean
          id: string
          image_url: string | null
          low_stock_threshold: number
          manual_fulfillment: boolean
          name: string
          orders_count: number
          price_try: number
          required_fields: Json | null
          requires_email: boolean
          review_count: number
          shopier_url: string | null
          slug: string
          sort_order: number
          source: string
          stock_hint: number | null
          tier: string
          unlimited_stock: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          avg_rating?: number
          category?: string | null
          cost_try?: number | null
          created_at?: string
          default_license_days?: number | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          description?: string | null
          duration?: Database["public"]["Enums"]["duration_type"]
          external_id?: string | null
          external_price?: number | null
          featured?: boolean
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          manual_fulfillment?: boolean
          name: string
          orders_count?: number
          price_try: number
          required_fields?: Json | null
          requires_email?: boolean
          review_count?: number
          shopier_url?: string | null
          slug: string
          sort_order?: number
          source?: string
          stock_hint?: number | null
          tier?: string
          unlimited_stock?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          avg_rating?: number
          category?: string | null
          cost_try?: number | null
          created_at?: string
          default_license_days?: number | null
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          description?: string | null
          duration?: Database["public"]["Enums"]["duration_type"]
          external_id?: string | null
          external_price?: number | null
          featured?: boolean
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          manual_fulfillment?: boolean
          name?: string
          orders_count?: number
          price_try?: number
          required_fields?: Json | null
          requires_email?: boolean
          review_count?: number
          shopier_url?: string | null
          slug?: string
          sort_order?: number
          source?: string
          stock_hint?: number | null
          tier?: string
          unlimited_stock?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_seen_at: string | null
          last_seen_ip: string | null
          referral_bonus_paid: boolean
          referral_code: string | null
          referred_by: string | null
          tier: Database["public"]["Enums"]["user_tier"]
          total_points: number
          updated_at: string
        }
        Insert: {
          avatar_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          last_seen_at?: string | null
          last_seen_ip?: string | null
          referral_bonus_paid?: boolean
          referral_code?: string | null
          referred_by?: string | null
          tier?: Database["public"]["Enums"]["user_tier"]
          total_points?: number
          updated_at?: string
        }
        Update: {
          avatar_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_seen_at?: string | null
          last_seen_ip?: string | null
          referral_bonus_paid?: boolean
          referral_code?: string | null
          referred_by?: string | null
          tier?: Database["public"]["Enums"]["user_tier"]
          total_points?: number
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
      supplier_check_logs: {
        Row: {
          balance: number | null
          balance_ok: boolean | null
          block_reason: string | null
          blocked: boolean
          context: string | null
          created_at: string
          error: string | null
          external_id: string | null
          id: string
          is_stock: boolean | null
          product_id: string | null
          product_name: string | null
          source: string
          stock_count: number | null
          stock_ok: boolean | null
          supplier_amount: number | null
          user_id: string | null
        }
        Insert: {
          balance?: number | null
          balance_ok?: boolean | null
          block_reason?: string | null
          blocked?: boolean
          context?: string | null
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          is_stock?: boolean | null
          product_id?: string | null
          product_name?: string | null
          source?: string
          stock_count?: number | null
          stock_ok?: boolean | null
          supplier_amount?: number | null
          user_id?: string | null
        }
        Update: {
          balance?: number | null
          balance_ok?: boolean | null
          block_reason?: string | null
          blocked?: boolean
          context?: string | null
          created_at?: string
          error?: string | null
          external_id?: string | null
          id?: string
          is_stock?: boolean | null
          product_id?: string | null
          product_name?: string | null
          source?: string
          stock_count?: number | null
          stock_ok?: boolean | null
          supplier_amount?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_admin: boolean
          sender_id: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_admin?: boolean
          sender_id: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_admin?: boolean
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          last_message_by_admin: boolean
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          unread_for_admin: number
          unread_for_user: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_by_admin?: boolean
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          unread_for_admin?: number
          unread_for_user?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_by_admin?: boolean
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          unread_for_admin?: number
          unread_for_user?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_points_ledger: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          order_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          order_id?: string | null
          reason: string
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          order_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_points_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      wallet_topups: {
        Row: {
          admin_note: string | null
          amount_try: number
          approved_at: string | null
          created_at: string
          id: string
          receipt_path: string | null
          reference_code: string
          status: Database["public"]["Enums"]["topup_status"]
          updated_at: string
          user_id: string
          user_note: string | null
        }
        Insert: {
          admin_note?: string | null
          amount_try: number
          approved_at?: string | null
          created_at?: string
          id?: string
          receipt_path?: string | null
          reference_code: string
          status?: Database["public"]["Enums"]["topup_status"]
          updated_at?: string
          user_id: string
          user_note?: string | null
        }
        Update: {
          admin_note?: string | null
          amount_try?: number
          approved_at?: string | null
          created_at?: string
          id?: string
          receipt_path?: string | null
          reference_code?: string
          status?: Database["public"]["Enums"]["topup_status"]
          updated_at?: string
          user_id?: string
          user_note?: string | null
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_try: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["wallet_txn_kind"]
          note: string | null
          order_id: string | null
          topup_id: string | null
          user_id: string
        }
        Insert: {
          amount_try: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["wallet_txn_kind"]
          note?: string | null
          order_id?: string | null
          topup_id?: string | null
          user_id: string
        }
        Update: {
          amount_try?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["wallet_txn_kind"]
          note?: string | null
          order_id?: string | null
          topup_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_topup_id_fkey"
            columns: ["topup_id"]
            isOneToOne: false
            referencedRelation: "wallet_topups"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance_try: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_try?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_try?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _assign_key_to_order: {
        Args: { _order_id: string }
        Returns: {
          activation_token: string
          license_key: string
        }[]
      }
      activate_license: { Args: { _hwid: string; _key: string }; Returns: Json }
      add_item_to_order: {
        Args: { _order_id: string; _product_id: string; _quantity?: number }
        Returns: {
          out_order_id: string
          out_total_try: number
        }[]
      }
      admin_adjust_wallet: {
        Args: { _delta: number; _note: string; _user_id: string }
        Returns: number
      }
      admin_daily_revenue: {
        Args: { _days?: number }
        Returns: {
          day: string
          orders: number
          revenue: number
        }[]
      }
      admin_dashboard_summary: {
        Args: never
        Returns: {
          avg_basket: number
          month_orders: number
          month_revenue: number
          pending_count: number
          reviewing_count: number
          today_orders: number
          today_revenue: number
          users_count: number
          week_orders: number
          week_revenue: number
        }[]
      }
      admin_force_delete_license: { Args: { _id: string }; Returns: boolean }
      admin_list_assigned_keys: {
        Args: { _limit?: number }
        Returns: {
          activated_at: string
          assigned_at: string
          expires_at: string
          key_id: string
          key_value: string
          order_id: string
          order_status: string
          product_id: string
          product_name: string
          reference_code: string
          revoked: boolean
          user_email: string
        }[]
      }
      admin_low_stock_products: {
        Args: never
        Returns: {
          available: number
          name: string
          product_id: string
          slug: string
          threshold: number
        }[]
      }
      admin_product_profitability: {
        Args: { _days?: number }
        Returns: {
          cost: number
          name: string
          product_id: string
          profit: number
          revenue: number
          sold: number
        }[]
      }
      admin_purge_available_keys: {
        Args: { _product_id: string }
        Returns: number
      }
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
      approve_shopier_order: {
        Args: {
          _amount: number
          _buyer_email: string
          _shopier_order_id: string
        }
        Returns: {
          already: boolean
          matched: boolean
          order_id: string
        }[]
      }
      approve_topup: { Args: { _topup_id: string }; Returns: number }
      award_points: {
        Args: {
          _delta: number
          _order_id?: string
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      bump_orders_count: { Args: { _order_id: string }; Returns: undefined }
      cancel_pending_order: { Args: { _order_id: string }; Returns: boolean }
      check_low_stock_after_assign: {
        Args: { _product_id: string }
        Returns: {
          available: number
          product_name: string
          should_alert: boolean
          threshold: number
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
      compute_tier: {
        Args: { _points: number }
        Returns: Database["public"]["Enums"]["user_tier"]
      }
      create_cart_order:
        | {
            Args: { _items: Json }
            Returns: {
              order_id: string
              reference_code: string
              total_try: number
            }[]
          }
        | {
            Args: { _coupon_code?: string; _items: Json }
            Returns: {
              order_id: string
              reference_code: string
              total_try: number
            }[]
          }
      credit_crypto_deposit: {
        Args: {
          _amount_usdt: number
          _block_timestamp: string
          _from_address: string
          _rate: number
          _to_address: string
          _tx_hash: string
          _user_id: string
        }
        Returns: string
      }
      finalize_free_order: {
        Args: { _order_id: string }
        Returns: {
          activation_token: string
          license_key: string
        }[]
      }
      gen_random_bytes: { Args: { len: number }; Returns: string }
      gen_referral_code: { Args: never; Returns: string }
      get_order_by_reference: {
        Args: { _ref: string }
        Returns: {
          admin_note: string
          approved_at: string
          created_at: string
          external_status: string
          order_id: string
          price_try: number
          reference_code: string
          status: Database["public"]["Enums"]["order_status"]
        }[]
      }
      guess_product_category: {
        Args: { _description?: string; _name: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_abandoned_orders: {
        Args: { _minutes?: number }
        Returns: {
          created_at: string
          order_id: string
          price_try: number
          reference_code: string
          user_id: string
        }[]
      }
      list_product_reviews: {
        Args: { _product_id: string }
        Returns: {
          comment: string
          created_at: string
          id: string
          is_mine: boolean
          masked_user: string
          rating: number
        }[]
      }
      mark_abandonment_notified: {
        Args: { _order_id: string }
        Returns: undefined
      }
      pay_order_with_wallet: {
        Args: { _order_id: string }
        Returns: {
          balance_after: number
          license_key: string
          license_token: string
        }[]
      }
      process_referral_bonus: { Args: { _user_id: string }; Returns: undefined }
      push_notification: {
        Args: {
          _body?: string
          _link?: string
          _title: string
          _type: string
          _user_id: string
        }
        Returns: string
      }
      refund_order_to_wallet: { Args: { _order_id: string }; Returns: number }
      refund_points_discount: { Args: { _order_id: string }; Returns: number }
      reject_topup: {
        Args: { _note: string; _topup_id: string }
        Returns: undefined
      }
      remove_item_from_order: {
        Args: { _item_id: string; _order_id: string }
        Returns: {
          items_left: number
          order_id: string
          total_try: number
        }[]
      }
      remove_promo_code: { Args: { _order_id: string }; Returns: undefined }
      spend_points: {
        Args: { _amount: number; _order_id: string }
        Returns: {
          balance_after: number
          discount_try: number
        }[]
      }
      support_mark_read_admin: {
        Args: { _ticket_id: string }
        Returns: undefined
      }
      support_mark_read_user: {
        Args: { _ticket_id: string }
        Returns: undefined
      }
      touch_session_ip: {
        Args: { _ip: string }
        Returns: {
          ip_changed: boolean
          previous_ip: string
        }[]
      }
      validate_coupon: {
        Args: { _code: string; _subtotal: number }
        Returns: {
          code: string
          coupon_id: string
          discount_try: number
          final_try: number
        }[]
      }
      validate_license: { Args: { _hwid: string; _key: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      delivery_type: "key" | "account" | "link" | "link_token"
      duration_type:
        | "monthly"
        | "yearly"
        | "lifetime"
        | "hourly"
        | "daily"
        | "weekly"
      key_status: "available" | "assigned" | "revoked"
      order_status: "pending" | "reviewing" | "approved" | "rejected"
      promo_type: "percent" | "fixed"
      support_ticket_priority: "low" | "normal" | "high" | "urgent"
      support_ticket_status: "open" | "pending" | "closed"
      topup_status: "pending" | "reviewing" | "approved" | "rejected"
      user_tier: "bronze" | "silver" | "gold" | "platinum"
      wallet_txn_kind:
        | "topup"
        | "purchase"
        | "refund"
        | "admin_credit"
        | "admin_debit"
        | "referral_bonus"
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
      duration_type: [
        "monthly",
        "yearly",
        "lifetime",
        "hourly",
        "daily",
        "weekly",
      ],
      key_status: ["available", "assigned", "revoked"],
      order_status: ["pending", "reviewing", "approved", "rejected"],
      promo_type: ["percent", "fixed"],
      support_ticket_priority: ["low", "normal", "high", "urgent"],
      support_ticket_status: ["open", "pending", "closed"],
      topup_status: ["pending", "reviewing", "approved", "rejected"],
      user_tier: ["bronze", "silver", "gold", "platinum"],
      wallet_txn_kind: [
        "topup",
        "purchase",
        "refund",
        "admin_credit",
        "admin_debit",
        "referral_bonus",
      ],
    },
  },
} as const
