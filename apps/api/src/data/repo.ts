import { AMENITY_BY_CODE, AMENITY_BY_ID, CANCELLATION_POLICIES } from "./catalog.js";
import {
  addDays,
  buildAvailability,
  isoDay,
  nightsBetween,
} from "./availability.js";
import { GLOBAL_CANCELLATION_POLICY } from "./types.js";
import { resolvePhotoUrl } from "./photo-url.js";
import { serviceFeePctSnapshot } from "./service-fee.js";
import {
  BUSINESSES,
  LISTING_AMENITIES,
  LISTING_PHOTOS,
  LISTING_UNITS,
  LISTINGS,
  PROPERTIES,
  RATE_RULES,
} from "./inventory.js";
import type {
  AvailabilityNight,
  Booking,
  BookingStatus,
  ClaimReason,
  ClaimResolution,
  EscrowStatus,
  Listing,
} from "./types.js";

// ---------------------------------------------------------------------------
// In-memory store. Everything the HTTP layer touches goes through this repo —
// the day the mock becomes Supabase, only this file changes.
// ---------------------------------------------------------------------------

const availability = buildAvailability(new Date());
const nightIndex = new Map<string, AvailabilityNight>();
for (const n of availability) nightIndex.set(`${n.listing_id}|${n.night}`, n);

const bookings: Booking[] = [];
let bookingSeq = 0;

const LISTING_BY_SLUG = new Map(LISTINGS.map((l) => [l.slug, l]));
const PROPERTY_BY_ID = new Map(PROPERTIES.map((p) => [p.id, p]));
const BUSINESS_BY_ID = new Map(BUSINESSES.map((b) => [b.id, b]));
const POLICY_BY_ID = new Map(CANCELLATION_POLICIES.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// money — minor units are 10^-6 of the display currency (USDC-style, per the
// model doc). display formatting lives here so endpoints and tools agree.
// USD/PEN keep the original en-US + cents style; the LATAM fiats migrated
// from the web catalog display like the front did: web symbol + es-AR
// grouping, no decimals ("$ 95.000", "R$ 350", "MX$ 780", "$U 4.200").
// ---------------------------------------------------------------------------

const CURRENCY_DISPLAY: Record<
  string,
  { symbol: string; decimals: number; locale: string }
> = {
  USD: { symbol: "US$", decimals: 2, locale: "en-US" },
  PEN: { symbol: "S/", decimals: 2, locale: "en-US" },
  ARS: { symbol: "$", decimals: 0, locale: "es-AR" },
  BRL: { symbol: "R$", decimals: 0, locale: "es-AR" },
  CLP: { symbol: "$", decimals: 0, locale: "es-AR" },
  COP: { symbol: "$", decimals: 0, locale: "es-AR" },
  MXN: { symbol: "MX$", decimals: 0, locale: "es-AR" },
  UYU: { symbol: "$U", decimals: 0, locale: "es-AR" },
};

export function formatMoney(minor: number, currency: string): string {
  const amount = minor / 1_000_000;
  const display = CURRENCY_DISPLAY[currency];
  if (!display) {
    return `${currency} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${display.symbol} ${amount.toLocaleString(display.locale, {
    minimumFractionDigits: display.decimals,
    maximumFractionDigits: display.decimals,
  })}`;
}

// ---------------------------------------------------------------------------
// quoting
// ---------------------------------------------------------------------------

type NightPriceSource = "availability" | "rate_rule" | "base";

function nightlyPrice(
  listing: Listing,
  night: AvailabilityNight
): { price_minor: number; source: NightPriceSource } {
  if (night.price_minor != null)
    return { price_minor: night.price_minor, source: "availability" };
  const rule = RATE_RULES.filter(
    (r) =>
      r.listing_id === listing.id &&
      r.start_date <= night.night &&
      night.night <= r.end_date
  ).sort((a, b) => b.priority - a.priority)[0];
  if (rule)
    return { price_minor: rule.nightly_price_minor, source: "rate_rule" };
  return { price_minor: listing.base_price_minor, source: "base" };
}

export interface QuoteNight {
  night: string;
  price_minor: number;
  price_display: string;
  source: NightPriceSource;
}

export interface Quote {
  listing_slug: string;
  checkin: string;
  checkout: string;
  guests: number;
  nights_count: number;
  nights: QuoteNight[];
  nights_minor: number;
  cleaning_minor: number;
  /** ADR-0005 Service fee — platform revenue line, on top of the rental. */
  service_fee_minor: number;
  /** nights + cleaning + service fee — what the Traveler actually pays. */
  total_minor: number;
  nights_display: string;
  cleaning_display: string;
  service_fee_display: string;
  total_display: string;
  currency: string;
}

export type QuoteErrorCode =
  | "invalid_dates"
  | "min_nights"
  | "max_nights"
  | "max_guests"
  | "unavailable";

export type DomainErrorCode = QuoteErrorCode | "not_found";

export interface DomainError {
  code: DomainErrorCode;
  message: string;
}

export interface QuoteError {
  code: QuoteErrorCode;
  message: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function quoteResult(
  listing: Listing,
  checkin: string,
  checkout: string,
  guests: number
): { ok: true; quote: Quote } | { ok: false; error: QuoteError } {
  const fail = (code: QuoteErrorCode, message: string) =>
    ({ ok: false as const, error: { code, message } });

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
    ...RATE_RULES.filter(
      (r) =>
        r.listing_id === listing.id &&
        r.min_nights != null &&
        r.start_date < checkout &&
        checkin <= r.end_date
    ).map((r) => r.min_nights ?? 0)
  );
  if (ruleMin > nights.length)
    return fail(
      "min_nights",
      `season pricing requires at least ${ruleMin} nights for these dates`
    );

  const quoteNights: QuoteNight[] = [];
  for (const night of nights) {
    const row = nightIndex.get(`${listing.id}|${night}`);
    if (!row || row.status !== "open" || row.units_available < 1)
      return fail("unavailable", `no availability on ${night}`);
    const { price_minor, source } = nightlyPrice(listing, row);
    quoteNights.push({
      night,
      price_minor,
      price_display: formatMoney(price_minor, listing.currency),
      source,
    });
  }

  const nights_minor = quoteNights.reduce((s, n) => s + n.price_minor, 0);
  const rental_minor = nights_minor + listing.cleaning_fee_minor;
  // Service fee single source is platform_settings.service_fee_pct (D5);
  // the mock leg can't await, so it quotes the last cached pct / env fallback.
  const service_fee_minor = Math.round(
    (rental_minor * serviceFeePctSnapshot()) / 100
  );
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
      cleaning_display: formatMoney(listing.cleaning_fee_minor, listing.currency),
      service_fee_display: formatMoney(service_fee_minor, listing.currency),
      total_display: formatMoney(total_minor, listing.currency),
      currency: listing.currency,
    },
  };
}

export function quoteStay(
  slug: string,
  checkin: string,
  checkout: string,
  guests: number
): { ok: true; quote: Quote } | { ok: false; error: DomainError } {
  const listing = LISTING_BY_SLUG.get(slug);
  if (!listing || listing.status !== "published")
    return { ok: false, error: { code: "not_found", message: "listing not found" } };
  return quoteResult(listing, checkin, checkout, guests);
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

export interface SearchParams {
  city?: string;
  country?: string;
  checkin?: string;
  checkout?: string;
  guests?: number;
  type?: string; // property_type or listing kind
  amenities?: string[]; // all must be present
  max_price_minor?: number; // vs. avg nightly of the stay (or base price)
}

export interface ListingCard {
  slug: string;
  title: string;
  summary?: string;
  kind: string;
  property_type: string;
  city: string;
  region?: string;
  country_code: string;
  cover_photo?: string;
  currency: string;
  nightly_minor: number;
  nightly_display: string;
  max_guests: number;
  min_nights: number;
  rating: number;
  reviews: number;
  /** Flat for card display — sourced from the listing's business. */
  owner_name: string;
  owner_slug: string;
  amenities: string[];
  // present only when the search carried dates
  nights_count?: number;
  total_minor?: number;
  total_display?: string;
}

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

function amenitiesOf(listingId: string): { code: string; name: string; detail?: string }[] {
  return LISTING_AMENITIES.filter((la) => la.listing_id === listingId)
    .map((la) => {
      const a = AMENITY_BY_ID.get(la.amenity_id);
      return a ? { code: a.code, name: a.name, detail: la.detail } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function searchListings(params: SearchParams): ListingCard[] {
  const hasDates =
    params.checkin != null &&
    params.checkout != null &&
    DATE_RE.test(params.checkin) &&
    DATE_RE.test(params.checkout);

  const wantedAmenities = (params.amenities ?? [])
    .map((code) => AMENITY_BY_CODE.get(code)?.id)
    .filter((id): id is string => id != null);

  const cards: ListingCard[] = [];
  for (const listing of LISTINGS) {
    if (listing.status !== "published") continue;
    const property = PROPERTY_BY_ID.get(listing.property_id);
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
        LISTING_AMENITIES.filter((la) => la.listing_id === listing.id).map(
          (la) => la.amenity_id
        )
      );
      if (!wantedAmenities.every((id) => have.has(id))) continue;
    }

    const amenities = amenitiesOf(listing.id);
    const cover = LISTING_PHOTOS.find((p) => p.listing_id === listing.id && p.is_cover);
    const business = BUSINESS_BY_ID.get(property.business_id);

    const card: ListingCard = {
      slug: listing.slug,
      title: listing.title,
      summary: listing.summary,
      kind: listing.kind,
      property_type: property.property_type,
      city: property.city,
      region: property.region,
      country_code: property.country_code,
      cover_photo: cover ? resolvePhotoUrl(cover.url) : undefined,
      currency: listing.currency,
      nightly_minor: listing.base_price_minor,
      nightly_display: formatMoney(listing.base_price_minor, listing.currency),
      max_guests: listing.max_guests,
      min_nights: listing.min_nights,
      rating: listing.rating,
      reviews: listing.reviews,
      owner_name: business?.name ?? "",
      owner_slug: business?.slug ?? "",
      amenities: amenities.map((a) => a.code),
    };

    if (hasDates) {
      const qr = quoteResult(
        listing,
        params.checkin!,
        params.checkout!,
        params.guests ?? 1
      );
      if (!qr.ok) continue; // closed for those dates / violates stay rules
      card.nights_count = qr.quote.nights_count;
      card.total_minor = qr.quote.total_minor;
      card.total_display = qr.quote.total_display;
      card.nightly_minor = Math.round(
        qr.quote.nights_minor / qr.quote.nights_count
      );
      card.nightly_display = formatMoney(card.nightly_minor, listing.currency);
    }

    if (params.max_price_minor != null && card.nightly_minor > params.max_price_minor)
      continue;

    cards.push(card);
  }

  return cards.sort((a, b) => a.nightly_minor - b.nightly_minor);
}

// ---------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------

export interface ListingDetail {
  slug: string;
  title: string;
  summary?: string;
  description?: string;
  kind: string;
  status: string;
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
  rating: number;
  reviews: number;
  /** Flat owner fields alongside `business` — same source, card-friendly. */
  owner_name: string;
  owner_slug: string;
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
    timezone: string;
    checkin_time: string;
    checkout_time: string;
    latitude: number | null;
    longitude: number | null;
  };
  business: { name: string; slug: string };
  amenities: { code: string; name: string; detail?: string }[];
  photos: { url: string; alt?: string; is_cover: boolean }[];
  cancellation_policy?: {
    name: string;
    full_refund_days: number;
    partial_refund_pct: number;
    partial_refund_days: number;
  };
  units_available: number;
  /** Unavailable nights (YYYY-MM-DD) from today on — blocked or sold out. */
  occupied: string[];
}

/** The Owner's wallet for a listing — where Escrow releases land. It is no
 *  longer the x402 payTo: Bookings settle into the shared vault (#61). */
export function getListingPayTo(slug: string): string | null {
  const listing = LISTING_BY_SLUG.get(slug);
  if (!listing || listing.status !== "published") return null;
  const property = PROPERTY_BY_ID.get(listing.property_id);
  const business = property && BUSINESS_BY_ID.get(property.business_id);
  return business?.payout_address ?? null;
}

export function getListingBySlug(slug: string): ListingDetail | null {
  const listing = LISTING_BY_SLUG.get(slug);
  if (!listing || listing.status !== "published") return null;
  const property = PROPERTY_BY_ID.get(listing.property_id);
  const business = property && BUSINESS_BY_ID.get(property.business_id);
  if (!property || !business) return null;

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
      latitude: property.latitude ?? null,
      longitude: property.longitude ?? null,
    },
    business: { name: business.name, slug: business.slug },
    amenities: amenitiesOf(listing.id),
    photos: LISTING_PHOTOS.filter((p) => p.listing_id === listing.id)
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        url: resolvePhotoUrl(p.url),
        alt: p.alt_text,
        is_cover: p.is_cover,
      })),
    cancellation_policy: { ...GLOBAL_CANCELLATION_POLICY },
    units_available: LISTING_UNITS.filter(
      (u) => u.listing_id === listing.id && u.status === "active"
    ).length,
    occupied: occupiedNights(listing.id),
  };
}

function occupiedNights(listingId: string): string[] {
  const today = isoDay(new Date());
  return availability
    .filter(
      (n) =>
        n.listing_id === listingId &&
        n.night >= today &&
        (n.status !== "open" || n.units_available < 1)
    )
    .map((n) => n.night)
    .sort();
}

// ---------------------------------------------------------------------------
// booking stub — marks nights booked, no payment involved (issue #3).
// x402 plugs in later as middleware over POST /listings/:slug/book.
// ---------------------------------------------------------------------------

export interface BookInput {
  checkin: string;
  checkout: string;
  guests: number;
  guest_ref?: string;
  /** Verified Traveler id (supabase leg only — the mock Booking carries none). */
  traveler_id?: string;
}

export type BookResult =
  | { ok: true; booking: Booking; quote: Quote }
  | { ok: false; error: DomainError };

export function bookListing(slug: string, input: BookInput): BookResult {
  const listing = LISTING_BY_SLUG.get(slug);
  if (!listing || listing.status !== "published")
    return { ok: false, error: { code: "not_found", message: "listing not found" } };

  // Re-validate the stay fresh — never trust a previous quote.
  const qr = quoteResult(listing, input.checkin, input.checkout, input.guests);
  if (!qr.ok) return { ok: false, error: qr.error };

  const booking: Booking = {
    id: `bkg_${++bookingSeq}`,
    listing_id: listing.id,
    guest_ref: input.guest_ref,
    checkin: input.checkin,
    checkout: input.checkout,
    guests: input.guests,
    total_minor: qr.quote.total_minor,
    // Same lifecycle as book_stay(): the row lands pending_payment with the
    // nights held and an unfunded Escrow; settleMockBooking() confirms it.
    // The Cancellation deadline sits 5 days before check-in (ADR-0006).
    status: "pending_payment",
    created_at: new Date().toISOString(),
    escrow_status: "unfunded",
    cancel_deadline: isoDay(addDays(new Date(`${input.checkin}T00:00:00Z`), -5)),
    first_release_at: null,
    final_release_at: null,
  };
  bookings.push(booking);

  // Consume one unit per night; a night with remaining units stays open.
  for (const n of nightsBetween(input.checkin, input.checkout)) {
    const row = nightIndex.get(`${listing.id}|${n}`)!;
    row.units_available -= 1;
    if (row.units_available <= 0) {
      row.units_available = 0;
      row.status = "booked";
    }
  }

  return { ok: true, booking, quote: qr.quote };
}

// ---------------------------------------------------------------------------
// payment settle rehearsal. The supabase leg confirms a Booking in the x402
// onAfterSettle hook (confirm_booking_payment: pending_payment → confirmed,
// Escrow unfunded → funded) and releases it on settle failure
// (release_booking). The mock mirrors both — book-payment.ts calls these on
// the mock leg too — and, so the lifecycle stays deterministic without a
// facilitator in the loop, a Booking still pending_payment is settled on its
// FIRST READ after the insert (findBooking: GET /bookings[/:id], cancel,
// claim). Net effect: POST /book answers 'pending_payment', the very next
// read shows 'confirmed'. A released Booking is never resurrected.
// ---------------------------------------------------------------------------

/** pending_payment → confirmed, Escrow funded. No-op in any other status. */
export function settleMockBooking(id: string): Booking | undefined {
  const b = bookings.find((x) => x.id === id);
  if (b?.status === "pending_payment") {
    b.status = "confirmed";
    b.escrow_status = "funded";
  }
  return b;
}

/** Settle failed: drop a pending Booking and free its held nights. */
export function releaseMockBooking(id: string): void {
  const b = bookings.find((x) => x.id === id);
  if (b?.status !== "pending_payment") return;
  b.status = "cancelled";
  freeNights(b);
}

function freeNights(b: Booking): void {
  for (const n of nightsBetween(b.checkin, b.checkout)) {
    const row = nightIndex.get(`${b.listing_id}|${n}`);
    if (!row) continue;
    row.units_available += 1;
    if (row.status === "booked") row.status = "open";
  }
}

/** Every read path goes through here — the first one settles (see above). */
function findBooking(id: string): Booking | undefined {
  return settleMockBooking(id);
}

export function getBookingById(id: string): Booking | undefined {
  return findBooking(id);
}

// ---------------------------------------------------------------------------
// cancellation — Traveler-initiated (issue #18, ADR-0004). The supabase leg
// runs the same logic inside the cancel_booking() Postgres function and
// additionally records the refund intent in `payments`; the mock has no
// payments table, so it only mirrors state + math.
// ---------------------------------------------------------------------------

export interface CancelInput {
  /** Proof of ownership until real auth lands — must equal booking.guest_ref. */
  guest_ref?: string;
  /** Traveler id (supabase leg only — the mock Booking carries no traveler_id). */
  traveler_id?: string;
}

export type CancelErrorCode =
  | "not_found"
  | "forbidden"
  | "not_cancellable"
  | "no_policy";

export interface Cancellation {
  booking_id: string;
  status: "cancelled";
  checkin: string;
  checkout: string;
  currency: string;
  total_minor: number;
  days_until_checkin: number;
  policy_name: string;
  refund_pct: number;
  refund_minor: number;
  refund_display: string;
  /** payments row recording the refund intent — supabase leg only. */
  refund_payment_id?: string;
}

export type CancelResult =
  | { ok: true; cancellation: Cancellation }
  | { ok: false; error: { code: CancelErrorCode; message: string } };

// The platform default when a listing carries no cancel_policy_id: the
// Moderada platform policy (business_id null), closest to ADR-0004's original
// global rule. Same resolution order as cancel_booking() in Postgres.
function platformDefaultPolicy() {
  return (
    POLICY_BY_ID.get("cpol_moderada") ??
    CANCELLATION_POLICIES.find((p) => p.business_id === null)
  );
}

export function cancelBooking(id: string, input: CancelInput): CancelResult {
  const booking = findBooking(id);
  if (!booking)
    return {
      ok: false,
      error: { code: "not_found", message: "booking not found" },
    };

  // Ownership hook: the mock Booking has no traveler_id, so guest_ref is the
  // only proof. A booking without one can never be cancelled here.
  if (booking.guest_ref == null || booking.guest_ref !== input.guest_ref)
    return {
      ok: false,
      error: {
        code: "forbidden",
        message: "only the traveler on this booking can cancel it",
      },
    };

  if (booking.status !== "confirmed")
    return {
      ok: false,
      error: {
        code: "not_cancellable",
        message: `booking is ${booking.status} — only confirmed bookings can be cancelled`,
      },
    };

  const listing = LISTINGS.find((l) => l.id === booking.listing_id);
  const policy =
    (listing?.cancel_policy_id &&
      POLICY_BY_ID.get(listing.cancel_policy_id)) ||
    platformDefaultPolicy();
  if (!policy)
    return {
      ok: false,
      error: {
        code: "no_policy",
        message: "no cancellation policy resolved for this booking",
      },
    };

  // Days until check-in. The Postgres leg uses the property's timezone; the
  // mock approximates with UTC — same rule otherwise: >= full → 100%,
  // >= partial → partial_refund_pct, below → 0.
  const today = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  );
  const days = Math.round(
    (Date.parse(booking.checkin) - today) / 86_400_000
  );
  const pct =
    days >= policy.full_refund_days
      ? 100
      : days >= policy.partial_refund_days
        ? policy.partial_refund_pct
        : 0;
  const refund_minor = Math.round((booking.total_minor * pct) / 100);

  booking.status = "cancelled";
  booking.escrow_status = "refunded";
  freeNights(booking);

  return {
    ok: true,
    cancellation: {
      booking_id: booking.id,
      status: "cancelled",
      checkin: booking.checkin,
      checkout: booking.checkout,
      currency: listing?.currency ?? "USD",
      total_minor: booking.total_minor,
      days_until_checkin: days,
      policy_name: policy.name,
      refund_pct: pct,
      refund_minor,
      refund_display: formatMoney(
        refund_minor,
        listing?.currency ?? "USD"
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// booking reads + Claims — the Agent's "my bookings" surface (ADR-0006).
// The view builders are shared with the supabase leg so both emit the exact
// same shape; only the lookups differ.
// ---------------------------------------------------------------------------

/** Ownership proof until real auth lands — either must match the booking. */
export interface BookingOwner {
  guest_ref?: string;
  traveler_id?: string;
}

export interface BookingSummary {
  booking_id: string;
  listing_slug: string;
  status: BookingStatus;
  escrow_status: EscrowStatus;
  checkin: string;
  checkout: string;
  guests: number;
  nights_count: number;
  total_minor: number;
  total_display: string;
  currency: string;
  created_at: string;
}

export interface BookingDetail extends BookingSummary {
  cancel_deadline: string | null;
  first_release_at: string | null;
  final_release_at: string | null;
  /** Present only when the booking has (or had) a Claim. */
  claim_status?: "open" | "resolved";
  claim_reason?: ClaimReason;
  claim_resolution?: ClaimResolution;
}

/** The row-level fields both legs hand to the view builders. */
export interface BookingRecord {
  id: string;
  listing_slug: string;
  status: BookingStatus;
  escrow_status: EscrowStatus;
  checkin: string;
  checkout: string;
  guests: number;
  total_minor: number;
  currency: string;
  created_at: string;
  cancel_deadline: string | null;
  first_release_at: string | null;
  final_release_at: string | null;
  claim_reason: ClaimReason | null;
  claim_resolution: ClaimResolution | null;
}

export function toBookingSummary(r: BookingRecord): BookingSummary {
  return {
    booking_id: r.id,
    listing_slug: r.listing_slug,
    status: r.status,
    escrow_status: r.escrow_status,
    checkin: r.checkin,
    checkout: r.checkout,
    guests: r.guests,
    nights_count: nightsBetween(r.checkin, r.checkout).length,
    total_minor: r.total_minor,
    total_display: formatMoney(r.total_minor, r.currency),
    currency: r.currency,
    created_at: r.created_at,
  };
}

export function toBookingDetail(r: BookingRecord): BookingDetail {
  const claim_status =
    r.status === "claim_open" ? "open" : r.claim_resolution ? "resolved" : undefined;
  return {
    ...toBookingSummary(r),
    cancel_deadline: r.cancel_deadline,
    first_release_at: r.first_release_at,
    final_release_at: r.final_release_at,
    claim_status,
    claim_reason: claim_status ? (r.claim_reason ?? undefined) : undefined,
    claim_resolution: r.claim_resolution ?? undefined,
  };
}

export type BookingDetailResult =
  | { ok: true; booking: BookingDetail }
  | { ok: false; error: { code: "not_found" | "forbidden"; message: string } };

export type ClaimErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid_state"
  | "claim_window_closed";

export interface ClaimInput extends BookingOwner {
  reason: ClaimReason;
  evidence?: Record<string, unknown> | unknown[];
}

export type ClaimResult =
  | { ok: true; claim: { booking_id: string; status: "claim_open" } }
  | { ok: false; error: { code: ClaimErrorCode; message: string } };

/** Claims close 24 h after check-in (same rule as open_claim() in Postgres). */
export const CLAIM_WINDOW_MS = 24 * 3_600_000;

function mockRecord(b: Booking): BookingRecord {
  const listing = LISTINGS.find((l) => l.id === b.listing_id);
  return {
    id: b.id,
    listing_slug: listing?.slug ?? "",
    status: b.status,
    escrow_status: b.escrow_status ?? "funded",
    checkin: b.checkin,
    checkout: b.checkout,
    guests: b.guests,
    total_minor: b.total_minor,
    currency: listing?.currency ?? "USD",
    created_at: b.created_at,
    cancel_deadline: b.cancel_deadline ?? null,
    first_release_at: b.first_release_at ?? null,
    final_release_at: b.final_release_at ?? null,
    claim_reason: b.claim_reason ?? null,
    claim_resolution: b.claim_resolution ?? null,
  };
}

// The mock Booking carries no traveler_id, so only guest_ref can prove it.
function mockOwns(b: Booking, owner: BookingOwner): boolean {
  return owner.guest_ref != null && b.guest_ref === owner.guest_ref;
}

export function listBookings(owner: BookingOwner): BookingSummary[] {
  if (owner.guest_ref == null) return [];
  // Newest first; reverse() first so same-millisecond rows keep insert order.
  return [...bookings]
    .reverse()
    .filter((b) => mockOwns(b, owner))
    .map((b) => findBooking(b.id)!)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((b) => toBookingSummary(mockRecord(b)));
}

export function getBookingDetail(
  id: string,
  owner?: BookingOwner
): BookingDetailResult {
  const b = findBooking(id);
  if (!b)
    return { ok: false, error: { code: "not_found", message: "booking not found" } };
  if (owner && (owner.guest_ref != null || owner.traveler_id != null) && !mockOwns(b, owner))
    return { ok: false, error: { code: "forbidden", message: "not your booking" } };
  return { ok: true, booking: toBookingDetail(mockRecord(b)) };
}

export function openClaim(id: string, input: ClaimInput): ClaimResult {
  const b = findBooking(id);
  if (!b)
    return { ok: false, error: { code: "not_found", message: "booking not found" } };
  if (!mockOwns(b, input))
    return { ok: false, error: { code: "forbidden", message: "not your booking" } };
  if (b.status !== "confirmed" && b.status !== "in_progress")
    return {
      ok: false,
      error: { code: "invalid_state", message: "claim needs an active booking" },
    };
  if (Date.now() > Date.parse(`${b.checkin}T00:00:00Z`) + CLAIM_WINDOW_MS)
    return {
      ok: false,
      error: {
        code: "claim_window_closed",
        message: "claims close 24h after check-in",
      },
    };

  b.status = "claim_open";
  b.escrow_status = "claimed";
  b.claim_reason = input.reason;
  b.claim_evidence = input.evidence ?? {};
  return { ok: true, claim: { booking_id: b.id, status: "claim_open" } };
}
