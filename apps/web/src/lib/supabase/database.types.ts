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
      amenities: {
        Row: {
          category: Database["public"]["Enums"]["amenity_category"]
          code: string
          id: string
          name: string
        }
        Insert: {
          category: Database["public"]["Enums"]["amenity_category"]
          code: string
          id: string
          name: string
        }
        Update: {
          category?: Database["public"]["Enums"]["amenity_category"]
          code?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      availability_nights: {
        Row: {
          listing_id: string
          night: string
          price_minor: number | null
          status: Database["public"]["Enums"]["avail_status"]
          units_available: number
        }
        Insert: {
          listing_id: string
          night: string
          price_minor?: number | null
          status?: Database["public"]["Enums"]["avail_status"]
          units_available?: number
        }
        Update: {
          listing_id?: string
          night?: string
          price_minor?: number | null
          status?: Database["public"]["Enums"]["avail_status"]
          units_available?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_nights_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancel_deadline: string | null
          checkin: string
          checkout: string
          claim_evidence: Json | null
          claim_reason: Database["public"]["Enums"]["claim_reason"] | null
          claim_resolution:
            | Database["public"]["Enums"]["claim_resolution"]
            | null
          claim_resolved_at: string | null
          created_at: string
          currency: string
          escrow_address: string | null
          escrow_status: Database["public"]["Enums"]["escrow_status"]
          final_release_at: string | null
          first_release_at: string | null
          guest_ref: string | null
          guests: number
          id: string
          listing_id: string
          service_fee_minor: number
          service_fee_pct: number | null
          status: Database["public"]["Enums"]["booking_status"]
          total_minor: number
          traveler_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_deadline?: string | null
          checkin: string
          checkout: string
          claim_evidence?: Json | null
          claim_reason?: Database["public"]["Enums"]["claim_reason"] | null
          claim_resolution?:
            | Database["public"]["Enums"]["claim_resolution"]
            | null
          claim_resolved_at?: string | null
          created_at?: string
          currency: string
          escrow_address?: string | null
          escrow_status?: Database["public"]["Enums"]["escrow_status"]
          final_release_at?: string | null
          first_release_at?: string | null
          guest_ref?: string | null
          guests: number
          id: string
          listing_id: string
          service_fee_minor?: number
          service_fee_pct?: number | null
          status?: Database["public"]["Enums"]["booking_status"]
          total_minor: number
          traveler_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_deadline?: string | null
          checkin?: string
          checkout?: string
          claim_evidence?: Json | null
          claim_reason?: Database["public"]["Enums"]["claim_reason"] | null
          claim_resolution?:
            | Database["public"]["Enums"]["claim_resolution"]
            | null
          claim_resolved_at?: string | null
          created_at?: string
          currency?: string
          escrow_address?: string | null
          escrow_status?: Database["public"]["Enums"]["escrow_status"]
          final_release_at?: string | null
          first_release_at?: string | null
          guest_ref?: string | null
          guests?: number
          id?: string
          listing_id?: string
          service_fee_minor?: number
          service_fee_pct?: number | null
          status?: Database["public"]["Enums"]["booking_status"]
          total_minor?: number
          traveler_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
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
      businesses: {
        Row: {
          created_at: string
          email: string | null
          id: string
          legal_name: string | null
          name: string
          payout_address: string | null
          phone: string | null
          slug: string
          status: Database["public"]["Enums"]["business_status"]
          tax_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          legal_name?: string | null
          name: string
          payout_address?: string | null
          phone?: string | null
          slug: string
          status?: Database["public"]["Enums"]["business_status"]
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          payout_address?: string | null
          phone?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["business_status"]
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cancellation_policies: {
        Row: {
          business_id: string | null
          full_refund_days: number
          id: string
          name: string
          partial_refund_days: number
          partial_refund_pct: number
        }
        Insert: {
          business_id?: string | null
          full_refund_days: number
          id: string
          name: string
          partial_refund_days: number
          partial_refund_pct: number
        }
        Update: {
          business_id?: string | null
          full_refund_days?: number
          id?: string
          name?: string
          partial_refund_days?: number
          partial_refund_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_policies_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
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
      listing_amenities: {
        Row: {
          amenity_id: string
          detail: string | null
          listing_id: string
        }
        Insert: {
          amenity_id: string
          detail?: string | null
          listing_id: string
        }
        Update: {
          amenity_id?: string
          detail?: string | null
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_amenities_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_amenities_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photos: {
        Row: {
          alt_text: string | null
          id: string
          is_cover: boolean
          listing_id: string
          position: number
          url: string
        }
        Insert: {
          alt_text?: string | null
          id: string
          is_cover?: boolean
          listing_id: string
          position?: number
          url: string
        }
        Update: {
          alt_text?: string | null
          id?: string
          is_cover?: boolean
          listing_id?: string
          position?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_units: {
        Row: {
          code: string
          id: string
          listing_id: string
          status: Database["public"]["Enums"]["unit_status"]
        }
        Insert: {
          code: string
          id: string
          listing_id: string
          status?: Database["public"]["Enums"]["unit_status"]
        }
        Update: {
          code?: string
          id?: string
          listing_id?: string
          status?: Database["public"]["Enums"]["unit_status"]
        }
        Relationships: [
          {
            foreignKeyName: "listing_units_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          base_price_minor: number
          bathrooms: number | null
          bedrooms: number | null
          beds: number | null
          cancel_policy_id: string | null
          cleaning_fee_minor: number
          created_at: string
          currency: string
          description: string | null
          events_allowed: boolean
          id: string
          instant_book: boolean
          kind: Database["public"]["Enums"]["listing_kind"]
          max_guests: number
          max_nights: number | null
          min_nights: number
          pets_allowed: boolean
          property_id: string
          published_at: string | null
          rating: number | null
          reviews: number
          slug: string
          smoking_allowed: boolean
          status: Database["public"]["Enums"]["listing_status"]
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          base_price_minor: number
          bathrooms?: number | null
          bedrooms?: number | null
          beds?: number | null
          cancel_policy_id?: string | null
          cleaning_fee_minor?: number
          created_at?: string
          currency: string
          description?: string | null
          events_allowed?: boolean
          id: string
          instant_book?: boolean
          kind: Database["public"]["Enums"]["listing_kind"]
          max_guests: number
          max_nights?: number | null
          min_nights?: number
          pets_allowed?: boolean
          property_id: string
          published_at?: string | null
          rating?: number | null
          reviews?: number
          slug: string
          smoking_allowed?: boolean
          status?: Database["public"]["Enums"]["listing_status"]
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          base_price_minor?: number
          bathrooms?: number | null
          bedrooms?: number | null
          beds?: number | null
          cancel_policy_id?: string | null
          cleaning_fee_minor?: number
          created_at?: string
          currency?: string
          description?: string | null
          events_allowed?: boolean
          id?: string
          instant_book?: boolean
          kind?: Database["public"]["Enums"]["listing_kind"]
          max_guests?: number
          max_nights?: number | null
          min_nights?: number
          pets_allowed?: boolean
          property_id?: string
          published_at?: string | null
          rating?: number | null
          reviews?: number
          slug?: string
          smoking_allowed?: boolean
          status?: Database["public"]["Enums"]["listing_status"]
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_cancel_policy_id_fkey"
            columns: ["cancel_policy_id"]
            isOneToOne: false
            referencedRelation: "cancellation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          asset: string
          booking_id: string
          created_at: string
          facilitator_ref: string | null
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          network: string
          pay_to: string
          payer: string | null
          tx_hash: string | null
        }
        Insert: {
          amount_minor: number
          asset: string
          booking_id: string
          created_at?: string
          facilitator_ref?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          network: string
          pay_to: string
          payer?: string | null
          tx_hash?: string | null
        }
        Update: {
          amount_minor?: number
          asset?: string
          booking_id?: string
          created_at?: string
          facilitator_ref?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          network?: string
          pay_to?: string
          payer?: string | null
          tx_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address_line1: string | null
          business_id: string
          checkin_time: string
          checkout_time: string
          city: string
          country_code: string
          created_at: string
          description: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          postal_code: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          region: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          business_id: string
          checkin_time: string
          checkout_time: string
          city: string
          country_code: string
          created_at?: string
          description?: string | null
          id: string
          latitude?: number | null
          longitude?: number | null
          name: string
          postal_code?: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          region?: string | null
          timezone: string
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          business_id?: string
          checkin_time?: string
          checkout_time?: string
          city?: string
          country_code?: string
          created_at?: string
          description?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          postal_code?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          region?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_rules: {
        Row: {
          end_date: string
          id: string
          listing_id: string
          min_nights: number | null
          name: string
          nightly_price_minor: number
          priority: number
          start_date: string
        }
        Insert: {
          end_date: string
          id: string
          listing_id: string
          min_nights?: number | null
          name: string
          nightly_price_minor: number
          priority?: number
          start_date: string
        }
        Update: {
          end_date?: string
          id?: string
          listing_id?: string
          min_nights?: number | null
          name?: string
          nightly_price_minor?: number
          priority?: number
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_rules_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
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
      book_stay: {
        Args: {
          p_checkin: string
          p_checkout: string
          p_guest_ref?: string
          p_guests: number
          p_listing_slug: string
          p_traveler_id?: string
        }
        Returns: Json
      }
      cancel_booking: {
        Args: {
          p_booking_id: string
          p_guest_ref?: string
          p_traveler_id?: string
        }
        Returns: Json
      }
      confirm_booking_payment: {
        Args: {
          p_amount_minor?: number
          p_asset?: string
          p_booking_id: string
          p_network?: string
          p_pay_to?: string
          p_payer?: string
          p_tx_hash?: string
        }
        Returns: Json
      }
      open_claim: {
        Args: {
          p_booking_id: string
          p_evidence?: Json
          p_guest_ref: string
          p_reason: Database["public"]["Enums"]["claim_reason"]
        }
        Returns: Json
      }
      owns_business: { Args: { p_business_id: string }; Returns: boolean }
      owns_listing: { Args: { p_listing_id: string }; Returns: boolean }
      process_escrow_releases: { Args: never; Returns: Json }
      release_booking: { Args: { p_booking_id: string }; Returns: Json }
      resolve_claim: {
        Args: {
          p_booking_id: string
          p_refund_pct?: number
          p_resolution: Database["public"]["Enums"]["claim_resolution"]
        }
        Returns: Json
      }
    }
    Enums: {
      amenity_category:
        | "general"
        | "cocina"
        | "bano"
        | "exterior"
        | "seguridad"
        | "accesibilidad"
        | "servicios"
      avail_status: "open" | "blocked" | "booked"
      booking_status:
        | "pending_payment"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "refunded"
        | "in_progress"
        | "claim_open"
      business_status: "pending" | "active" | "suspended"
      claim_reason: "no_access" | "not_as_described" | "owner_no_show"
      claim_resolution: "full_refund" | "partial_refund" | "full_release"
      escrow_status:
        | "unfunded"
        | "funded"
        | "partially_released"
        | "released"
        | "refunded"
        | "claimed"
      listing_kind: "entire_place" | "room"
      listing_status: "draft" | "published" | "paused" | "archived"
      payment_kind: "charge" | "service_fee" | "fx_fee" | "release" | "refund"
      property_type:
        | "hotel"
        | "hostel"
        | "cabana"
        | "casa"
        | "apartamento"
        | "glamping"
        | "posada"
        | "finca"
        | "otro"
      unit_status: "active" | "maintenance" | "inactive"
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
    Enums: {
      amenity_category: [
        "general",
        "cocina",
        "bano",
        "exterior",
        "seguridad",
        "accesibilidad",
        "servicios",
      ],
      avail_status: ["open", "blocked", "booked"],
      booking_status: [
        "pending_payment",
        "confirmed",
        "cancelled",
        "completed",
        "refunded",
        "in_progress",
        "claim_open",
      ],
      business_status: ["pending", "active", "suspended"],
      claim_reason: ["no_access", "not_as_described", "owner_no_show"],
      claim_resolution: ["full_refund", "partial_refund", "full_release"],
      escrow_status: [
        "unfunded",
        "funded",
        "partially_released",
        "released",
        "refunded",
        "claimed",
      ],
      listing_kind: ["entire_place", "room"],
      listing_status: ["draft", "published", "paused", "archived"],
      payment_kind: ["charge", "service_fee", "fx_fee", "release", "refund"],
      property_type: [
        "hotel",
        "hostel",
        "cabana",
        "casa",
        "apartamento",
        "glamping",
        "posada",
        "finca",
        "otro",
      ],
      unit_status: ["active", "maintenance", "inactive"],
    },
  },
} as const
