/**
 * Marketplace data — mock inventory.
 *
 * Domain terms (see GLOSSARY.md): an Owner lists Lodgings; a Traveler pays a
 * Booking straight to the Owner's wallet via x402 — nomai never holds funds,
 * so `Owner.wallet` is public settlement info, not a secret.
 */

export type LodgingKind =
  | "posada"
  | "cabana"
  | "departamento"
  | "casa"
  | "hostal"
  | "hotel-boutique";

/** wFIAT — local stablecoins settled on Celo. Settlement rail only: the UI
 * never shows these to the Traveler — prices display in fiat. */
export type Wfiat = "wARS" | "wBRL" | "wCOP" | "wMXN" | "wPEN" | "wCLP";

/** Local fiat the Traveler sees. */
export type Fiat = "ARS" | "BRL" | "COP" | "MXN" | "PEN" | "CLP";

export const FIAT_OF_WFIAT: Record<Wfiat, Fiat> = {
  wARS: "ARS",
  wBRL: "BRL",
  wCOP: "COP",
  wMXN: "MXN",
  wPEN: "PEN",
  wCLP: "CLP",
};

export const FIAT_META: Record<Fiat, { name: string; symbol: string }> = {
  ARS: { name: "Pesos argentinos", symbol: "$" },
  BRL: { name: "Reales", symbol: "R$" },
  COP: { name: "Pesos colombianos", symbol: "$" },
  MXN: { name: "Pesos mexicanos", symbol: "MX$" },
  PEN: { name: "Soles", symbol: "S/" },
  CLP: { name: "Pesos chilenos", symbol: "$" },
};

export const FIAT_OPTIONS: { id: Fiat; label: string }[] = [
  { id: "ARS", label: "ARS · $" },
  { id: "BRL", label: "BRL · R$" },
  { id: "COP", label: "COP · $" },
  { id: "MXN", label: "MXN · MX$" },
  { id: "PEN", label: "PEN · S/" },
  { id: "CLP", label: "CLP · $" },
];

/**
 * Fallback fiat-per-USD rates, used when /api/fx can't reach any live source.
 * Display-only: a real Booking gets a firm quote when the Agent executes the
 * FX leg (that's where the FX fee lands, per ADR-0001).
 */
export const FALLBACK_USD_RATES: Record<Fiat, number> = {
  ARS: 1200,
  BRL: 5.4,
  COP: 4200,
  MXN: 18.5,
  PEN: 3.7,
  CLP: 950,
};

export type FxRates = Partial<Record<Fiat, number>>;

export interface Owner {
  slug: string;
  name: string;
  initials: string;
  city: string;
  country: string;
  countryCode: string;
  /** Year the Owner started receiving Bookings through nomai. */
  since: number;
  /** Settlement address every Booking pays into directly. */
  wallet: `0x${string}`;
  verified: boolean;
  responseTime: string;
  bio: string;
}

/** Palette key for the placeholder artwork — see lodging-art.tsx. */
export type ArtTone = "sunset" | "terracota" | "gold" | "forest" | "laguna" | "dusk";

export interface Lodging {
  id: string;
  name: string;
  kind: LodgingKind;
  city: string;
  region: string;
  countryCode: string;
  pricePerNight: number;
  currency: Wfiat;
  rating: number;
  reviews: number;
  guests: number;
  bedrooms: number;
  baths: number;
  amenities: string[];
  /** Traveller-favourite badge, shown on the card. */
  featured?: boolean;
  ownerSlug: string;
  tone: ArtTone;
}

export const OWNERS: Owner[] = [
  {
    slug: "marina-rios",
    name: "Marina Ríos",
    initials: "MR",
    city: "Florianópolis",
    country: "Brasil",
    countryCode: "BR",
    since: 2024,
    wallet: "0x8f3cb91d4c2a7e05f6a1b3d5e9c0a2b4d6f8a1c3",
    verified: true,
    responseTime: "~1 h",
    bio: "Posada familiar a tres cuadras de Barra da Lagoa. Recibo huéspedes hace 12 años; con nomai cobro al instante y en reales.",
  },
  {
    slug: "hector-salas",
    name: "Héctor Salas",
    initials: "HS",
    city: "Mendoza",
    country: "Argentina",
    countryCode: "AR",
    since: 2024,
    wallet: "0x2b7e4f9a1c3d5e8f0a2b4c6d8e0f2a4b6c8d0e2f",
    verified: true,
    responseTime: "~30 min",
    bio: "Cabañas y finca entre viñedos a los pies del cordón del Plata. Parrilla propia, vino de la casa y siestas largas.",
  },
  {
    slug: "diego-quispe",
    name: "Diego Quispe",
    initials: "DQ",
    city: "Cusco",
    country: "Perú",
    countryCode: "PE",
    since: 2023,
    wallet: "0x9c1d3e5f7a9b0c2d4e6f8a0b2c4d6e8f0a1b3c5d",
    verified: true,
    responseTime: "~2 h",
    bio: "Tercera generación de hosteleros en San Blas. Te oriento sobre altura, mate de coca y los horarios reales de Machu Picchu.",
  },
  {
    slug: "ana-lucia-mendoza",
    name: "Ana Lucía Mendoza",
    initials: "AM",
    city: "Cancún",
    country: "México",
    countryCode: "MX",
    since: 2024,
    wallet: "0x4d6f8a0b2c4e6f8a0b1c3d5e7f9a0b2c4d6e8f0a",
    verified: true,
    responseTime: "~45 min",
    bio: "Casas entre cenotes y manglares de la Riviera Maya. Cobro en pesos el mismo día, sin esperar la liquidación de la OTA.",
  },
  {
    slug: "sofia-cardenas",
    name: "Sofía Cárdenas",
    initials: "SC",
    city: "Bogotá",
    country: "Colombia",
    countryCode: "CO",
    since: 2025,
    wallet: "0x7a1c3e5f9b0d2e4f6a8b0c1d3e5f7a9b0c2d4e6f",
    verified: false,
    responseTime: "~3 h",
    bio: "Dos departamentos en Chapinero para quienes vienen a trabajar remoto: wifi de fibra, escritorio y café de la finca.",
  },
];

export const LODGINGS: Lodging[] = [
  {
    id: "posada-marina",
    name: "Posada Marina",
    kind: "posada",
    city: "Florianópolis",
    region: "Barra da Lagoa",
    countryCode: "BR",
    pricePerNight: 240,
    currency: "wBRL",
    rating: 4.9,
    reviews: 132,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ["Desayuno", "Wifi", "A 3 cuadras de la playa"],
    featured: true,
    ownerSlug: "marina-rios",
    tone: "laguna",
  },
  {
    id: "casa-duna",
    name: "Casa Duna",
    kind: "casa",
    city: "Florianópolis",
    region: "Joaquina",
    countryCode: "BR",
    pricePerNight: 310,
    currency: "wBRL",
    rating: 4.7,
    reviews: 64,
    guests: 6,
    bedrooms: 3,
    baths: 2,
    amenities: ["Parrilla", "Pet-friendly", "Tablas de surf"],
    ownerSlug: "marina-rios",
    tone: "gold",
  },
  {
    id: "cabana-los-alamos",
    name: "Cabaña Los Álamos",
    kind: "cabana",
    city: "Mendoza",
    region: "Potrerillos",
    countryCode: "AR",
    pricePerNight: 38000,
    currency: "wARS",
    rating: 4.8,
    reviews: 97,
    guests: 5,
    bedrooms: 2,
    baths: 1,
    amenities: ["Chimenea", "Vista al cordón", "Kayaks"],
    ownerSlug: "hector-salas",
    tone: "forest",
  },
  {
    id: "finca-vista-andes",
    name: "Finca Vista Andes",
    kind: "casa",
    city: "Mendoza",
    region: "Chacras de Coria",
    countryCode: "AR",
    pricePerNight: 52000,
    currency: "wARS",
    rating: 4.9,
    reviews: 141,
    guests: 8,
    bedrooms: 4,
    baths: 3,
    amenities: ["Viñedo propio", "Pileta", "Parrilla"],
    featured: true,
    ownerSlug: "hector-salas",
    tone: "terracota",
  },
  {
    id: "hostal-inti",
    name: "Hostal Inti",
    kind: "hostal",
    city: "Cusco",
    region: "Centro histórico",
    countryCode: "PE",
    pricePerNight: 180,
    currency: "wPEN",
    rating: 4.6,
    reviews: 210,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ["Mate de coca", "Terraza", "Cocina común"],
    ownerSlug: "diego-quispe",
    tone: "sunset",
  },
  {
    id: "loft-san-blas",
    name: "Loft San Blas",
    kind: "departamento",
    city: "Cusco",
    region: "San Blas",
    countryCode: "PE",
    pricePerNight: 215,
    currency: "wPEN",
    rating: 4.8,
    reviews: 76,
    guests: 3,
    bedrooms: 1,
    baths: 1,
    amenities: ["Vista a la ciudad", "Cocina", "Calefacción"],
    featured: true,
    ownerSlug: "diego-quispe",
    tone: "dusk",
  },
  {
    id: "casa-cenote",
    name: "Casa Cenote",
    kind: "casa",
    city: "Puerto Morelos",
    region: "Riviera Maya",
    countryCode: "MX",
    pricePerNight: 780,
    currency: "wMXN",
    rating: 4.7,
    reviews: 88,
    guests: 6,
    bedrooms: 3,
    baths: 2,
    amenities: ["Cenote privado", "Pileta", "Bicis"],
    ownerSlug: "ana-lucia-mendoza",
    tone: "laguna",
  },
  {
    id: "depto-aldea-zama",
    name: "Depto Aldea Zamá",
    kind: "departamento",
    city: "Tulum",
    region: "Aldea Zamá",
    countryCode: "MX",
    pricePerNight: 890,
    currency: "wMXN",
    rating: 4.5,
    reviews: 52,
    guests: 4,
    bedrooms: 2,
    baths: 2,
    amenities: ["Rooftop", "Cowork", "Aire acondicionado"],
    ownerSlug: "ana-lucia-mendoza",
    tone: "forest",
  },
  {
    id: "casa-chapinero",
    name: "Casa Chapinero Alto",
    kind: "hotel-boutique",
    city: "Bogotá",
    region: "Chapinero",
    countryCode: "CO",
    pricePerNight: 96000,
    currency: "wCOP",
    rating: 4.8,
    reviews: 119,
    guests: 4,
    bedrooms: 2,
    baths: 2,
    amenities: ["Desayuno de finca", "Biblioteca", "Jardín"],
    featured: true,
    ownerSlug: "sofia-cardenas",
    tone: "gold",
  },
  {
    id: "depto-parkway",
    name: "Depto Parkway",
    kind: "departamento",
    city: "Bogotá",
    region: "Teusaquillo",
    countryCode: "CO",
    pricePerNight: 88000,
    currency: "wCOP",
    rating: 4.6,
    reviews: 43,
    guests: 3,
    bedrooms: 1,
    baths: 1,
    amenities: ["Escritorio", "Fibra 600 Mb", "Balcón"],
    ownerSlug: "sofia-cardenas",
    tone: "sunset",
  },
];

export const LODGING_KINDS: { id: LodgingKind; label: string }[] = [
  { id: "posada", label: "Posadas" },
  { id: "cabana", label: "Cabañas" },
  { id: "departamento", label: "Departamentos" },
  { id: "casa", label: "Casas" },
  { id: "hostal", label: "Hostales" },
  { id: "hotel-boutique", label: "Hotel boutique" },
];

export const KIND_LABEL: Record<LodgingKind, string> = {
  posada: "Posada",
  cabana: "Cabaña",
  departamento: "Departamento",
  casa: "Casa",
  hostal: "Hostal",
  "hotel-boutique": "Hotel boutique",
};

export function ownerBySlug(slug: string): Owner | undefined {
  return OWNERS.find((o) => o.slug === slug);
}

export function ownerOf(lodging: Lodging): Owner {
  const owner = ownerBySlug(lodging.ownerSlug);
  if (!owner) throw new Error(`Lodging ${lodging.id} references unknown owner`);
  return owner;
}

export function lodgingsByOwner(ownerSlug: string): Lodging[] {
  return LODGINGS.filter((l) => l.ownerSlug === ownerSlug);
}

export function fiatOf(lodging: Lodging): Fiat {
  return FIAT_OF_WFIAT[lodging.currency];
}

export function convertNightPrice(
  lodging: Lodging,
  to: Fiat,
  rates: FxRates = FALLBACK_USD_RATES,
): number {
  const from = fiatOf(lodging);
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return lodging.pricePerNight;
  return Math.round((lodging.pricePerNight / fromRate) * toRate);
}

const group = (n: number) => n.toLocaleString("es-AR");

/** Local price, e.g. `R$ 240`, `S/ 180` — what the Owner actually charges. */
export function formatLocalPrice(lodging: Lodging): string {
  const fiat = fiatOf(lodging);
  return `${FIAT_META[fiat].symbol} ${group(lodging.pricePerNight)}`;
}

/**
 * Night price for display. Local fiat by default; when the Traveler picks a
 * preferred currency, the converted estimate is prefixed `≈` and shown with
 * its code (`≈ ARS 45.667`) — wFIAT never appears.
 */
export function formatNightPrice(
  lodging: Lodging,
  to?: Fiat,
  rates?: FxRates,
): string {
  if (to && to !== fiatOf(lodging)) {
    return `≈ ${to} ${group(convertNightPrice(lodging, to, rates))}`;
  }
  return formatLocalPrice(lodging);
}
