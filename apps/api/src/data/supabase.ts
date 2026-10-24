// Supabase-backed listings repo — the `supabase` leg of the LISTINGS_DATA_SOURCE
// seam (GitHub issue #12).
//
// It implements the same interface the in-memory mock in repo.ts exposes
// (searchListings / getListingBySlug / quoteStay, plus the booking write path
// issue #13 lands through rpc('book_stay')) so routes, agent tools and the web
// client never change: they keep importing the same names from src/data/index.ts.
//
// Differences from the mock, by design:
//   - rows come from the linked Supabase project (businesses / properties /
//     listings / listing_amenities / listing_photos / listing_units /
//     availability_nights / rate_rules / cancellation_policies).
//   - "only status=published" and "all nights of the range open with
//     units_available > 0" are re-implemented in the queries instead of being
//     applied to arrays.
//   - nightly price resolves availability.price_minor → rate_rule (highest
//     priority wins on overlap) → listing.base_price_minor, same precedence as
//     the mock.

import { createSupabaseAdmin } from "../supabase.js";
import { AMENITY_BY_CODE, AMENITY_BY_ID } from "./catalog.js";
import { isoDay, nightsBetween } from "./availability.js";
import { formatMoney, toBookingDetail, toBookingSummary } from "./repo.js";
import type {
  BookInput,
  BookResult,
  BookingDetailResult,
  BookingOwner,
  BookingRecord,
  BookingSummary,
  ClaimErrorCode,
  ClaimInput,
  ClaimResult,
  CancelErrorCode,
  CancelInput,
  CancelResult,
  DomainError,
  ListingCard,
  ListingDetail,
  Quote,
  QuoteError,
  QuoteErrorCode,
  SearchParams,
} from "./repo.js";
import type {
  AvailabilityNight,
  Booking,
  BookingStatus,
  Business,
  Listing,
  Property,
  RateRule,
} from "./types.js";
import type { Database, Json } from "../database.types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// row types + client
// ---------------------------------------------------------------------------

type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"];
type ListingPhotoRow = Database["public"]["Tables"]["listing_photos"]["Row"];
type ListingAmenityRow = Database["public"]["Tables"]["listing_amenities"]["Row"];
type ListingUnitRow = Database["public"]["Tables"]["listing_units"]["Row"];
type RateRuleRow = Database["public"]["Tables"]["rate_rules"]["Row"];
type AvailNightRow = Database["public"]["Tables"]["availability_nights"]["Row"];
import { SERVICE_FEE_PCT } from "./types.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type NightPriceSource = "availability" | "rate_rule" | "base";

type QuoteOutcome = { ok: true; quote: Quote } | { ok: false; error: QuoteError };

let admin: SupabaseClient<Database> | null = null;

function client(): SupabaseClient<Database> {
  if (!admin) admin = createSupabaseAdmin();
  return admin;
}

// ---------------------------------------------------------------------------
// row mappers — DB columns are nullable where the mock treats a field as
// optional; the API surface keeps those keys absent (JSON drops undefined),
// exactly like the mock does.
// ---------------------------------------------------------------------------

function toListing(row: ListingRow): Listing {
  return {
    id: row.id,
    property_id: row.property_id,
    cancel_policy_id: null,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? undefined,
    description: row.description ?? undefined,
    kind: row.kind,
    max_guests: row.max_guests,
    bedrooms: row.bedrooms ?? undefined,
    beds: row.beds ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    base_price_minor: row.base_price_minor,
    currency: row.currency,
    cleaning_fee_minor: row.cleaning_fee_minor,
    min_nights: row.min_nights,
    max_nights: row.max_nights,
    rating: row.rating ?? 0,
    reviews: row.reviews ?? 0,
    instant_book: row.instant_book,
    pets_allowed: row.pets_allowed,
    smoking_allowed: row.smoking_allowed,
    events_allowed: row.events_allowed,
    status: row.status,
    published_at: row.published_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toProperty(row: PropertyRow): Property {
  return {
    id: row.id,
    business_id: row.business_id,
    name: row.name,
    property_type: row.property_type,
    description: row.description ?? undefined,
    address_line1: row.address_line1 ?? undefined,
    city: row.city,
    region: row.region ?? undefined,
    country_code: row.country_code,
    postal_code: row.postal_code ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    timezone: row.timezone,
    checkin_time: row.checkin_time,
    checkout_time: row.checkout_time,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    legal_name: row.legal_name ?? undefined,
    tax_id: row.tax_id ?? undefined,
    payout_address: row.payout_address ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// The photo shape the API surface emits (card cover + detail gallery) —
// narrower than the ListingPhoto domain type, same as the mock emits.
type PhotoView = { url: string; alt?: string; is_cover: boolean };

function toPhoto(row: ListingPhotoRow): PhotoView {
  return {
    url: row.url,
    alt: row.alt_text ?? undefined,
    is_cover: row.is_cover,
  };
}

// ---------------------------------------------------------------------------
// fetchers — one query per concern, admin client (bypasses RLS).
// ---------------------------------------------------------------------------

async function fetchPublishedListings(): Promise<Listing[]> {
  const { data, error } = await client()
    .from("listings")
    .select("*")
    .eq("status", "published");
  if (error) throw error;
  const rows = (data ?? []) as ListingRow[];
  return rows.map(toListing);
}

async function fetchListingBySlug(slug: string): Promise<Listing | null> {
  const { data, error } = await client()
    .from("listings")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published");
  if (error) throw error;
  const rows = (data ?? []) as ListingRow[];
  return rows[0] ? toListing(rows[0]) : null;
}

async function fetchPropertyById(id: string): Promise<Property | null> {
  const { data, error } = await client()
    .from("properties")
    .select("*")
    .eq("id", id);
  if (error) throw error;
  const rows = (data ?? []) as PropertyRow[];
  return rows[0] ? toProperty(rows[0]) : null;
}

async function fetchPropertiesByIds(
  ids: string[]
): Promise<Map<string, Property>> {
  const map = new Map<string, Property>();
  if (ids.length === 0) return map;
  const { data, error } = await client()
    .from("properties")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  for (const row of (data ?? []) as PropertyRow[]) map.set(row.id, toProperty(row));
  return map;
}

async function fetchBusinessesByIds(
  ids: string[]
): Promise<Map<string, Business>> {
  const map = new Map<string, Business>();
  if (ids.length === 0) return map;
  const { data, error } = await client()
    .from("businesses")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  for (const row of (data ?? []) as BusinessRow[]) map.set(row.id, toBusiness(row));
  return map;
}

async function fetchListingPhotosByIds(
  ids: string[]
): Promise<Map<string, PhotoView[]>> {
  const map = new Map<string, PhotoView[]>();
  if (ids.length === 0) return map;
  const { data, error } = await client()
    .from("listing_photos")
    .select("*")
    .in("listing_id", ids)
    .order("position", { ascending: true });
  if (error) throw error;
  for (const row of (data ?? []) as ListingPhotoRow[]) {
    const list = map.get(row.listing_id) ?? [];
    list.push(toPhoto(row));
    map.set(row.listing_id, list);
  }
  return map;
}

async function fetchListingAmenitiesByIds(
  ids: string[]
): Promise<
  Map<
    string,
    { amenity_id: string; code: string; name: string; detail?: string }[]
  >
> {
  const map = new Map<
    string,
    { amenity_id: string; code: string; name: string; detail?: string }[]
  >();
  if (ids.length === 0) return map;
  const { data, error } = await client()
    .from("listing_amenities")
    .select("listing_id, amenity_id, detail")
    .in("listing_id", ids);
  if (error) throw error;
  const byListing = new Map<string, ListingAmenityRow[]>();
  for (const row of (data ?? []) as ListingAmenityRow[]) {
    const list = byListing.get(row.listing_id) ?? [];
    list.push(row);
    byListing.set(row.listing_id, list);
  }
  for (const [listingId, rows] of byListing) {
    map.set(
      listingId,
      rows
        .map((r) => {
          const a = AMENITY_BY_ID.get(r.amenity_id);
          return a
            ? {
                amenity_id: a.id,
                code: a.code,
                name: a.name,
                detail: r.detail ?? undefined,
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    );
  }
  return map;
}

async function fetchRateRules(listingId: string): Promise<RateRule[]> {
  const { data, error } = await client()
    .from("rate_rules")
    .select("*")
    .eq("listing_id", listingId);
  if (error) throw error;
  const rows = (data ?? []) as RateRuleRow[];
  return rows.map((r) => ({
    id: r.id,
    listing_id: r.listing_id,
    name: r.name,
    start_date: r.start_date,
    end_date: r.end_date,
    nightly_price_minor: r.nightly_price_minor,
    min_nights: r.min_nights ?? undefined,
    priority: r.priority,
  }));
}

async function fetchOpenNights(
  listingId: string,
  nights: string[]
): Promise<Map<string, AvailabilityNight>> {
  const map = new Map<string, AvailabilityNight>();
  if (nights.length === 0) return map;
  const { data, error } = await client()
    .from("availability_nights")
    .select("*")
    .eq("listing_id", listingId)
    .in("night", nights);
  if (error) throw error;
  for (const row of (data ?? []) as AvailNightRow[]) {
    map.set(row.night, {
      listing_id: row.listing_id,
      night: row.night,
      status: row.status,
      units_available: row.units_available,
      price_minor: row.price_minor,
    });
  }
  return map;
}

async function fetchUnitsAvailable(listingId: string): Promise<number> {
  const { data, error } = await client()
    .from("listing_units")
    .select("id")
    .eq("listing_id", listingId)
    .eq("status", "active");
  if (error) throw error;
  const rows = (data ?? []) as ListingUnitRow[];
  return rows.length;
}

/** Unavailable nights from today on — blocked, booked or out of units. */
async function fetchOccupiedNights(listingId: string): Promise<string[]> {
  const { data, error } = await client()
    .from("availability_nights")
    .select("night")
    .eq("listing_id", listingId)
    .gte("night", isoDay(new Date()))
    .or("status.neq.open,units_available.lt.1")
    .order("night", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.night);
}

/** ADR-0006: one global rule — full refund until 5 days before check-in, 50% after. */
const GLOBAL_POLICY = {
  name: "nomai-global-5d",
  full_refund_days: 5,
  partial_refund_pct: 50,
  partial_refund_days: 0,
};

// ---------------------------------------------------------------------------
// quoting — same precedence + same errors as the mock: availability → rate_rule
// (highest priority wins on overlap) → base price.
// ---------------------------------------------------------------------------

async function quoteListing(
  listing: Listing,
  checkin: string,
  checkout: string,
  guests: number,
  rateRules: RateRule[]
): Promise<QuoteOutcome> {
  const fail = (code: QuoteErrorCode, message: string): QuoteOutcome => ({
    ok: false,
    error: { code, message },
  });

  if (!DATE_RE.test(checkin) || !DATE_RE.test(checkout))
    return fail("invalid_dates", "checkin/checkout must be YYYY-MM-DD");
  const nights = nightsBetween(checkin, checkout);
  if (nights.length === 0)
    return fail("invalid_dates", "checkout must be after checkin");
  if (nights.length < listing.min_nights)
    return fail(
      "min_nights",
      `this listing requires at least ${listing.min_nights} nights`
    );
  if (listing.max_nights != null && nights.length > listing.max_nights)
    return fail(
      "max_nights",
      `this listing allows at most ${listing.max_nights} nights`
    );
  if (guests < 1 || guests > listing.max_guests)
    return fail(
      "max_guests",
      `this listing hosts at most ${listing.max_guests} guests`
    );

  // Rate rules may impose their own minimum stay.
  const ruleMin = Math.max(
    0,
    ...rateRules
      .filter(
        (r) =>
          r.listing_id === listing.id &&
          r.min_nights != null &&
          r.start_date < checkout &&
          checkin <= r.end_date
      )
      .map((r) => r.min_nights ?? 0)
  );
  if (ruleMin > nights.length)
    return fail(
      "min_nights",
      `season pricing requires at least ${ruleMin} nights for these dates`
    );

  const openNights = await fetchOpenNights(listing.id, nights);
  const quoteNights: Quote["nights"] = [];
  for (const night of nights) {
    const row = openNights.get(night);
    if (!row || row.status !== "open" || row.units_available < 1)
      return fail("unavailable", `no availability on ${night}`);
    const rule = rateRules
      .filter(
        (r) => r.listing_id === listing.id && r.start_date <= night && night <= r.end_date
      )
      .sort((a, b) => b.priority - a.priority)[0];
    const price_minor =
      row.price_minor ?? rule?.nightly_price_minor ?? listing.base_price_minor;
    const source: NightPriceSource =
      row.price_minor != null ? "availability" : rule ? "rate_rule" : "base";
    quoteNights.push({
      night,
      price_minor,
      price_display: formatMoney(price_minor, listing.currency),
      source,
    });
  }

  const nights_minor = quoteNights.reduce((s, n) => s + n.price_minor, 0);
  const rental_minor = nights_minor + listing.cleaning_fee_minor;
  const service_fee_minor = Math.round((rental_minor * SERVICE_FEE_PCT) / 100);
  const total_minor = rental_minor + service_fee_minor;
  return {
    ok: true,
    quote: {
      listing_slug: listing.slug,
      checkin,
      checkout,
      guests,
      nights_count: quoteNights.length,
      nights: quoteNights,
      nights_minor,
      cleaning_minor: listing.cleaning_fee_minor,
      service_fee_minor,
      total_minor,
      nights_display: formatMoney(nights_minor, listing.currency),
      cleaning_display: formatMoney(
        listing.cleaning_fee_minor,
        listing.currency
      ),
      service_fee_display: formatMoney(service_fee_minor, listing.currency),
      total_display: formatMoney(total_minor, listing.currency),
      currency: listing.currency,
    },
  };
}

// ---------------------------------------------------------------------------
// public interface — mirrors repo.ts exactly.
// ---------------------------------------------------------------------------

export async function quoteStay(
  slug: string,
  checkin: string,
  checkout: string,
  guests: number
): Promise<{ ok: true; quote: Quote } | { ok: false; error: DomainError }> {
  const listing = await fetchListingBySlug(slug);
  if (!listing || listing.status !== "published") {
    return { ok: false, error: { code: "not_found", message: "listing not found" } };
  }
  const qr = await quoteListing(
    listing,
    checkin,
    checkout,
    guests,
    await fetchRateRules(listing.id)
  );
  if (!qr.ok) return { ok: false, error: qr.error };
  return { ok: true, quote: qr.quote };
}

export async function getListingBySlug(slug: string): Promise<ListingDetail | null> {
  const listing = await fetchListingBySlug(slug);
  if (!listing || listing.status !== "published") return null;
  const property = await fetchPropertyById(listing.property_id);
  const business = property
    ? await fetchBusinessesByIds([property.business_id]).then(
        (m) => m.get(property.business_id) ?? null
      )
    : null;
  if (!property || !business) return null;
  const policy = GLOBAL_POLICY;

  const amenities = (
    await fetchListingAmenitiesByIds([listing.id]).then(
      (m) => m.get(listing.id) ?? []
    )
  ).map((a) => ({ code: a.code, name: a.name, detail: a.detail }));
  const photos = (await fetchListingPhotosByIds([listing.id]).then(
    (m) => m.get(listing.id) ?? []
  ));
  const unitsAvailable = await fetchUnitsAvailable(listing.id);
  const occupied = await fetchOccupiedNights(listing.id);

  return {
    slug: listing.slug,
    title: listing.title,
    summary: listing.summary,
    description: listing.description,
    kind: listing.kind,
    status: listing.status,
    currency: listing.currency,
    base_price_minor: listing.base_price_minor,
    base_price_display: formatMoney(listing.base_price_minor, listing.currency),
    cleaning_fee_minor: listing.cleaning_fee_minor,
    cleaning_fee_display: formatMoney(listing.cleaning_fee_minor, listing.currency),
    min_nights: listing.min_nights,
    max_nights: listing.max_nights,
    max_guests: listing.max_guests,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    bathrooms: listing.bathrooms,
    rating: listing.rating,
    reviews: listing.reviews,
    owner_name: business.name,
    owner_slug: business.slug,
    instant_book: listing.instant_book,
    pets_allowed: listing.pets_allowed,
    smoking_allowed: listing.smoking_allowed,
    events_allowed: listing.events_allowed,
    property: {
      name: property.name,
      property_type: property.property_type,
      address_line1: property.address_line1,
      city: property.city,
      region: property.region,
      country_code: property.country_code,
      timezone: property.timezone,
      checkin_time: property.checkin_time,
      checkout_time: property.checkout_time,
    },
    business: { name: business.name, slug: business.slug },
    amenities,
    photos,
    cancellation_policy: policy
      ? {
          name: policy.name,
          full_refund_days: policy.full_refund_days,
          partial_refund_pct: policy.partial_refund_pct,
          partial_refund_days: policy.partial_refund_days,
        }
      : undefined,
    units_available: unitsAvailable,
    occupied,
  };
}

/** The Owner's wallet for a listing — the x402 `payTo` for a Booking. */
export async function getListingPayTo(slug: string): Promise<string | null> {
  const { data, error } = await client()
    .from("listings")
    .select("properties(businesses(payout_address))")
    .eq("slug", slug)
    .eq("status", "published")
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as
    | {
        properties: {
          businesses: { payout_address: string | null } | null;
        } | null;
      }
    | undefined;
  return row?.properties?.businesses?.payout_address ?? null;
}

export async function searchListings(
  params: SearchParams
): Promise<ListingCard[]> {
  const hasDates =
    params.checkin != null &&
    params.checkout != null &&
    DATE_RE.test(params.checkin) &&
    DATE_RE.test(params.checkout);

  const wantedAmenities = (params.amenities ?? [])
    .map((code) => AMENITY_BY_CODE.get(code)?.id)
    .filter((id): id is string => id != null);

  const listings = await fetchPublishedListings();
  const propertyById = await fetchPropertiesByIds(
    listings.map((l) => l.property_id)
  );
  const photosByListing = await fetchListingPhotosByIds(
    listings.map((l) => l.id)
  );
  const amenitiesByListing = await fetchListingAmenitiesByIds(
    listings.map((l) => l.id)
  );
  const businessById = await fetchBusinessesByIds(
    [
      ...new Set(
        listings
          .map((l) => propertyById.get(l.property_id)?.business_id)
          .filter((id): id is string => id != null)
      ),
    ]
  );
  const rateCache = new Map<string, RateRule[]>();

  const cards: ListingCard[] = [];
  for (const listing of listings) {
    const property = propertyById.get(listing.property_id);
    if (!property) continue;

    if (params.city && !norm(property.city).includes(norm(params.city)))
      continue;
    if (params.country) {
      const c = norm(params.country);
      const code = COUNTRY_NAME[c] ?? params.country.toUpperCase();
      if (property.country_code !== code) continue;
    }
    if (params.guests != null && listing.max_guests < params.guests) continue;
    if (
      params.type &&
      property.property_type !== params.type &&
      listing.kind !== params.type
    )
      continue;
    if (wantedAmenities.length) {
      const have = new Set(
        (amenitiesByListing.get(listing.id) ?? []).map((a) => a.amenity_id)
      );
      if (!wantedAmenities.every((id) => have.has(id))) continue;
    }

    const amenities = amenitiesByListing.get(listing.id) ?? [];
    const cover = (photosByListing.get(listing.id) ?? []).find(
      (p) => p.is_cover
    );
    const owner = property ? businessById.get(property.business_id) : undefined;

    const card: ListingCard = {
      slug: listing.slug,
      title: listing.title,
      summary: listing.summary,
      kind: listing.kind,
      property_type: property.property_type,
      city: property.city,
      region: property.region,
      country_code: property.country_code,
      cover_photo: cover?.url,
      currency: listing.currency,
      nightly_minor: listing.base_price_minor,
      nightly_display: formatMoney(listing.base_price_minor, listing.currency),
      max_guests: listing.max_guests,
      min_nights: listing.min_nights,
      rating: listing.rating,
      reviews: listing.reviews,
      owner_name: owner?.name ?? "",
      owner_slug: owner?.slug ?? "",
      amenities: amenities.map((a) => a.code),
    };

    if (hasDates && params.checkin != null && params.checkout != null) {
      const rateRules =
        rateCache.get(listing.id) ?? (await fetchRateRules(listing.id));
      rateCache.set(listing.id, rateRules);
      const qr = await quoteListing(
        listing,
        params.checkin,
        params.checkout,
        params.guests ?? 1,
        rateRules
      );
      if (!qr.ok) continue; // closed for those dates / violates stay rules
      card.nights_count = qr.quote.nights_count;
      card.total_minor = qr.quote.total_minor;
      card.total_display = qr.quote.total_display;
      card.nightly_minor = Math.round(qr.quote.nights_minor / qr.quote.nights_count);
      card.nightly_display = formatMoney(card.nightly_minor, listing.currency);
    }

    if (
      params.max_price_minor != null &&
      card.nightly_minor > params.max_price_minor
    )
      continue;

    cards.push(card);
  }

  return cards.sort((a, b) => a.nightly_minor - b.nightly_minor);
}

// ---------------------------------------------------------------------------
// booking — write-through via the book_stay Postgres function (issue #13).
// It revalidates the stay, inserts the bookings row and consumes one unit per
// night in a single transaction; *_display strings are added here, same as
// the mock's bookListing emits.
// ---------------------------------------------------------------------------

interface BookStayQuotePayload {
  listing_slug: string;
  checkin: string;
  checkout: string;
  guests: number;
  nights_count: number;
  nights: { night: string; price_minor: number; source: NightPriceSource }[];
  nights_minor: number;
  cleaning_minor: number;
  total_minor: number;
  currency: string;
}

type BookStayPayload =
  | {
      ok: true;
      booking: {
        id: string;
        listing_id: string;
        guest_ref: string | null;
        checkin: string;
        checkout: string;
        guests: number;
        total_minor: number;
        status: string;
        created_at: string;
      };
      quote: BookStayQuotePayload;
    }
  | { ok: false; error: DomainError };

export async function bookListing(
  slug: string,
  input: BookInput
): Promise<BookResult> {
  const { data, error } = await client().rpc("book_stay", {
    p_listing_slug: slug,
    p_checkin: input.checkin,
    p_checkout: input.checkout,
    p_guests: input.guests,
    p_guest_ref: input.guest_ref,
  });
  if (error) throw error;
  const r = data as unknown as BookStayPayload;
  if (!r.ok) return { ok: false, error: r.error };

  const currency = r.quote.currency;
  const quote: Quote = {
    listing_slug: r.quote.listing_slug,
    checkin: r.quote.checkin,
    checkout: r.quote.checkout,
    guests: r.quote.guests,
    nights_count: r.quote.nights_count,
    nights: r.quote.nights.map((n) => ({
      night: n.night,
      price_minor: n.price_minor,
      price_display: formatMoney(n.price_minor, currency),
      source: n.source,
    })),
    nights_minor: r.quote.nights_minor,
    cleaning_minor: r.quote.cleaning_minor,
    // The RPC's quote is rental-only; the stored row carries the Service fee
    // (apply_service_fee trigger) — the delta IS the fee line.
    service_fee_minor: r.booking.total_minor - r.quote.total_minor,
    total_minor: r.booking.total_minor,
    nights_display: formatMoney(r.quote.nights_minor, currency),
    cleaning_display: formatMoney(r.quote.cleaning_minor, currency),
    service_fee_display: formatMoney(
      r.booking.total_minor - r.quote.total_minor,
      currency
    ),
    total_display: formatMoney(r.booking.total_minor, currency),
    currency,
  };
  const booking: Booking = {
    id: r.booking.id,
    listing_id: r.booking.listing_id,
    guest_ref: r.booking.guest_ref ?? undefined,
    checkin: r.booking.checkin,
    checkout: r.booking.checkout,
    guests: r.booking.guests,
    total_minor: r.booking.total_minor,
    status: r.booking.status as BookingStatus,
    created_at: r.booking.created_at,
  };
  return { ok: true, booking, quote };
}

export async function getBookingById(
  id: string
): Promise<Booking | undefined> {
  const { data, error } = await client()
    .from("bookings")
    .select("*")
    .eq("id", id)
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return undefined;
  return {
    id: row.id,
    listing_id: row.listing_id,
    guest_ref: row.guest_ref ?? undefined,
    checkin: row.checkin,
    checkout: row.checkout,
    guests: row.guests,
    total_minor: row.total_minor,
    status: row.status,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// cancellation — write-through via cancel_booking() (issue #18, ADR-0004).
// The function checks ownership (guest_ref / traveler_id), the confirmed-only
// rule, resolves the cancellation policy (listing's own, else the platform
// default), flips the booking + releases the nights and records the refund
// intent in payments — one transaction. *_display strings are added here.
// ---------------------------------------------------------------------------

type CancelStayPayload =
  | {
      ok: true;
      booking_id: string;
      status: string;
      checkin: string;
      checkout: string;
      currency: string;
      total_minor: number;
      days_until_checkin: number;
      policy_name: string;
      refund_pct: number;
      refund_minor: number;
      refund_payment_id: string | null;
    }
  | { ok: false; error: { code: CancelErrorCode; message: string } };

export async function cancelBooking(
  id: string,
  input: CancelInput
): Promise<CancelResult> {
  const { data, error } = await client().rpc("cancel_booking", {
    p_booking_id: id,
    p_guest_ref: input.guest_ref,
    p_traveler_id: input.traveler_id,
  });
  if (error) throw error;
  const r = data as unknown as CancelStayPayload;
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    cancellation: {
      booking_id: r.booking_id,
      status: "cancelled",
      checkin: r.checkin,
      checkout: r.checkout,
      currency: r.currency,
      total_minor: r.total_minor,
      days_until_checkin: r.days_until_checkin,
      policy_name: r.policy_name,
      refund_pct: r.refund_pct,
      refund_minor: r.refund_minor,
      refund_display: formatMoney(r.refund_minor, r.currency),
      refund_payment_id: r.refund_payment_id ?? undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// booking reads + Claims (ADR-0006). Reads are plain selects joined to the
// listing slug; the Claim goes through open_claim(), with ownership checked
// here first — the original open_claim's `guest_ref <> x and traveler_id::text
// <> x` let NULLs through (fixed in 20261024150000); the API keeps its own
// null-safe check so a stale DB function can't be exploited.
// ---------------------------------------------------------------------------

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type BookingWithSlug = BookingRow & { listings: { slug: string } | null };

const BOOKING_SELECT = "*, listings(slug)";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toRecord(row: BookingWithSlug): BookingRecord {
  return {
    id: row.id,
    listing_slug: row.listings?.slug ?? "",
    status: row.status,
    escrow_status: row.escrow_status,
    checkin: row.checkin,
    checkout: row.checkout,
    guests: row.guests,
    total_minor: row.total_minor,
    currency: row.currency,
    created_at: row.created_at,
    cancel_deadline: row.cancel_deadline,
    first_release_at: row.first_release_at,
    final_release_at: row.final_release_at,
    claim_reason: row.claim_reason,
    claim_resolution: row.claim_resolution,
  };
}

function owns(row: BookingRow, owner: BookingOwner): boolean {
  return (
    (owner.guest_ref != null && row.guest_ref === owner.guest_ref) ||
    (owner.traveler_id != null && row.traveler_id === owner.traveler_id)
  );
}

async function fetchBookingRow(id: string): Promise<BookingWithSlug | null> {
  const { data, error } = await client()
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", id)
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as unknown as BookingWithSlug | undefined) ?? null;
}

export async function listBookings(
  owner: BookingOwner
): Promise<BookingSummary[]> {
  // traveler_id is a uuid column — a malformed one would be a 22P02, not a miss.
  if (owner.traveler_id != null && !UUID_RE.test(owner.traveler_id)) return [];
  if (owner.guest_ref == null && owner.traveler_id == null) return [];
  let q = client()
    .from("bookings")
    .select(BOOKING_SELECT)
    .order("created_at", { ascending: false });
  if (owner.guest_ref != null) q = q.eq("guest_ref", owner.guest_ref);
  if (owner.traveler_id != null) q = q.eq("traveler_id", owner.traveler_id);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as BookingWithSlug[]).map((r) =>
    toBookingSummary(toRecord(r))
  );
}

export async function getBookingDetail(
  id: string,
  owner?: BookingOwner
): Promise<BookingDetailResult> {
  const row = await fetchBookingRow(id);
  if (!row)
    return { ok: false, error: { code: "not_found", message: "booking not found" } };
  if (owner && (owner.guest_ref != null || owner.traveler_id != null) && !owns(row, owner))
    return { ok: false, error: { code: "forbidden", message: "not your booking" } };
  return { ok: true, booking: toBookingDetail(toRecord(row)) };
}

type OpenClaimPayload =
  | { ok: true; booking_id: string; status: "claim_open" }
  | { ok: false; error: { code: ClaimErrorCode; message: string } };

export async function openClaim(
  id: string,
  input: ClaimInput
): Promise<ClaimResult> {
  const row = await fetchBookingRow(id);
  if (!row)
    return { ok: false, error: { code: "not_found", message: "booking not found" } };
  if (!owns(row, input))
    return { ok: false, error: { code: "forbidden", message: "not your booking" } };

  // open_claim takes one ref and matches it against guest_ref OR traveler_id —
  // hand it whichever credential actually matched above.
  const ref =
    input.guest_ref != null && row.guest_ref === input.guest_ref
      ? input.guest_ref
      : (input.traveler_id as string);
  const { data, error } = await client().rpc("open_claim", {
    p_booking_id: id,
    p_guest_ref: ref,
    p_reason: input.reason,
    p_evidence: (input.evidence ?? {}) as Json,
  });
  if (error) throw error;
  const r = data as unknown as OpenClaimPayload;
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, claim: { booking_id: r.booking_id, status: "claim_open" } };
}

// ---------------------------------------------------------------------------
// search helpers — copied from the mock repo (city norm, country codes) so the
// supabase backend filters exactly like the in-memory one.
// ---------------------------------------------------------------------------

const COUNTRY_NAME: Record<string, string> = {
  argentina: "AR",
  brasil: "BR",
  brazil: "BR",
  peru: "PE",
  colombia: "CO",
  mexico: "MX",
  chile: "CL",
  uruguay: "UY",
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
