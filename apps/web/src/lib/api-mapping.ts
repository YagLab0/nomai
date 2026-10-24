/**
 * Maps listings-API payloads onto the `Lodging`/`Owner` shapes the UI was
 * built around, so cards, explorers and storefronts render real inventory
 * without knowing about the wire format.
 *
 * Pure functions with no server dependencies — safe in client components.
 * (`import type` from './api' keeps the server client out of the bundle.)
 */

import {
  FIAT_META,
  lodgingById,
  ownerBySlug,
  RIPIO_COUNTRIES,
  type ArtTone,
  type Fiat,
  type Lodging,
  type LodgingKind,
  type Owner,
} from '@/lib/lodgings';
import type { ApiListingCard, ApiListingDetail } from '@/lib/api';

// ---------------------------------------------------------------------------
// kind — the API splits it: `property_type` is the granular type, `kind` only
// says entire_place|room. Map property_type first, fall back to kind.
// ---------------------------------------------------------------------------

const KIND_BY_PROPERTY_TYPE: Record<string, LodgingKind> = {
  apartamento: 'departamento',
  hostel: 'hostal',
  hotel: 'hotel-boutique',
  posada: 'posada',
  cabana: 'cabana',
  casa: 'casa',
  /** Outdoor stays are closest to cabins in the UI taxonomy. */
  glamping: 'cabana',
  /** A finca is a country house. */
  finca: 'casa',
  otro: 'casa',
};

const KIND_BY_LISTING_KIND: Record<string, LodgingKind> = {
  entire_place: 'casa',
  room: 'hostal',
};

export function apiKind(propertyType: string | undefined, kind: string | undefined): LodgingKind {
  const pt = propertyType?.toLowerCase();
  if (pt && KIND_BY_PROPERTY_TYPE[pt]) return KIND_BY_PROPERTY_TYPE[pt];
  const k = kind?.toLowerCase();
  if (k && KIND_BY_LISTING_KIND[k]) return KIND_BY_LISTING_KIND[k];
  return 'casa';
}

// ---------------------------------------------------------------------------
// currency — unknown codes degrade to USD rather than breaking the card.
// ---------------------------------------------------------------------------

function apiFiat(currency: string | undefined): Fiat {
  const c = currency?.toUpperCase();
  return c && c in FIAT_META ? (c as Fiat) : 'USD';
}

// ---------------------------------------------------------------------------
// Deterministic derivations — same slug always produces the same presentation.
// ---------------------------------------------------------------------------

/** IATA-ish codes for the catalog's towns (kept from the mock dataset). */
const CITY_CODES: Record<string, string> = {
  cafayate: 'CFY',
  salta: 'SLA',
  purmamarca: 'PMA',
  tilcara: 'TIL',
  humahuaca: 'HUM',
  florianopolis: 'FLN',
  cartagena: 'CTG',
  'san pedro de atacama': 'CJC',
  'colonia del sacramento': 'CYR',
  mendoza: 'MDZ',
  tulum: 'TUL',
  bogota: 'BOG',
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Three-letter ticket code: known city map, else first three letters. */
export function apiCityCode(city: string | undefined, slug: string): string {
  const key = city ? norm(city) : '';
  if (key && CITY_CODES[key]) return CITY_CODES[key];
  const letters = key.replace(/[^a-z]/g, '');
  if (letters.length >= 3) return letters.slice(0, 3).toUpperCase();
  return (
    slug
      .split('-')[0]
      .replace(/[^a-z]/gi, '')
      .slice(0, 3)
      .toUpperCase() || 'NOM'
  );
}

const TONES: readonly ArtTone[] = ['terra', 'agua', 'sand', 'siete-colores'];

/** Stable placeholder-art tone, seeded by the slug. */
export function apiTone(slug: string): ArtTone {
  const hash = [...slug].reduce((n, c) => n + c.charCodeAt(0), 0);
  return TONES[hash % TONES.length];
}

/** Slugs that carry the "Favorito de viajeros" badge — the mock's featured set. */
const FEATURED_SLUGS = new Set([
  'casa-de-adobe',
  'cabanas-siete-colores',
  'posada-el-patio',
  'posada-marina',
  'casa-getsemani',
  'casa-del-salar',
  'posada-del-porton',
  'finca-vista-andes',
  'casa-chapinero',
]);

const MINOR_PER_UNIT = 1_000_000;

/** Slugify a business name when the API didn't give us an owner slug. */
function slugify(name: string): string {
  return (
    norm(name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'dueno'
  );
}

/** "Ramón Guaymás" → "RG". */
export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function countryName(code: string | undefined): string {
  return RIPIO_COUNTRIES.find((c) => c.code === code)?.name ?? code ?? '';
}

// ---------------------------------------------------------------------------
// card → Lodging
// ---------------------------------------------------------------------------

/**
 * Search card → Lodging. `bedrooms`/`baths` are detail-only fields, so cards
 * carry 0 — nothing in card UIs renders them.
 *
 * When the API slug matches a legacy mock id, its curated local photo wins
 * over the picsum cover; `cover_photo` is still kept in `photoUrl`.
 */
export function apiCardToLodging(card: ApiListingCard): Lodging {
  return {
    id: card.slug,
    name: card.title,
    kind: apiKind(card.property_type, card.kind),
    city: card.city ?? '',
    region: card.region ?? '',
    countryCode: card.country_code ?? '',
    code: apiCityCode(card.city, card.slug),
    pricePerNight: (card.nightly_minor ?? 0) / MINOR_PER_UNIT,
    currency: apiFiat(card.currency),
    blurb: card.summary ?? '',
    rating: card.rating ?? 0,
    reviews: card.reviews ?? 0,
    guests: card.max_guests ?? 1,
    bedrooms: 0,
    baths: 0,
    amenities: card.amenities ?? [],
    featured: FEATURED_SLUGS.has(card.slug) || undefined,
    ownerSlug: card.owner_slug ?? slugify(card.owner_name ?? ''),
    ownerName: card.owner_name,
    tone: apiTone(card.slug),
    photo: lodgingById(card.slug)?.photo,
    photoUrl: card.cover_photo,
  };
}

/**
 * Detail → Lodging, for the paths that render richer data. Amenity codes
 * become their human names; the rest mirrors apiCardToLodging.
 */
export function apiDetailToLodging(detail: ApiListingDetail): Lodging {
  const slug = detail.slug;
  const ownerName = detail.owner_name ?? detail.business?.name;
  return {
    id: slug,
    name: detail.title,
    kind: apiKind(detail.property?.property_type, detail.kind),
    city: detail.property?.city ?? '',
    region: detail.property?.region ?? '',
    countryCode: detail.property?.country_code ?? '',
    code: apiCityCode(detail.property?.city, slug),
    pricePerNight: (detail.base_price_minor ?? 0) / MINOR_PER_UNIT,
    currency: apiFiat(detail.currency),
    blurb: detail.summary ?? detail.description ?? '',
    rating: detail.rating ?? 0,
    reviews: detail.reviews ?? 0,
    guests: detail.max_guests ?? 1,
    bedrooms: detail.bedrooms ?? 0,
    baths: detail.bathrooms ?? 0,
    amenities: (detail.amenities ?? []).map((a) => a.name ?? a.code),
    featured: FEATURED_SLUGS.has(slug) || undefined,
    ownerSlug: detail.owner_slug ?? detail.business?.slug ?? slugify(ownerName ?? ''),
    ownerName,
    tone: apiTone(slug),
    photo: lodgingById(slug)?.photo,
    photoUrl: detail.photos?.find((p) => p.is_cover)?.url ?? detail.photos?.[0]?.url,
  };
}

// ---------------------------------------------------------------------------
// Owner — storefront pages get the best profile available: curated copy when
// the slug is one of the known OWNERS, else a minimal one built from the
// listing's owner fields.
// ---------------------------------------------------------------------------

export function apiOwner(slug: string, cards: ApiListingCard[]): Owner | null {
  const known = ownerBySlug(slug);
  if (known) return known;

  const card = cards.find((c) => c.owner_slug === slug);
  if (!card) return null;

  const name = card.owner_name ?? 'Dueño nomai';
  return {
    slug,
    name,
    initials: initialsFor(name),
    city: card.city ?? '',
    country: countryName(card.country_code),
    countryCode: card.country_code ?? '',
    // since/verified/responseTime/bio: the API doesn't report them — left
    // undefined so the profile renders no invented facts.
  };
}
