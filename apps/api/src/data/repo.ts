import { AMENITY_BY_CODE, AMENITY_BY_ID, CANCELLATION_POLICIES } from "./catalog.js";
import { buildAvailability, nightsBetween } from "./availability.js";
import {
  BUSINESSES,
  LISTING_AMENITIES,
  LISTING_PHOTOS,
  LISTING_UNITS,
  LISTINGS,
  PROPERTIES,
  RATE_RULES,
} from "./inventory.js";
import type { AvailabilityNight, Booking, Listing } from "./types.js";

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
const POLICY_BY_ID = new Map(CANCELLATION_POLICIES.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// money — minor units are 10^-6 of the display currency (USDC-style, per the
// model doc). display formatting lives here so endpoints and tools agree.
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "US$",
  BRL: "R$",
  ARS: "AR$",
  MXN: "MX$",
  COP: "CO$",
  PEN: "S/",
};

export function formatMoney(minor: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const amount = minor / 1_000_000;
  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  total_minor: number;
  nights_display: string;
  cleaning_display: string;
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
  const total_minor = nights_minor + listing.cleaning_fee_minor;
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
      total_minor,
      nights_display: formatMoney(nights_minor, listing.currency),
      cleaning_display: formatMoney(listing.cleaning_fee_minor, listing.currency),
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
  };
  business: { name: string };
  amenities: { code: string; name: string; detail?: string }[];
  photos: { url: string; alt?: string; is_cover: boolean }[];
  cancellation_policy?: {
    name: string;
    full_refund_days: number;
    partial_refund_pct: number;
    partial_refund_days: number;
  };
  units_available: number;
}

export function getListingBySlug(slug: string): ListingDetail | null {
  const listing = LISTING_BY_SLUG.get(slug);
  if (!listing || listing.status !== "published") return null;
  const property = PROPERTY_BY_ID.get(listing.property_id);
  const business = property && BUSINESSES.find((b) => b.id === property.business_id);
  const policy =
    listing.cancel_policy_id && POLICY_BY_ID.get(listing.cancel_policy_id);
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
    business: { name: business.name },
    amenities: amenitiesOf(listing.id),
    photos: LISTING_PHOTOS.filter((p) => p.listing_id === listing.id)
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ url: p.url, alt: p.alt_text, is_cover: p.is_cover })),
    cancellation_policy: policy
      ? {
          name: policy.name,
          full_refund_days: policy.full_refund_days,
          partial_refund_pct: policy.partial_refund_pct,
          partial_refund_days: policy.partial_refund_days,
        }
      : undefined,
    units_available: LISTING_UNITS.filter(
      (u) => u.listing_id === listing.id && u.status === "active"
    ).length,
  };
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
    status: "confirmed",
    created_at: new Date().toISOString(),
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

export function getBookingById(id: string): Booking | undefined {
  return bookings.find((b) => b.id === id);
}
