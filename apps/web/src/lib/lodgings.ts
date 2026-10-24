/**
 * Single lodging catalog: the mock inventory behind the marketplace, Nomito's
 * shortlists, the landing and the hero chat.
 *
 * Domain terms (see GLOSSARY.md): an Owner lists Lodgings; a Traveler pays a
 * Booking straight to the Owner, so nomai never holds funds. `Owner.wallet` is
 * the Owner's public settlement address: it stays in the data model and is
 * never rendered to a Traveler.
 */

import { formatBRL, formatNumber } from '@/lib/format';
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
export type Fiat = 'USD' | 'ARS' | 'BRL' | 'CLP' | 'COP' | 'MXN' | 'PEN' | 'UYU';

export const FIAT_META: Record<Fiat, { name: string; symbol: string }> = {
  ARS: { name: 'Pesos argentinos', symbol: '$' },
  BRL: { name: 'Reales', symbol: 'R$' },
  CLP: { name: 'Pesos chilenos', symbol: '$' },
  COP: { name: 'Pesos colombianos', symbol: '$' },
  MXN: { name: 'Pesos mexicanos', symbol: 'MX$' },
  PEN: { name: 'Soles', symbol: 'S/' },
  UYU: { name: 'Pesos uruguayos', symbol: '$U' },
  USD: { name: 'Dólares', symbol: 'US$' },
};

export const FIAT_OPTIONS: { id: Fiat; label: string }[] = [
  { id: 'ARS', label: 'ARS · $' },
  { id: 'BRL', label: 'BRL · R$' },
  { id: 'CLP', label: 'CLP · $' },
  { id: 'COP', label: 'COP · $' },
  { id: 'MXN', label: 'MXN · MX$' },
  { id: 'PEN', label: 'PEN · S/' },
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
  PEN: 3.8,
  UYU: 40,
  USD: 1,
};

export type FxRates = Partial<Record<Fiat, number>>;

/**
 * LATAM countries served through Ripio rails. Owners get paid through Ripio
 * everywhere on this list, so nomai's destinations are exactly these.
 * Funding splits in two tiers below: registered-entity countries get fiat
 * ramps; the rest are reached through the wFIAT stablecoin rail only.
 */
export const RIPIO_COUNTRIES = [
  { code: 'AR', name: 'Argentina', fiat: 'ARS' },
  { code: 'BR', name: 'Brasil', fiat: 'BRL' },
  { code: 'CL', name: 'Chile', fiat: 'CLP' },
  { code: 'CO', name: 'Colombia', fiat: 'COP' },
  { code: 'MX', name: 'México', fiat: 'MXN' },
  { code: 'PE', name: 'Perú', fiat: 'PEN' },
  { code: 'UY', name: 'Uruguay', fiat: 'UYU' },
] as const satisfies readonly { code: string; name: string; fiat: Fiat }[];

/**
 * Countries where the Ripio Ramps API actually operates (per
 * docs.ripio.com/ramps-api — AR, BR, CO, MX only; on/off ramp differs per
 * country): the Traveler funds the Agent wallet through a fiat ramp — local
 * transfer, Mercado Pago, PSE, PIX — no wallet needed up front.
 */
export const RAMP_COUNTRY_CODES: ReadonlySet<string> = new Set([
  'AR',
  'BR',
  'CO',
  'MX',
]);

/** Countries whose Travelers fund through Ripio fiat ramps. */
export const RAMP_COUNTRIES = RIPIO_COUNTRIES.filter((c) =>
  RAMP_COUNTRY_CODES.has(c.code),
);

/**
 * Countries with no Ramps API coverage — Chile and Uruguay have registered
 * entities but no ramp, Perú has neither — reached through the wFIAT
 * stablecoin rail only. The Traveler must already hold a wallet (Ripio or
 * any other) and funds with a manual QR transfer inside the app.
 */
export const QR_FUNDING_COUNTRIES = RIPIO_COUNTRIES.filter(
  (c) => !RAMP_COUNTRY_CODES.has(c.code),
);

/** How a Traveler from `countryCode` funds the Agent wallet. */
export function fundingMethod(countryCode: string): 'ramp' | 'qr' {
  return RAMP_COUNTRY_CODES.has(countryCode) ? 'ramp' : 'qr';
}

export const RIPIO_COUNTRY_NAMES = RIPIO_COUNTRIES.map((c) => c.name);

/** "Argentina, Brasil, Chile, Colombia, México, Perú y Uruguay" */
export const RIPIO_COUNTRIES_TEXT = `${RIPIO_COUNTRY_NAMES.slice(0, -1).join(', ')} y ${RIPIO_COUNTRY_NAMES.at(-1)}`;

const RAMP_COUNTRY_NAMES = RAMP_COUNTRIES.map((c) => c.name);

/** "Argentina, Brasil, Colombia y México" — the ramp tier. */
export const RAMP_COUNTRIES_TEXT = `${RAMP_COUNTRY_NAMES.slice(0, -1).join(', ')} y ${RAMP_COUNTRY_NAMES.at(-1)}`;

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
   * Owner display name carried on the listing (API `owner_name`). Cards use it
   * when `ownerSlug` isn't one of the curated OWNERS.
   */
  ownerName?: string;
  /** Pinned quote figures so the headline scenario matches the spec exactly. */
  pinned?: { subtotalBRL: number; feeBRL: number };
}

export const OWNERS: Owner[] = [
  {
    slug: 'ramon-guaymas',
    name: 'Ramón Guaymás',
    initials: 'RG',
    city: 'Cafayate',
    country: 'Argentina',
    countryCode: 'AR',
    since: 2024,
    wallet: '0x3a5c7e9b1d2f4a6c8e0b2d4f6a8c0e2b4d6f8a1c',
    verified: true,
    responseTime: '~30 min',
    bio: 'Casa de adobe heredada de mi abuelo, con parral y patio. Recibo viajeros hace 9 años; te dejo una botella de torrontés de las bodegas de acá.',
  },
  {
    slug: 'graciela-torres',
    name: 'Graciela Torres',
    initials: 'GT',
    city: 'Salta',
    country: 'Argentina',
    countryCode: 'AR',
    since: 2024,
    wallet: '0x5b7d9f1a3c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d',
    verified: true,
    responseTime: '~1 h',
    bio: 'Dos casonas en barrio Güemes, a diez cuadras de la plaza. Desayuno casero con tortilla al rescoldo y los mejores datos de peñas.',
  },
  {
    slug: 'lidia-condori',
    name: 'Lidia Condori',
    initials: 'LC',
    city: 'Purmamarca',
    country: 'Argentina',
    countryCode: 'AR',
    since: 2025,
    wallet: '0x6c8e0a2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c',
    verified: true,
    responseTime: '~2 h',
    bio: 'Cabañas y una casa de adobe frente al Cerro de los Siete Colores. Te despertás con el sol pintando el cerro.',
  },
  {
    slug: 'tomas-aramayo',
    name: 'Tomás Aramayo',
    initials: 'TA',
    city: 'Tilcara',
    country: 'Argentina',
    countryCode: 'AR',
    since: 2025,
    wallet: '0x7d9f1b3c5e7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e',
    verified: false,
    responseTime: '~3 h',
    bio: 'Hostel chico y tranquilo, a pasos del Pucará. Cocina compartida, mapa de senderos y mate siempre listo.',
  },
  {
    slug: 'elvira-vilte',
    name: 'Elvira Vilte',
    initials: 'EV',
    city: 'Humahuaca',
    country: 'Argentina',
    countryCode: 'AR',
    since: 2024,
    wallet: '0x8e0a2c4d6f8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f',
    verified: true,
    responseTime: '~1 h',
    bio: 'Posada familiar en el casco histórico de Humahuaca. Cocino empanadas y locro para los que llegan tarde.',
  },

  {
    slug: 'nilda-cruz',
    name: 'Nilda Cruz',
    initials: 'NC',
    city: 'Tilcara',
    country: 'Argentina',
    countryCode: 'AR',
    since: 2025,
    wallet: '0x1a3c5e7b9d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c',
    verified: true,
    responseTime: '~1 h',
    bio: 'Posada de patio rosado a dos cuadras de la plaza de Tilcara. Desayuno con pan casero y dulce de cayote.',
  },
  {
    slug: 'ariel-tolaba',
    name: 'Ariel Tolaba',
    initials: 'AT',
    city: 'Humahuaca',
    country: 'Argentina',
    countryCode: 'AR',
    since: 2025,
    wallet: '0x2c4e6a8b0d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c',
    verified: true,
    responseTime: '~2 h',
    bio: 'Cabañas a la salida del pueblo, camino al Hornocal. Si querés, te llevo al mirador para ver el atardecer.',
  },

  {
    slug: 'marina-rios',
    name: 'Marina Ríos',
    initials: 'MR',
    city: 'Florianópolis',
    country: 'Brasil',
    countryCode: 'BR',
    since: 2024,
    wallet: '0x8f3cb91d4c2a7e05f6a1b3d5e9c0a2b4d6f8a1c3',
    verified: true,
    responseTime: '~1 h',
    bio: 'Posada familiar frente a Praia Brava y una casa en Ingleses. Recibo huéspedes hace 12 años; con nomai cobro al instante y en reales.',
  },
  {
    slug: 'valentina-herrera',
    name: 'Valentina Herrera',
    initials: 'VH',
    city: 'Cartagena',
    country: 'Colombia',
    countryCode: 'CO',
    since: 2025,
    wallet: '0x3e5a7c9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1b',
    verified: true,
    responseTime: '~1 h',
    bio: 'Casa colonial en Getsemaní, con balcón de madera y patio con mango. Te paso los mejores datos para salir de la ciudad amurallada.',
  },
  {
    slug: 'camila-araya',
    name: 'Camila Araya',
    initials: 'CA',
    city: 'San Pedro de Atacama',
    country: 'Chile',
    countryCode: 'CL',
    since: 2025,
    wallet: '0x4f6b8d0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2e',
    verified: true,
    responseTime: '~2 h',
    bio: 'Hostal y casa de adobe a cuatro cuadras de Caracoles. Armo salidas al Valle de la Luna y a las lagunas al amanecer.',
  },
  {
    slug: 'martin-pereyra',
    name: 'Martín Pereyra',
    initials: 'MP',
    city: 'Colonia del Sacramento',
    country: 'Uruguay',
    countryCode: 'UY',
    since: 2024,
    wallet: '0x5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d9f1a3d',
    verified: true,
    responseTime: '~30 min',
    bio: 'Posada en el Barrio Histórico y una casa a media cuadra de la rambla. Bicis para recorrer y mate al atardecer sobre el río.',
  },
  {
    slug: 'hector-salas',
    name: 'Héctor Salas',
    initials: 'HS',
    city: 'Mendoza',
    country: 'Argentina',
    countryCode: 'AR',
    since: 2024,
    wallet: '0x2b7e4f9a1c3d5e8f0a2b4c6d8e0f2a4b6c8d0e2f',
    verified: true,
    responseTime: '~30 min',
    bio: 'Cabañas y finca entre viñedos a los pies del cordón del Plata. Parrilla propia, vino de la casa y siestas largas.',
  },
  {
    slug: 'ana-lucia-mendoza',
    name: 'Ana Lucía Mendoza',
    initials: 'AM',
    city: 'Tulum',
    country: 'México',
    countryCode: 'MX',
    since: 2024,
    wallet: '0x4d6f8a0b2c4e6f8a0b1c3d5e7f9a0b2c4d6e8f0a',
    verified: true,
    responseTime: '~45 min',
    bio: 'Casas entre cenotes y selva en Tulum. Cobro en pesos el mismo día, sin esperar la liquidación de la plataforma.',
  },
  {
    slug: 'sofia-cardenas',
    name: 'Sofía Cárdenas',
    initials: 'SC',
    city: 'Bogotá',
    country: 'Colombia',
    countryCode: 'CO',
    since: 2025,
    wallet: '0x7a1c3e5f9b0d2e4f6a8b0c1d3e5f7a9b0c2d4e6f',
    verified: false,
    responseTime: '~3 h',
    bio: 'Dos departamentos en Chapinero para quienes vienen a trabajar remoto: wifi de fibra, escritorio y café de la finca.',
  },
  {
    slug: 'rosa-quispe',
    name: 'Rosa Quispe',
    initials: 'RQ',
    city: 'Cusco',
    country: 'Perú',
    countryCode: 'PE',
    since: 2025,
    wallet: '0x9d1f3b5a7c9e1d3f5b7a9c1e3d5f7a9b1c3e5f7a',
    verified: true,
    responseTime: '~1 h',
    bio: 'Posada familiar a tres cuadras de la Plaza de Armas y un hostal en San Blas. Te paso los horarios para Machu Picchu sin filas.',
  },
];

export const LODGINGS: Lodging[] = [
  {
    id: 'casa-de-adobe',
    name: 'Casa de Adobe',
    kind: 'casa',
    city: 'Cafayate',
    region: 'Valles Calchaquíes',
    countryCode: 'AR',
    code: 'CFY',
    pricePerNight: 95_000,
    currency: 'ARS',
    blurb: 'Patio con parral, a dos cuadras de la plaza.',
    rating: 4.9,
    reviews: 118,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ['Patio con parral', 'Desayuno', 'Cerca de bodegas'],
    featured: true,
    ownerSlug: 'ramon-guaymas',
    tone: 'terra',
    photo: 'cafayateHabitacion',
    pinned: { subtotalBRL: 1461.55, feeBRL: 14.6 },
  },
  {
    id: 'posada-el-algarrobo',
    name: 'Posada El Algarrobo',
    kind: 'posada',
    city: 'Salta',
    region: 'Barrio Güemes',
    countryCode: 'AR',
    code: 'SLA',
    pricePerNight: 78_000,
    currency: 'ARS',
    blurb: 'Casona de barrio, desayuno casero incluido.',
    rating: 4.8,
    reviews: 204,
    guests: 3,
    bedrooms: 1,
    baths: 1,
    amenities: ['Desayuno casero', 'Wifi', 'Patio'],
    ownerSlug: 'graciela-torres',
    tone: 'sand',
    photo: 'saltaCatedral',
  },
  {
    id: 'cabanas-siete-colores',
    name: 'Cabañas Siete Colores',
    kind: 'cabana',
    city: 'Purmamarca',
    region: 'Quebrada de Humahuaca',
    countryCode: 'AR',
    code: 'PMA',
    pricePerNight: 110_000,
    currency: 'ARS',
    blurb: 'Cabañas frente al Cerro de los Siete Colores.',
    rating: 4.9,
    reviews: 96,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ['Vista al cerro', 'Estufa a leña', 'Desayuno'],
    featured: true,
    ownerSlug: 'lidia-condori',
    tone: 'siete-colores',
    photo: 'purmamarcaAdobe',
  },
  {
    id: 'hostel-la-quebrada',
    name: 'Hostel La Quebrada',
    kind: 'hostal',
    city: 'Tilcara',
    region: 'Quebrada de Humahuaca',
    countryCode: 'AR',
    code: 'TIL',
    pricePerNight: 32_000,
    currency: 'ARS',
    blurb: 'Habitación doble privada, cocina compartida.',
    rating: 4.6,
    reviews: 143,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ['Cocina compartida', 'Mapa de senderos', 'Wifi'],
    ownerSlug: 'tomas-aramayo',
    tone: 'agua',
    photo: 'tilcaraRuinas',
  },
  {
    id: 'casona-guemes',
    name: 'Casona Güemes',
    kind: 'departamento',
    city: 'Salta',
    region: 'Barrio Güemes',
    countryCode: 'AR',
    code: 'SLA',
    pricePerNight: 92_000,
    currency: 'ARS',
    blurb: 'Departamento entero en una casona de 1920, con balcón.',
    rating: 4.7,
    reviews: 61,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ['Balcón', 'Cocina', 'Aire acondicionado'],
    ownerSlug: 'graciela-torres',
    tone: 'terra',
    photo: 'saltaTeleferico',
  },
  {
    id: 'cabana-vinas-del-sol',
    name: 'Cabaña Viñas del Sol',
    kind: 'cabana',
    city: 'Cafayate',
    region: 'Valles Calchaquíes',
    countryCode: 'AR',
    code: 'CFY',
    pricePerNight: 120_000,
    currency: 'ARS',
    blurb: 'Cabaña entre viñedos, con pileta y parrilla.',
    rating: 4.8,
    reviews: 74,
    guests: 5,
    bedrooms: 2,
    baths: 2,
    amenities: ['Pileta', 'Parrilla', 'Entre viñedos'],
    ownerSlug: 'ramon-guaymas',
    tone: 'agua',
    photo: 'cafayateVinedos',
  },
  {
    id: 'posada-quebrada-alta',
    name: 'Posada Quebrada Alta',
    kind: 'posada',
    city: 'Humahuaca',
    region: 'Quebrada de Humahuaca',
    countryCode: 'AR',
    code: 'HUM',
    pricePerNight: 58_000,
    currency: 'ARS',
    blurb: 'Habitaciones sencillas en el casco histórico.',
    rating: 4.7,
    reviews: 88,
    guests: 3,
    bedrooms: 1,
    baths: 1,
    amenities: ['Cena casera', 'Calefacción', 'Patio'],
    ownerSlug: 'elvira-vilte',
    tone: 'sand',
    photo: 'humahuacaValle',
  },
  {
    id: 'casa-los-colorados',
    name: 'Casa Los Colorados',
    kind: 'casa',
    city: 'Purmamarca',
    region: 'Quebrada de Humahuaca',
    countryCode: 'AR',
    code: 'PMA',
    pricePerNight: 84_000,
    currency: 'ARS',
    blurb: 'Casa de adobe con patio, a una cuadra de la feria.',
    rating: 4.7,
    reviews: 52,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ['Patio', 'Cocina', 'Cerca de la feria'],
    ownerSlug: 'lidia-condori',
    tone: 'siete-colores',
    photo: 'purmamarcaFeria',
  },
  {
    id: 'posada-el-patio',
    name: 'Posada El Patio',
    kind: 'posada',
    city: 'Tilcara',
    region: 'Quebrada de Humahuaca',
    countryCode: 'AR',
    code: 'TIL',
    pricePerNight: 64_000,
    currency: 'ARS',
    blurb: 'Patio rosado con mesas al sol, desayuno casero.',
    rating: 4.8,
    reviews: 131,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ['Desayuno casero', 'Patio', 'Wifi'],
    featured: true,
    ownerSlug: 'nilda-cruz',
    tone: 'terra',
    photo: 'tilcaraPatio',
  },
  {
    id: 'cabanas-hornocal',
    name: 'Cabañas Hornocal',
    kind: 'cabana',
    city: 'Humahuaca',
    region: 'Quebrada de Humahuaca',
    countryCode: 'AR',
    code: 'HUM',
    pricePerNight: 72_000,
    currency: 'ARS',
    blurb: 'Cabañas camino al Hornocal, con estufa a leña.',
    rating: 4.8,
    reviews: 47,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ['Estufa a leña', 'Vista a los cerros', 'Estacionamiento'],
    ownerSlug: 'ariel-tolaba',
    tone: 'sand',
    photo: 'humahuacaCerros',
  },
  {
    id: 'posada-marina',
    code: 'FLN',
    blurb: 'Posada familiar a una cuadra de Praia Brava.',
    name: 'Posada Marina',
    kind: 'posada',
    city: 'Florianópolis',
    region: 'Praia Brava',
    countryCode: 'BR',
    pricePerNight: 240,
    currency: 'BRL',
    rating: 4.9,
    reviews: 132,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ['Desayuno', 'Wifi', 'A una cuadra de la playa'],
    featured: true,
    ownerSlug: 'marina-rios',
    tone: 'agua',
    photo: 'floripaBrava',
  },
  {
    id: 'casa-duna',
    code: 'FLN',
    blurb: 'Casa con parrilla, a pasos del agua quieta de Ingleses.',
    name: 'Casa Duna',
    kind: 'casa',
    city: 'Florianópolis',
    region: 'Ingleses',
    countryCode: 'BR',
    pricePerNight: 310,
    currency: 'BRL',
    rating: 4.7,
    reviews: 64,
    guests: 6,
    bedrooms: 3,
    baths: 2,
    amenities: ['Parrilla', 'Pet-friendly', 'Tablas de surf'],
    ownerSlug: 'marina-rios',
    tone: 'sand',
    photo: 'floripaIngleses',
  },
  {
    id: 'casa-getsemani',
    name: 'Casa Getsemaní',
    kind: 'posada',
    city: 'Cartagena',
    region: 'Getsemaní',
    countryCode: 'CO',
    code: 'CTG',
    pricePerNight: 380_000,
    currency: 'COP',
    blurb: 'Habitaciones con balcón sobre la calle más colorida.',
    rating: 4.9,
    reviews: 167,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ['Balcón', 'Desayuno', 'Aire acondicionado'],
    featured: true,
    ownerSlug: 'valentina-herrera',
    tone: 'terra',
    photo: 'cartagenaBalcon',
  },
  {
    id: 'casa-de-los-almendros',
    name: 'Casa de los Almendros',
    kind: 'casa',
    city: 'Cartagena',
    region: 'Centro histórico',
    countryCode: 'CO',
    code: 'CTG',
    pricePerNight: 620_000,
    currency: 'COP',
    blurb: 'Casa entera dentro de la ciudad amurallada.',
    rating: 4.8,
    reviews: 58,
    guests: 6,
    bedrooms: 3,
    baths: 2,
    amenities: ['Patio', 'Cocina', 'Terraza'],
    ownerSlug: 'valentina-herrera',
    tone: 'agua',
    photo: 'cartagenaCasas',
  },
  {
    id: 'hostal-licancabur',
    name: 'Hostal Licancabur',
    kind: 'hostal',
    city: 'San Pedro de Atacama',
    region: 'Centro',
    countryCode: 'CL',
    code: 'CJC',
    pricePerNight: 42_000,
    currency: 'CLP',
    blurb: 'Habitación doble con patio, a pasos de Caracoles.',
    rating: 4.7,
    reviews: 121,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ['Patio', 'Desayuno', 'Salidas al amanecer'],
    ownerSlug: 'camila-araya',
    tone: 'sand',
    photo: 'atacamaLejia',
  },
  {
    id: 'casa-del-salar',
    name: 'Casa del Salar',
    kind: 'casa',
    city: 'San Pedro de Atacama',
    region: 'Ayllu de Solcor',
    countryCode: 'CL',
    code: 'CJC',
    pricePerNight: 95_000,
    currency: 'CLP',
    blurb: 'Casa de adobe con cielo de estrellas en el patio.',
    rating: 4.9,
    reviews: 64,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ['Cielo para mirar estrellas', 'Cocina', 'Estacionamiento'],
    featured: true,
    ownerSlug: 'camila-araya',
    tone: 'terra',
    photo: 'atacamaBaltinache',
  },
  {
    id: 'posada-del-porton',
    name: 'Posada del Portón',
    kind: 'posada',
    city: 'Colonia del Sacramento',
    region: 'Barrio Histórico',
    countryCode: 'UY',
    code: 'CYR',
    pricePerNight: 4_200,
    currency: 'UYU',
    blurb: 'Posada de puerta antigua en el Barrio Histórico.',
    rating: 4.8,
    reviews: 143,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ['Desayuno', 'Bicis', 'Patio'],
    featured: true,
    ownerSlug: 'martin-pereyra',
    tone: 'terra',
    photo: 'coloniaPortal',
  },
  {
    id: 'casa-la-rambla',
    name: 'Casa La Rambla',
    kind: 'casa',
    city: 'Colonia del Sacramento',
    region: 'Rambla',
    countryCode: 'UY',
    code: 'CYR',
    pricePerNight: 6_800,
    currency: 'UYU',
    blurb: 'Casa a media cuadra de la rambla, para ver el atardecer.',
    rating: 4.7,
    reviews: 49,
    guests: 5,
    bedrooms: 2,
    baths: 2,
    amenities: ['Parrilla', 'Bicis', 'Cerca del río'],
    ownerSlug: 'martin-pereyra',
    tone: 'sand',
    photo: 'coloniaCafe',
  },
  {
    id: 'cabana-los-alamos',
    code: 'MDZ',
    blurb: 'Cabaña con chimenea y vista al cordón.',
    name: 'Cabaña Los Álamos',
    kind: 'cabana',
    city: 'Mendoza',
    region: 'Potrerillos',
    countryCode: 'AR',
    pricePerNight: 38_000,
    currency: 'ARS',
    rating: 4.8,
    reviews: 97,
    guests: 5,
    bedrooms: 2,
    baths: 1,
    amenities: ['Chimenea', 'Vista al cordón', 'Kayaks'],
    ownerSlug: 'hector-salas',
    tone: 'agua',
  },
  {
    id: 'finca-vista-andes',
    code: 'MDZ',
    blurb: 'Finca con viñedo propio y pileta.',
    name: 'Finca Vista Andes',
    kind: 'casa',
    city: 'Mendoza',
    region: 'Chacras de Coria',
    countryCode: 'AR',
    pricePerNight: 52_000,
    currency: 'ARS',
    rating: 4.9,
    reviews: 141,
    guests: 8,
    bedrooms: 4,
    baths: 3,
    amenities: ['Viñedo propio', 'Pileta', 'Parrilla'],
    featured: true,
    ownerSlug: 'hector-salas',
    tone: 'terra',
  },
  {
    id: 'casa-cenote',
    code: 'TUL',
    blurb: 'Casa con cenote privado, a diez minutos de la playa.',
    name: 'Casa Cenote',
    kind: 'casa',
    city: 'Tulum',
    region: 'Riviera Maya',
    countryCode: 'MX',
    pricePerNight: 780,
    currency: 'MXN',
    rating: 4.7,
    reviews: 88,
    guests: 6,
    bedrooms: 3,
    baths: 2,
    amenities: ['Cenote privado', 'Pileta', 'Bicis'],
    ownerSlug: 'ana-lucia-mendoza',
    tone: 'agua',
    photo: 'tulumPalapa',
  },
  {
    id: 'depto-aldea-zama',
    code: 'TUL',
    blurb: 'Departamento con rooftop y cowork.',
    name: 'Depto Aldea Zamá',
    kind: 'departamento',
    city: 'Tulum',
    region: 'Aldea Zamá',
    countryCode: 'MX',
    pricePerNight: 890,
    currency: 'MXN',
    rating: 4.5,
    reviews: 52,
    guests: 4,
    bedrooms: 2,
    baths: 2,
    amenities: ['Rooftop', 'Cowork', 'Aire acondicionado'],
    ownerSlug: 'ana-lucia-mendoza',
    tone: 'agua',
    photo: 'tulumBici',
  },
  {
    id: 'casa-chapinero',
    code: 'BOG',
    blurb: 'Casa boutique con biblioteca y jardín.',
    name: 'Casa Chapinero Alto',
    kind: 'hotel-boutique',
    city: 'Bogotá',
    region: 'Chapinero',
    countryCode: 'CO',
    pricePerNight: 96_000,
    currency: 'COP',
    rating: 4.8,
    reviews: 119,
    guests: 4,
    bedrooms: 2,
    baths: 2,
    amenities: ['Desayuno de finca', 'Biblioteca', 'Jardín'],
    featured: true,
    ownerSlug: 'sofia-cardenas',
    tone: 'sand',
  },
  {
    id: 'depto-parkway',
    code: 'BOG',
    blurb: 'Departamento con escritorio y fibra.',
    name: 'Depto Parkway',
    kind: 'departamento',
    city: 'Bogotá',
    region: 'Teusaquillo',
    countryCode: 'CO',
    pricePerNight: 88_000,
    currency: 'COP',
    rating: 4.6,
    reviews: 43,
    guests: 3,
    bedrooms: 1,
    baths: 1,
    amenities: ['Escritorio', 'Fibra 600 Mb', 'Balcón'],
    ownerSlug: 'sofia-cardenas',
    tone: 'terra',
  },
  {
    id: 'posada-san-blas',
    code: 'CUZ',
    blurb: 'Posada de piedra y patio interno, en el barrio de los artesanos.',
    name: 'Posada San Blas',
    kind: 'posada',
    city: 'Cusco',
    region: 'San Blas',
    countryCode: 'PE',
    pricePerNight: 260,
    currency: 'PEN',
    rating: 4.8,
    reviews: 152,
    guests: 3,
    bedrooms: 1,
    baths: 1,
    amenities: ['Desayuno', 'Patio', 'Mate de coca'],
    featured: true,
    ownerSlug: 'rosa-quispe',
    tone: 'terra',
  },
  {
    id: 'hostal-plaza-de-armas',
    code: 'CUZ',
    blurb: 'Hostal a tres cuadras de la Plaza de Armas, ideal para aclimatarse.',
    name: 'Hostal Plaza de Armas',
    kind: 'hostal',
    city: 'Cusco',
    region: 'Centro histórico',
    countryCode: 'PE',
    pricePerNight: 120,
    currency: 'PEN',
    rating: 4.6,
    reviews: 210,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ['Cocina compartida', 'Guardaequipaje', 'Wifi'],
    ownerSlug: 'rosa-quispe',
    tone: 'sand',
  },
];

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


export function lodgingById(id: string): Lodging | undefined {
  return LODGINGS.find((l) => l.id === id);
}

/** The headline scenario: Casa de Adobe, Cafayate. */
export const CASA_DE_ADOBE = lodgingById('casa-de-adobe')!;

export const NORTE_TOWNS = ['Salta', 'Cafayate', 'Purmamarca', 'Tilcara', 'Humahuaca'];

/** Lodging in the Argentine Norte, where Nomito launches. */
export function isNorte(l: Lodging): boolean {
  return NORTE_TOWNS.includes(l.city);
}

export function lodgingsInTown(town: string): Lodging[] {
  const t = town.toLowerCase();
  return LODGINGS.filter((l) => l.city.toLowerCase() === t);
}

// --- Money ------------------------------------------------------------------

export const ARS_PER_BRL = 195;
const FX_FEE_RATE = 0.01;
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
  return `${FIAT_META[l.currency].symbol} ${formatNumber(l.pricePerNight)}`;
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

export function findLodging(text: string): Lodging | undefined {
  const t = text.toLowerCase();
  return LODGINGS.find((l) => t.includes(l.name.toLowerCase()) || t.includes(l.id));
}

export interface QuoteLine {
  label: string;
  value: string;
  /** Raw number behind `value`, when the line is a formatted amount. */
  amount?: number;
  kind?: 'fee' | 'total';
}

export interface BookingQuote {
  lodging: string;
  town: string;
  nights: number;
  lines: QuoteLine[];
}

export function quoteFor(l: Lodging, nights = NIGHTS): BookingQuote {
  const totalLocal = l.pricePerNight * nights;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const subtotal = l.pinned?.subtotalBRL ?? r2(toBRL(totalLocal, l.currency));
  const fee = l.pinned?.feeBRL ?? r2(subtotal * FX_FEE_RATE);
  const total = r2(subtotal + fee);
  const rate = Math.round(perBRL(l.currency) * 100) / 100;
  return {
    lodging: l.name,
    town: l.city,
    nights,
    lines: [
      { label: `Reserva: ${l.name}, ${l.city} · ${nights} noches`, value: formatAmount(totalLocal, l.currency) },
      { label: `Conversión BRL → ${l.currency} · 1 BRL = ${formatNumber(rate)} ${l.currency}`, value: formatBRL(subtotal) },
      { label: 'Comisión de conversión Nomai', value: formatBRL(fee), kind: 'fee' },
      { label: 'Total', value: formatBRL(total, { withCode: true }), amount: total, kind: 'total' },
    ],
  };
}
