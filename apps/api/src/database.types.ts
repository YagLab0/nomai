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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_wallets: {
        Row: {
          address: string
          created_at: string
          erc8004_agent_id: string | null
          id: string
          network: string
          traveler_id: string
        }
        Insert: {
          address: string
          created_at?: string
          erc8004_agent_id?: string | null
          id?: string
          network?: string
          traveler_id: string
        }
        Update: {
          address?: string
          created_at?: string
          erc8004_agent_id?: string | null
          id?: string
          network?: string
          traveler_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_wallets_traveler_id_fkey"
            columns: ["traveler_id"]
            isOneToOne: true
            referencedRelation: "travelers"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          agent_wallet_id: string | null
          cancelled_at: string | null
          check_in: string
          check_out: string
          created_at: string
          currency: string
          fx_fee: number | null
          id: string
          lodging_id: string
          network: string | null
          pay_to: string | null
          quote: Json | null
          refund_amount: number | null
          status: string
          subtotal: number
          total: number
          traveler_id: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          agent_wallet_id?: string | null
          cancelled_at?: string | null
          check_in: string
          check_out: string
          created_at?: string
          currency: string
          fx_fee?: number | null
          id?: string
          lodging_id: string
          network?: string | null
          pay_to?: string | null
          quote?: Json | null
          refund_amount?: number | null
          status?: string
          subtotal: number
          total: number
          traveler_id: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          agent_wallet_id?: string | null
          cancelled_at?: string | null
          check_in?: string
          check_out?: string
          created_at?: string
          currency?: string
          fx_fee?: number | null
          id?: string
          lodging_id?: string
          network?: string | null
          pay_to?: string | null
          quote?: Json | null
          refund_amount?: number | null
          status?: string
          subtotal?: number
          total?: number
          traveler_id?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_agent_wallet_id_fkey"
            columns: ["agent_wallet_id"]
            isOneToOne: false
            referencedRelation: "agent_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_lodging_id_fkey"
            columns: ["lodging_id"]
            isOneToOne: false
            referencedRelation: "lodgings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_traveler_id_fkey"
            columns: ["traveler_id"]
            isOneToOne: false
            referencedRelation: "travelers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          id: string
          kind: string
          meta: Json
          reference: string | null
          stage: string | null
          traveler_id: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          reference?: string | null
          stage?: string | null
          traveler_id: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          reference?: string | null
          stage?: string | null
          traveler_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_traveler_id_fkey"
            columns: ["traveler_id"]
            isOneToOne: false
            referencedRelation: "travelers"
            referencedColumns: ["id"]
          },
        ]
      }
      lodgings: {
        Row: {
          amenities: string[]
          baths: number | null
          bedrooms: number | null
          blurb: string | null
          city: string
          code: string | null
          country_code: string
          created_at: string
          currency: string
          featured: boolean
          guests: number
          id: string
          kind: string
          name: string
          owner_id: string
          photo_key: string | null
          price_per_night: number
          region: string | null
          slug: string
          tone: string | null
          updated_at: string
        }
        Insert: {
          amenities?: string[]
          baths?: number | null
          bedrooms?: number | null
          blurb?: string | null
          city: string
          code?: string | null
          country_code: string
          created_at?: string
          currency: string
          featured?: boolean
          guests?: number
          id?: string
          kind: string
          name: string
          owner_id: string
          photo_key?: string | null
          price_per_night: number
          region?: string | null
          slug: string
          tone?: string | null
          updated_at?: string
        }
        Update: {
          amenities?: string[]
          baths?: number | null
          bedrooms?: number | null
          blurb?: string | null
          city?: string
          code?: string | null
          country_code?: string
          created_at?: string
          currency?: string
          featured?: boolean
          guests?: number
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          photo_key?: string | null
          price_per_night?: number
          region?: string | null
          slug?: string
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lodgings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          bio: string | null
          city: string
          country: string
          country_code: string
          created_at: string
          id: string
          name: string
          response_time: string | null
          since: number | null
          slug: string
          updated_at: string
          user_id: string | null
          verified: boolean
          wallet: string | null
        }
        Insert: {
          bio?: string | null
          city: string
          country: string
          country_code: string
          created_at?: string
          id?: string
          name: string
          response_time?: string | null
          since?: number | null
          slug: string
          updated_at?: string
          user_id?: string | null
          verified?: boolean
          wallet?: string | null
        }
        Update: {
          bio?: string | null
          city?: string
          country?: string
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          response_time?: string | null
          since?: number | null
          slug?: string
          updated_at?: string
          user_id?: string | null
          verified?: boolean
          wallet?: string | null
        }
        Relationships: []
      }
      travelers: {
        Row: {
          country_code: string | null
          created_at: string
          full_name: string | null
          funded_at: string | null
          gov_id_verified_at: string | null
          id: string
          phone: string | null
          phone_verified_at: string | null
          self_verified_at: string | null
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          full_name?: string | null
          funded_at?: string | null
          gov_id_verified_at?: string | null
          id: string
          phone?: string | null
          phone_verified_at?: string | null
          self_verified_at?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          full_name?: string | null
          funded_at?: string | null
          gov_id_verified_at?: string | null
          id?: string
          phone?: string | null
          phone_verified_at?: string | null
          self_verified_at?: string | null
          updated_at?: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
