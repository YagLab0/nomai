/**
 * Server-side client for the nomai listings API (apps/api, a Hono server).
 *
 * SERVER ONLY: import this from server components, route handlers and server
 * code. Client components reach the same data through the /api/listings route
 * handlers, which proxy to this origin.
 */

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/** GET /listings/search → results[]. Minor units are 10^-6 of `currency`. */
export interface ApiListingCard {
  slug: string;
  title: string;
  summary?: string;
  /** 'entire_place' | 'room' — the fine-grained type lives in property_type. */
  kind: string;
  /** hotel | hostel | cabana | casa | apartamento | glamping | posada | finca | otro */
  property_type: string;
  city: string;
  region?: string;
  country_code: string;
  cover_photo?: string;
  /** 'USD' or a local fiat: 'ARS'|'BRL'|'CLP'|'COP'|'MXN'|'UYU'. */
  currency: string;
  nightly_minor: number;
  /** e.g. "US$ 70.00" or "$ 95.000". */
  nightly_display: string;
  max_guests: number;
  min_nights: number;
  /** Amenity codes. */
  amenities: string[];
  nights_count?: number;
  total_minor?: number;
  total_display?: string;
  rating: number;
  reviews: number;
  owner_name: string;
  owner_slug: string;
  /** The Owner's recency-weighted storefront score (ADR-0008); null while the
   * business has no Reviews. */
  owner_rating: number | null;
  owner_reviews: number;
}

/** GET /listings/:slug — everything in the card, plus the full detail. */
export interface ApiListingDetail {
  slug: string;
  title: string;
  summary?: string;
  description?: string;
  kind: string;
  status?: string;
  currency: string;
  base_price_minor: number;
  base_price_display: string;
  cleaning_fee_minor: number;
  cleaning_fee_display: string;
  min_nights: number;
  max_nights: number | null;
  max_guests: number;
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
  instant_book: boolean;
  pets_allowed: boolean;
  smoking_allowed: boolean;
  events_allowed: boolean;
  property: {
    name: string;
    property_type: string;
    address_line1?: string;
    city: string;
    region?: string;
    country_code: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    checkin_time?: string;
    checkout_time?: string;
  };
  business: { name: string; slug?: string };
  amenities: { code: string; name: string; detail?: string }[];
  photos: { url: string; alt?: string; is_cover: boolean }[];
  cancellation_policy?: {
    name: string;
    full_refund_days: number;
    partial_refund_pct: number;
    partial_refund_days: number;
  };
  units_available?: number;
  /** Unavailable nights (YYYY-MM-DD) from today on — blocked or sold out. */
  occupied?: string[];
  rating?: number;
  reviews?: number;
  owner_name?: string;
  owner_slug?: string;
}

/** Query params accepted by GET /listings/search — all optional. */
export interface ListingSearchParams {
  city?: string;
  country?: string;
  checkin?: string;
  checkout?: string;
  guests?: number;
  /** property_type or listing kind. */
  type?: string;
  /** Every listed amenity code must be present. */
  amenities?: string[];
  max_price_minor?: number;
}

/**
 * Full catalog when `params` is omitted. Throws on non-2xx and network errors
 * — callers decide their own degradation (error state, fallback, 404).
 */
export async function fetchListings(params?: ListingSearchParams): Promise<ApiListingCard[]> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const v of value) qs.append(key, v);
      } else {
        qs.set(key, String(value));
      }
    }
  }
  const query = qs.toString();
  // no-store: inventory mutates with every Booking, never serve a stale list.
  const res = await fetch(`${API_URL}/listings/search${query ? `?${query}` : ''}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`listings search failed: ${res.status}`);
  const body = (await res.json()) as { results?: ApiListingCard[] };
  return Array.isArray(body?.results) ? body.results : [];
}

/** One listing by slug; null when the API answers 404. */
export async function fetchListing(slug: string): Promise<ApiListingDetail | null> {
  const res = await fetch(`${API_URL}/listings/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`listing detail failed: ${res.status}`);
  return (await res.json()) as ApiListingDetail;
}

export interface ApiQuoteNight {
  night: string;
  price_minor: number;
  price_display: string;
  source: string;
}

export interface ApiQuote {
  listing_slug: string;
  checkin: string;
  checkout: string;
  guests: number;
  nights_count: number;
  nights: ApiQuoteNight[];
  nights_minor: number;
  cleaning_minor: number;
  /** ADR-0005 Service fee — platform revenue line, on top of the rental. */
  service_fee_minor: number;
  /** nights + cleaning + Service fee — what the Traveler actually pays. */
  total_minor: number;
  nights_display: string;
  cleaning_display: string;
  service_fee_display: string;
  total_display: string;
  currency: string;
}

/** Night-by-night quote for a stay; null on error or 404. */
export async function fetchQuote(
  slug: string,
  checkin: string,
  checkout: string,
  guests = 1,
): Promise<ApiQuote | null> {
  const qs = new URLSearchParams({ checkin, checkout, guests: String(guests) });
  const res = await fetch(`${API_URL}/listings/${encodeURIComponent(slug)}/quote?${qs.toString()}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as ApiQuote;
}

// ---------------------------------------------------------------------------
// reviews (ADR-0008) — GET /listings/:slug/reviews
// ---------------------------------------------------------------------------

/** One Review as the API serves it — public shape for to_lodging rows. */
export interface ApiReview {
  review_id: string;
  booking_id: string;
  direction: 'to_lodging' | 'to_traveler';
  /** The writer's public name (first name or Owner business name). */
  author_name: string;
  listing_slug?: string;
  listing_title?: string;
  /** The rated party's display name — the guest on to_traveler rows. */
  subject_name?: string;
  rating: number;
  categories: Record<string, number>;
  body: string | null;
  reply_body: string | null;
  replied_at: string | null;
  created_at: string;
  /** The stay's check-out — the "cuándo se quedó" line. */
  stayed_checkout?: string;
}

/** GET /listings/:slug/reviews → the Lodging's public Reviews + score. */
export interface ApiListingReviews {
  /** Recency-weighted score; null while the Lodging has none. */
  rating: number | null;
  reviews: number;
  /** Average per Lodging category (1 decimal), only keys with data. */
  categories: Record<string, number>;
  items: ApiReview[];
}

/** GET /owners/reviews → the Owner's review feed (ADR-0008). */
export interface ApiOwnerReviews {
  /** Recency-weighted storefront score across the business's Lodgings. */
  score: { rating: number | null; reviews: number };
  /** Reviews guests left on the business's Lodgings, newest first. */
  received: ApiReview[];
  /** Reviews the Owner wrote about Travelers, newest first. */
  given: ApiReview[];
}

/** The Lodging's Reviews; null on 404 or error — the page renders without. */
export async function fetchListingReviews(
  slug: string,
): Promise<ApiListingReviews | null> {
  const res = await fetch(
    `${API_URL}/listings/${encodeURIComponent(slug)}/reviews`,
    { cache: 'no-store' },
  );
  if (res.status === 404 || !res.ok) return null;
  return (await res.json()) as ApiListingReviews;
}
