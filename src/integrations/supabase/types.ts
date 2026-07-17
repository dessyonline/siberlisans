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
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      affiliate_payouts: {
        Row: {
          admin_note: string | null
          amount_try: number
          created_at: string
          destination: string | null
          id: string
          method: string
          processed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_try: number
          created_at?: string
          destination?: string | null
          id?: string
          method?: string
          processed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_try?: number
          created_at?: string
          destination?: string | null
          id?: string
          method?: string
          processed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          rule_key: string | null
          season: string | null
          threshold: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id: string
          is_active?: boolean
          name: string
          rule_key?: string | null
          season?: string | null
          threshold?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rule_key?: string | null
          season?: string | null
          threshold?: number | null
        }
        Relationships: []
      }
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
          is_personal: boolean
          max_uses: number | null
          min_order_try: number
          updated_at: string
          used_count: number
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_personal?: boolean
          max_uses?: number | null
          min_order_try?: number
          updated_at?: string
          used_count?: number
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_personal?: boolean
          max_uses?: number | null
          min_order_try?: number
          updated_at?: string
          used_count?: number
          user_id?: string | null
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
      ig_auto_reply_rules: {
        Row: {
          active: boolean
          case_sensitive: boolean
          created_at: string
          created_by: string | null
          id: string
          last_matched_at: string | null
          match_count: number
          match_type: Database["public"]["Enums"]["ig_match_type"]
          priority: number
          response: string
          trigger: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          case_sensitive?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          last_matched_at?: string | null
          match_count?: number
          match_type?: Database["public"]["Enums"]["ig_match_type"]
          priority?: number
          response: string
          trigger: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          case_sensitive?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          last_matched_at?: string | null
          match_count?: number
          match_type?: Database["public"]["Enums"]["ig_match_type"]
          priority?: number
          response?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
      ig_message_log: {
        Row: {
          created_at: string
          id: string
          ig_message_id: string | null
          matched_rule_id: string | null
          message_text: string | null
          raw_payload: Json | null
          recipient_id: string | null
          reply_error: string | null
          reply_sent: boolean
          reply_text: string | null
          sender_id: string
          sender_username: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ig_message_id?: string | null
          matched_rule_id?: string | null
          message_text?: string | null
          raw_payload?: Json | null
          recipient_id?: string | null
          reply_error?: string | null
          reply_sent?: boolean
          reply_text?: string | null
          sender_id: string
          sender_username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ig_message_id?: string | null
          matched_rule_id?: string | null
          message_text?: string | null
          raw_payload?: Json | null
          recipient_id?: string | null
          reply_error?: string | null
          reply_sent?: boolean
          reply_text?: string | null
          sender_id?: string
          sender_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ig_message_log_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "ig_auto_reply_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          buyer_address: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_tax_id: string | null
          created_at: string
          id: string
          invoice_number: string
          issued_at: string
          items_snapshot: Json
          order_id: string
          subtotal_try: number
          total_try: number
          user_id: string
          vat_amount_try: number
          vat_rate: number
        }
        Insert: {
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_tax_id?: string | null
          created_at?: string
          id?: string
          invoice_number: string
          issued_at?: string
          items_snapshot?: Json
          order_id: string
          subtotal_try?: number
          total_try?: number
          user_id: string
          vat_amount_try?: number
          vat_rate?: number
        }
        Update: {
          buyer_address?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_tax_id?: string | null
          created_at?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          items_snapshot?: Json
          order_id?: string
          subtotal_try?: number
          total_try?: number
          user_id?: string
          vat_amount_try?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      license_events: {
        Row: {
          created_at: string
          detail: string | null
          event: string
          hwid: string | null
          id: number
          ip: string | null
          license_key: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          event: string
          hwid?: string | null
          id?: number
          ip?: string | null
          license_key: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          event?: string
          hwid?: string | null
          id?: number
          ip?: string | null
          license_key?: string
          user_agent?: string | null
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
          is_shared: boolean
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
          is_shared?: boolean
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
          is_shared?: boolean
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
      license_nonces: {
        Row: {
          created_at: string
          license_key: string
          nonce: string
        }
        Insert: {
          created_at?: string
          license_key: string
          nonce: string
        }
        Update: {
          created_at?: string
          license_key?: string
          nonce?: string
        }
        Relationships: []
      }
      license_transfers: {
        Row: {
          completed_at: string | null
          created_at: string | null
          from_user_id: string
          id: string
          order_id: string
          status: string
          to_email: string | null
          to_user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          from_user_id: string
          id?: string
          order_id: string
          status?: string
          to_email?: string | null
          to_user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          from_user_id?: string
          id?: string
          order_id?: string
          status?: string
          to_email?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "license_transfers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      missions: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          reward_points: number
          rule_key: string
          season: string | null
          sort_order: number
          target: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          reward_points?: number
          rule_key: string
          season?: string | null
          sort_order?: number
          target?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          reward_points?: number
          rule_key?: string
          season?: string | null
          sort_order?: number
          target?: number
        }
        Relationships: []
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
          web_push: boolean
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
          web_push?: boolean
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
          web_push?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          pushed_at: string | null
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
          pushed_at?: string | null
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
          pushed_at?: string | null
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
      product_bundle_items: {
        Row: {
          bundle_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          bundle_id: string
          product_id: string
          quantity?: number
        }
        Update: {
          bundle_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "product_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bundles: {
        Row: {
          active: boolean
          created_at: string | null
          description: string | null
          discount_percent: number
          id: string
          name: string
          price_try: number
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          discount_percent?: number
          id?: string
          name: string
          price_try: number
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          description?: string | null
          discount_percent?: number
          id?: string
          name?: string
          price_try?: number
          slug?: string
        }
        Relationships: []
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
          duration_label: string | null
          external_id: string | null
          external_price: number | null
          featured: boolean
          id: string
          image_url: string | null
          low_stock_threshold: number
          manual_fulfillment: boolean
          name: string
          orders_count: number
          price_locked: boolean
          price_try: number
          required_fields: Json | null
          requires_email: boolean
          retail_price_source_url: string | null
          retail_price_try: number | null
          retail_price_updated_at: string | null
          review_count: number
          shopier_url: string | null
          slug: string
          sort_order: number
          source: string
          stock_hint: number | null
          supplier_out_of_stock: boolean
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
          duration_label?: string | null
          external_id?: string | null
          external_price?: number | null
          featured?: boolean
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          manual_fulfillment?: boolean
          name: string
          orders_count?: number
          price_locked?: boolean
          price_try: number
          required_fields?: Json | null
          requires_email?: boolean
          retail_price_source_url?: string | null
          retail_price_try?: number | null
          retail_price_updated_at?: string | null
          review_count?: number
          shopier_url?: string | null
          slug: string
          sort_order?: number
          source?: string
          stock_hint?: number | null
          supplier_out_of_stock?: boolean
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
          duration_label?: string | null
          external_id?: string | null
          external_price?: number | null
          featured?: boolean
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          manual_fulfillment?: boolean
          name?: string
          orders_count?: number
          price_locked?: boolean
          price_try?: number
          required_fields?: Json | null
          requires_email?: boolean
          retail_price_source_url?: string | null
          retail_price_try?: number | null
          retail_price_updated_at?: string | null
          review_count?: number
          shopier_url?: string | null
          slug?: string
          sort_order?: number
          source?: string
          stock_hint?: number | null
          supplier_out_of_stock?: boolean
          tier?: string
          unlimited_stock?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_id: string | null
          billing_address: string | null
          billing_name: string | null
          billing_tax_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          last_seen_at: string | null
          last_seen_ip: string | null
          last_streak_at: string | null
          login_streak: number
          onboarded_at: string | null
          partner_slug: string | null
          referral_bonus_paid: boolean
          referral_code: string | null
          referred_by: string | null
          tier: Database["public"]["Enums"]["user_tier"]
          total_points: number
          updated_at: string
          weekly_digest_enabled: boolean
        }
        Insert: {
          avatar_id?: string | null
          billing_address?: string | null
          billing_name?: string | null
          billing_tax_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          last_seen_at?: string | null
          last_seen_ip?: string | null
          last_streak_at?: string | null
          login_streak?: number
          onboarded_at?: string | null
          partner_slug?: string | null
          referral_bonus_paid?: boolean
          referral_code?: string | null
          referred_by?: string | null
          tier?: Database["public"]["Enums"]["user_tier"]
          total_points?: number
          updated_at?: string
          weekly_digest_enabled?: boolean
        }
        Update: {
          avatar_id?: string | null
          billing_address?: string | null
          billing_name?: string | null
          billing_tax_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          last_seen_at?: string | null
          last_seen_ip?: string | null
          last_streak_at?: string | null
          login_streak?: number
          onboarded_at?: string | null
          partner_slug?: string | null
          referral_bonus_paid?: boolean
          referral_code?: string | null
          referred_by?: string | null
          tier?: Database["public"]["Enums"]["user_tier"]
          total_points?: number
          updated_at?: string
          weekly_digest_enabled?: boolean
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          fail_count: number
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          fail_count?: number
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          fail_count?: number
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      raffle_entries: {
        Row: {
          created_at: string
          entries_count: number
          id: string
          points_spent: number
          raffle_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entries_count?: number
          id?: string
          points_spent?: number
          raffle_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          entries_count?: number
          id?: string
          points_spent?: number
          raffle_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raffle_entries_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      raffles: {
        Row: {
          created_at: string
          created_by: string | null
          custom_prize_name: string | null
          delivered_key: string | null
          description: string | null
          drawn_at: string | null
          end_at: string
          entry_cost_points: number
          id: string
          image_url: string | null
          max_entries_per_user: number
          product_id: string | null
          start_at: string
          status: string
          title: string
          updated_at: string
          winner_entry_id: string | null
          winner_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_prize_name?: string | null
          delivered_key?: string | null
          description?: string | null
          drawn_at?: string | null
          end_at: string
          entry_cost_points?: number
          id?: string
          image_url?: string | null
          max_entries_per_user?: number
          product_id?: string | null
          start_at?: string
          status?: string
          title: string
          updated_at?: string
          winner_entry_id?: string | null
          winner_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_prize_name?: string | null
          delivered_key?: string | null
          description?: string | null
          drawn_at?: string | null
          end_at?: string
          entry_cost_points?: number
          id?: string
          image_url?: string | null
          max_entries_per_user?: number
          product_id?: string | null
          start_at?: string
          status?: string
          title?: string
          updated_at?: string
          winner_entry_id?: string | null
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raffles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_clicks: {
        Row: {
          converted: boolean
          converted_user_id: string | null
          created_at: string
          id: string
          partner_user_id: string | null
          referral_code: string
          source: string | null
          ua_hash: string | null
        }
        Insert: {
          converted?: boolean
          converted_user_id?: string | null
          created_at?: string
          id?: string
          partner_user_id?: string | null
          referral_code: string
          source?: string | null
          ua_hash?: string | null
        }
        Update: {
          converted?: boolean
          converted_user_id?: string | null
          created_at?: string
          id?: string
          partner_user_id?: string | null
          referral_code?: string
          source?: string | null
          ua_hash?: string | null
        }
        Relationships: []
      }
      stock_notifications: {
        Row: {
          created_at: string
          email: string | null
          id: string
          notified_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          notified_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          notified_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_renewal_attempts: {
        Row: {
          amount_try: number | null
          attempted_at: string
          error_message: string | null
          id: string
          order_id: string | null
          outcome: string
          subscription_id: string
        }
        Insert: {
          amount_try?: number | null
          attempted_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          outcome: string
          subscription_id: string
        }
        Update: {
          amount_try?: number | null
          attempted_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          outcome?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_renewal_attempts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          canceled_at: string | null
          created_at: string
          current_license_key_id: string | null
          failure_count: number
          id: string
          interval_days: number
          last_attempt_at: string | null
          last_order_id: string | null
          last_renewed_at: string | null
          next_renewal_at: string
          price_try: number
          product_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean
          canceled_at?: string | null
          created_at?: string
          current_license_key_id?: string | null
          failure_count?: number
          id?: string
          interval_days: number
          last_attempt_at?: string | null
          last_order_id?: string | null
          last_renewed_at?: string | null
          next_renewal_at: string
          price_try: number
          product_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean
          canceled_at?: string | null
          created_at?: string
          current_license_key_id?: string | null
          failure_count?: number
          id?: string
          interval_days?: number
          last_attempt_at?: string | null
          last_order_id?: string | null
          last_renewed_at?: string | null
          next_renewal_at?: string
          price_try?: number
          product_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_product_id_fkey"
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
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_missions: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          mission_id: string
          progress: number
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          mission_id: string
          progress?: number
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          mission_id?: string
          progress?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_missions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
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
      weekly_digest_log: {
        Row: {
          id: string
          items_count: number
          payload: Json | null
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          items_count?: number
          payload?: Json | null
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          items_count?: number
          payload?: Json | null
          sent_at?: string
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
      admin_cancel_order: {
        Args: { _note?: string; _order_id: string }
        Returns: Json
      }
      admin_create_license_key: {
        Args: {
          _duration_days?: number
          _email?: string
          _key_value?: string
          _product_id: string
        }
        Returns: {
          expires_at: string
          id: string
          key_value: string
        }[]
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
      admin_profit_by_product: {
        Args: { _from: string; _to: string }
        Returns: {
          cost: number
          product_id: string
          product_name: string
          profit: number
          qty_sold: number
          revenue: number
        }[]
      }
      admin_profit_report: {
        Args: { _from: string; _granularity?: string; _to: string }
        Returns: {
          bucket: string
          cost: number
          discount_total: number
          gross_revenue: number
          orders_count: number
          profit: number
          refunds: number
          revenue: number
          topups: number
        }[]
      }
      admin_purge_available_keys: {
        Args: { _product_id: string }
        Returns: number
      }
      admin_revoke_license_key: {
        Args: { _key_value: string }
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
          is_shared: boolean
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
      affiliate_stats: {
        Args: { _user_id: string }
        Returns: {
          active_referred_count: number
          pending: number
          referred_count: number
          total_earned: number
          total_paid: number
        }[]
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
      bump_login_streak: {
        Args: never
        Returns: {
          bonus_points: number
          streak: number
        }[]
      }
      bump_orders_count: { Args: { _order_id: string }; Returns: undefined }
      cancel_pending_order: { Args: { _order_id: string }; Returns: boolean }
      cancel_subscription: { Args: { _sub_id: string }; Returns: boolean }
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
      claim_mission: {
        Args: { _mission_id: string }
        Returns: {
          awarded: number
          progress: number
          target: number
        }[]
      }
      cleanup_license_nonces: { Args: never; Returns: undefined }
      compute_mission_progress: {
        Args: { _rule_key: string; _user_id: string }
        Returns: number
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
      create_invoice_for_order: { Args: { _order_id: string }; Returns: string }
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
      draw_raffle: {
        Args: { _raffle_id: string }
        Returns: {
          delivered_key: string
          winner_entry_id: string
          winner_user_id: string
        }[]
      }
      enter_raffle: {
        Args: { _count?: number; _raffle_id: string }
        Returns: {
          entry_id: string
          points_spent: number
          total_entries: number
        }[]
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
      get_partner_by_code: {
        Args: { _code: string }
        Returns: {
          display_name: string
          partner_slug: string
          referral_code: string
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
      list_my_referred: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          id: string
          masked_email: string
          referral_bonus_paid: boolean
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
      log_admin_action: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _entity_id: string
          _entity_type: string
          _metadata: Json
        }
        Returns: string
      }
      mark_abandonment_notified: {
        Args: { _order_id: string }
        Returns: undefined
      }
      mark_onboarded: { Args: never; Returns: undefined }
      monthly_leaderboard: {
        Args: never
        Returns: {
          avatar_id: string
          display_masked: string
          points_earned: number
          rank: number
          tier: string
          user_id: string
        }[]
      }
      next_invoice_number: { Args: never; Returns: string }
      partner_stats: {
        Args: { _user_id: string }
        Returns: {
          clicks_30d: number
          clicks_total: number
          conversion_rate: number
          conversions: number
          daily: Json
          earnings_30d: number
        }[]
      }
      pay_order_with_wallet: {
        Args: { _order_id: string }
        Returns: {
          balance_after: number
          license_key: string
          license_token: string
        }[]
      }
      process_due_subscriptions: {
        Args: never
        Returns: {
          failed: number
          processed: number
          succeeded: number
        }[]
      }
      process_referral_bonus: { Args: { _user_id: string }; Returns: undefined }
      public_recent_sales: {
        Args: never
        Returns: {
          category: string
          created_at: string
          name: string
        }[]
      }
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
      recompute_badges: { Args: { _user_id: string }; Returns: undefined }
      record_referral_click: {
        Args: { _code: string; _source: string; _ua_hash: string }
        Returns: string
      }
      redeem_points_for_coupon: {
        Args: { _points: number }
        Returns: {
          coupon_code: string
          discount_try: number
        }[]
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
      renew_subscription: {
        Args: { _sub_id: string }
        Returns: {
          license_key: string
          order_id: string
          outcome: string
        }[]
      }
      request_affiliate_payout: {
        Args: { _amount: number; _destination: string; _method: string }
        Returns: string
      }
      send_license_renewal_reminders: { Args: never; Returns: undefined }
      set_subscription_auto_renew: {
        Args: { _on: boolean; _sub_id: string }
        Returns: boolean
      }
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
      transfer_order: {
        Args: { _order_id: string; _to_email: string }
        Returns: string
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
      ig_match_type: "exact" | "contains" | "starts_with" | "regex"
      key_status: "available" | "assigned" | "revoked"
      order_status:
        | "pending"
        | "reviewing"
        | "approved"
        | "rejected"
        | "failed"
        | "cancelled"
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
      ig_match_type: ["exact", "contains", "starts_with", "regex"],
      key_status: ["available", "assigned", "revoked"],
      order_status: [
        "pending",
        "reviewing",
        "approved",
        "rejected",
        "failed",
        "cancelled",
      ],
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
