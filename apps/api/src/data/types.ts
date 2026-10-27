// Domain types for the publications mock — field-for-field mirror of
// docs/modelo-datos-publicaciones so a future Supabase migration is a
// straight row copy. IDs are mock UUIDs (readable, stable across restarts).
//
// Money convention: `*_minor` fields are integers in the settlement asset's
// smallest unit. Every mock listing settles in USDC, so USD minor = 10^-6
// (per the model doc: "USDC tiene 6 decimales"). wFIAT-priced listings
// (BRL → wBRL at 10^-18) arrive with the corridor phase and need string
// amounts — out of scope for the agent-only phase.

export type BusinessStatus = "pending" | "active" | "suspended";
export type PropertyType =
  | "hotel"
  | "hostel"
  | "cabana"
  | "casa"
  | "apartamento"
  | "glamping"
  | "posada"
  | "finca"
  | "otro";
export type ListingKind = "entire_place" | "room";
export type ListingStatus = "draft" | "published" | "paused" | "archived";
export type UnitStatus = "active" | "maintenance" | "inactive";
export type AvailStatus = "open" | "blocked" | "booked";
export type AmenityCategory =
  | "general"
  | "cocina"
  | "bano"
  | "exterior"
  | "seguridad"
  | "accesibilidad"
  | "servicios";
export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "in_progress"
  | "claim_open"
  | "cancelled"
  | "completed"
  | "refunded";
/** ADR-0006 Escrow lifecycle — mirrors the escrow_status enum in Postgres. */
export type EscrowStatus =
  | "unfunded"
  | "funded"
  | "partially_released"
  | "released"
  | "refunded"
  | "claimed";
export const CLAIM_REASONS = [
  "no_access",
  "not_as_described",
  "owner_no_show",
] as const;
export type ClaimReason = (typeof CLAIM_REASONS)[number];
export type ClaimResolution = "full_refund" | "partial_refund" | "full_release";

export interface Business {
  id: string;
  name: string;
  /** Public handle — for migrated hosts it is the Owner's slug in the web catalog. */
  slug: string;
  legal_name?: string;
  tax_id?: string;
  /** The Booking's x402 payTo — the Owner's own wallet. Platform never holds funds. */
  payout_address?: string;
  email?: string;
  phone?: string;
  status: BusinessStatus;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  business_id: string;
  name: string;
  property_type: PropertyType;
  description?: string;
  address_line1?: string;
  city: string;
  region?: string;
  country_code: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  timezone: string;
  checkin_time: string;
  checkout_time: string;
  created_at: string;
  updated_at: string;
}

export interface CancellationPolicy {
  id: string;
  business_id: string | null; // null = platform default
  name: string;
  full_refund_days: number;
  partial_refund_pct: number;
  partial_refund_days: number;
}

/** ADR-0006: one global rule — full refund until 5 days before check-in, 50% after. */
export const GLOBAL_CANCELLATION_POLICY = {
  name: "Global · hasta 5 días antes",
  full_refund_days: 5,
  partial_refund_pct: 50,
  partial_refund_days: 0,
} as const;

export interface Listing {
  id: string;
  property_id: string;
  cancel_policy_id: string | null;
  slug: string; // stable public identifier
  title: string;
  summary?: string;
  description?: string;
  kind: ListingKind;
  max_guests: number;
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
  base_price_minor: number;
  currency: string;
  cleaning_fee_minor: number;
  min_nights: number;
  max_nights: number | null;
  /** Traveler-facing score, 0–5 (migrated from the web catalog's `rating`). */
  rating: number;
  /** Published review count (web `reviews`). */
  reviews: number;
  instant_book: boolean;
  pets_allowed: boolean;
  smoking_allowed: boolean;
  events_allowed: boolean;
  status: ListingStatus;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Amenity {
  id: string;
  code: string;
  name: string;
  category: AmenityCategory;
}

export interface ListingAmenity {
  listing_id: string;
  amenity_id: string;
  detail?: string;
}

export interface ListingPhoto {
  id: string;
  listing_id: string;
  url: string;
  alt_text?: string;
  position: number;
  is_cover: boolean;
}

export interface ListingUnit {
  id: string;
  listing_id: string;
  code: string;
  status: UnitStatus;
}

export interface RateRule {
  id: string;
  listing_id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  nightly_price_minor: number;
  min_nights?: number;
  priority: number; // higher wins on overlap
}

export interface AvailabilityNight {
  listing_id: string;
  night: string; // YYYY-MM-DD — "noches", not "días": checkin .. checkout-1
  status: AvailStatus;
  units_available: number;
  price_minor: number | null; // null → resolve via rate_rule → base_price
}

export interface Booking {
  id: string;
  listing_id: string;
  guest_ref?: string;
  checkin: string;
  checkout: string;
  guests: number;
  total_minor: number;
  status: BookingStatus;
  created_at: string;
  // Escrow + Claim state (ADR-0006). The mock store fills these in memory;
  // the supabase leg reads them straight off the bookings row.
  escrow_status?: EscrowStatus;
  cancel_deadline?: string | null;
  first_release_at?: string | null;
  final_release_at?: string | null;
  claim_reason?: ClaimReason | null;
  claim_resolution?: ClaimResolution | null;
  claim_evidence?: unknown;
}
