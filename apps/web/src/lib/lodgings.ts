/**
 * Single lodging catalog: the mock inventory behind the marketplace, Nomito's
 * shortlists, the landing and the hero chat.
 *
 * Domain terms (see GLOSSARY.md): an Owner lists Lodgings; a Traveler pays a
 * Booking straight to the Owner, so nomai never holds funds. `Owner.wallet` is
 * the Owner's public settlement address: it stays in the data model and is
 * never rendered to a Traveler.
 */

import { formatBRL, formatMoney, formatNumber } from '@/lib/format';
import type { PhotoKey } from '@/lib/photos';

export type LodgingKind =
  | 'posada'
  | 'cabana'
  | 'departamento'
  | 'casa'
  | 'hostal'
  | 'hotel-boutique';

/**
 * Local fiat the Traveler sees: the currencies of the Ripio countries, plus
 * USD — the listings API prices some inventory in dollars (USDC-settled).
 */
export type Fiat = 'USD' | 'ARS' | 'BRL' | 'CLP' | 'COP' | 'MXN' | 'UYU';

export const FIAT_META: Record<Fiat, { name: string; symbol: string }> = {
  ARS: { name: 'Pesos argentinos', symbol: '$' },
  BRL: { name: 'Reales', symbol: 'R$' },
  CLP: { name: 'Pesos chilenos', symbol: '$' },
  COP: { name: 'Pesos colombianos', symbol: '$' },
  MXN: { name: 'Pesos mexicanos', symbol: 'MX$' },
  UYU: { name: 'Pesos uruguayos', symbol: '$U' },
  USD: { name: 'Dólares', symbol: 'US$' },
};

export const FIAT_OPTIONS: { id: Fiat; label: string }[] = [
  { id: 'ARS', label: 'ARS · $' },
  { id: 'BRL', label: 'BRL · R$' },
  { id: 'CLP', label: 'CLP · $' },
  { id: 'COP', label: 'COP · $' },
  { id: 'MXN', label: 'MXN · MX$' },
  { id: 'UYU', label: 'UYU · $U' },
  { id: 'USD', label: 'USD · US$' },
];

/**
 * Fallback fiat-per-USD rates, used when /api/fx can't reach any live source.
 * Display-only: a real Booking gets a firm quote when Nomito executes the FX
 * leg (that's where the FX fee lands, per ADR-0001).
 */
export const FALLBACK_USD_RATES: Record<Fiat, number> = {
  ARS: 1200,
  BRL: 5.4,
  CLP: 950,
  COP: 4200,
  MXN: 18.5,
  UYU: 40,
  USD: 1,
};

export type FxRates = Partial<Record<Fiat, number>>;

/**
 * LATAM countries where Ripio operates (registered entities listed on
 * ripio.com, 2026-10). Travelers fund their Agent wallet and Owners get paid
 * through Ripio, so nomai's destinations are exactly these.
 */
export const RIPIO_COUNTRIES = [
  { code: 'AR', name: 'Argentina', fiat: 'ARS' },
  { code: 'BR', name: 'Brasil', fiat: 'BRL' },
  { code: 'CL', name: 'Chile', fiat: 'CLP' },
  { code: 'CO', name: 'Colombia', fiat: 'COP' },
  { code: 'MX', name: 'México', fiat: 'MXN' },
  { code: 'UY', name: 'Uruguay', fiat: 'UYU' },
] as const satisfies readonly { code: string; name: string; fiat: Fiat }[];

export const RIPIO_COUNTRY_NAMES = RIPIO_COUNTRIES.map((c) => c.name);

/** "Argentina, Brasil, Chile, Colombia, México y Uruguay" */
export const RIPIO_COUNTRIES_TEXT = `${RIPIO_COUNTRY_NAMES.slice(0, -1).join(', ')} y ${RIPIO_COUNTRY_NAMES.at(-1)}`;

export interface Owner {
  slug: string;
  name: string;
  initials: string;
  city: string;
  country: string;
  countryCode: string;
  /** Year the Owner started receiving Bookings through nomai. */
  since?: number;
  /** Settlement address every Booking pays into directly. Never shown. */
  wallet?: `0x${string}`;
  /** true → verified badge, false → "verificación en curso", undefined → hidden (API doesn't report it). */
  verified?: boolean;
  responseTime?: string;
  bio?: string;
}

/** Placeholder artwork tone, see components/marketplace/lodging-art.tsx. */
export type ArtTone = 'terra' | 'agua' | 'sand' | 'siete-colores';

export interface Lodging {
  id: string;
  name: string;
  kind: LodgingKind;
  /** Town, e.g. Cafayate. */
  city: string;
  region: string;
  countryCode: string;
  /** Three-letter ticket code, e.g. CFY. */
  code: string;
  /** Price per night in `currency`. */
  pricePerNight: number;
  currency: Fiat;
  blurb: string;
  rating: number;
  reviews: number;
  guests: number;
  bedrooms: number;
  baths: number;
  amenities: string[];
  /** Traveler-favourite badge, shown on the card. */
  featured?: boolean;
  ownerSlug: string;
  tone: ArtTone;
  /** Photo from lib/photos.ts; Lodgings without one fall back to LodgingArt. */
  photo?: PhotoKey;
  /** Remote cover URL from the listings API, used when no curated `photo` exists. */
  photoUrl?: string;
  /**
   * Owner display name carried on the listing (API `owner_name`).
   */
  ownerName?: string;
  /** Pinned quote figures so the headline scenario matches the spec exactly. */
  pinned?: { subtotalBRL: number; feeBRL: number };
  /** Pre-formatted nightly price string, e.g. "$ 95.000" or "US$ 70.00". */
  priceDisplay?: string;
  /** Publication status in database/API. */
  status?: 'draft' | 'published' | 'paused' | 'archived';
}

export const LODGING_KINDS: { id: LodgingKind; label: string }[] = [
  { id: 'posada', label: 'Posadas' },
  { id: 'cabana', label: 'Cabañas' },
  { id: 'departamento', label: 'Departamentos' },
  { id: 'casa', label: 'Casas' },
  { id: 'hostal', label: 'Hostales' },
  { id: 'hotel-boutique', label: 'Hotel boutique' },
];

export const KIND_LABEL: Record<LodgingKind, string> = {
  posada: 'Posada',
  cabana: 'Cabaña',
  departamento: 'Departamento',
  casa: 'Casa',
  hostal: 'Hostal',
  'hotel-boutique': 'Hotel boutique',
};

export const NORTE_TOWNS = ['Salta', 'Cafayate', 'Purmamarca', 'Tilcara', 'Humahuaca'];

/** Lodging in the Argentine Norte, where Nomito launches. */
export function isNorte(l: Lodging): boolean {
  return NORTE_TOWNS.includes(l.city);
}

// --- Money ------------------------------------------------------------------

export const ARS_PER_BRL = 195;
export const FX_FEE_RATE = 0.01;
export const NIGHTS = 3;

/** Local currency units per 1 BRL, for quotes. ARS is pinned by the spec. */
export function perBRL(cur: Fiat): number {
  if (cur === 'ARS') return ARS_PER_BRL;
  return FALLBACK_USD_RATES[cur] / FALLBACK_USD_RATES.BRL;
}

export function toBRL(amount: number, cur: Fiat): number {
  return amount / perBRL(cur);
}

export function nightlyBRL(l: Lodging): number {
  return Math.round(toBRL(l.pricePerNight, l.currency));
}

/** `$ 95.000`, `R$ 240`, `$U 4.200` */
export function formatLocalPrice(l: Lodging): string {
  if (l.priceDisplay) return l.priceDisplay;
  return formatMoney(l.pricePerNight * 1_000_000, l.currency);
}

/** `$ 285.000 ARS` */
export function formatAmount(amount: number, cur: Fiat): string {
  return `${FIAT_META[cur].symbol} ${formatNumber(amount)} ${cur}`;
}

export function fiatOf(lodging: Lodging): Fiat {
  return lodging.currency;
}

export function convertNightPrice(
  lodging: Lodging,
  to: Fiat,
  rates: FxRates = FALLBACK_USD_RATES,
): number {
  const fromRate = rates[lodging.currency];
  const toRate = rates[to];
  if (!fromRate || !toRate) return lodging.pricePerNight;
  return Math.round((lodging.pricePerNight / fromRate) * toRate);
}

/**
 * Night price for display. Local fiat by default; when the Traveler picks a
 * preferred currency, the converted estimate is prefixed with `≈` and its code.
 */
export function formatNightPrice(lodging: Lodging, to?: Fiat, rates?: FxRates): string {
  if (to && to !== lodging.currency) {
    return `≈ ${to} ${formatNumber(convertNightPrice(lodging, to, rates))}`;
  }
  return formatLocalPrice(lodging);
}

export interface QuoteLine {
  label: string;
  value: string;
  kind?: 'fee' | 'total';
}

export interface BookingQuote {
  lodging: string;
  town: string;
  nights: number;
  lines: QuoteLine[];
}
