/**
 * The seed inventory behind the marketplace, Nomito's shortlists, the landing
 * and the hero chat, plus the display and quote helpers around it. Surfaces
 * never read `LODGINGS` directly: they go through `@/lib/catalog`.
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

/** Local fiat the Traveler sees: the currencies of the Ripio countries. */
export type Fiat = 'ARS' | 'BRL' | 'CLP' | 'COP' | 'MXN' | 'UYU';

export const FIAT_META: Record<Fiat, { name: string; symbol: string }> = {
  ARS: { name: 'Pesos argentinos', symbol: '$' },
  BRL: { name: 'Reales', symbol: 'R$' },
  CLP: { name: 'Pesos chilenos', symbol: '$' },
  COP: { name: 'Pesos colombianos', symbol: '$' },
  MXN: { name: 'Pesos mexicanos', symbol: 'MX$' },
  UYU: { name: 'Pesos uruguayos', symbol: '$U' },
};

export const FIAT_OPTIONS: { id: Fiat; label: string }[] = [
  { id: 'ARS', label: 'ARS · $' },
  { id: 'BRL', label: 'BRL · R$' },
  { id: 'CLP', label: 'CLP · $' },
  { id: 'COP', label: 'COP · $' },
  { id: 'MXN', label: 'MXN · MX$' },
  { id: 'UYU', label: 'UYU · $U' },
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
  since: number;
  /** Settlement address every Booking pays into directly. Never shown. */
  wallet: `0x${string}`;
  verified: boolean;
  responseTime: string;
  bio: string;
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
  /** Exact street address, public to every Traveler (owner-views §9). */
  address?: string;
  /** Pin coordinates; absent when the Owner never dropped the pin. */
  lat?: number;
  lng?: number;
  /** The Lodging's own photos, ordered; the first is the cover. */
  photos?: string[];
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
    address: 'Nuestra Señora del Rosario 165',
    lat: -26.0735,
    lng: -65.9775,
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
    address: 'Ruta Nacional 40 km 4',
    lat: -26.1018,
    lng: -65.9627,
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

/** The fiat an Owner is paid in — their country's Ripio currency (ADR-0001). */
export function ownerFiat(owner: Owner): Fiat {
  const fiat = RIPIO_COUNTRIES.find((c) => c.code === owner.countryCode)?.fiat;
  if (!fiat) throw new Error(`unsupported owner country: ${owner.countryCode}`);
  return fiat;
}

export const NORTE_TOWNS = ['Salta', 'Cafayate', 'Purmamarca', 'Tilcara', 'Humahuaca'];

/** Lodging in the Argentine Norte, where Nomito launches. */
export function isNorte(l: Lodging): boolean {
  return NORTE_TOWNS.includes(l.city);
}

/**
 * A town where an Owner can list a Lodging. The catalog derives the Lodging's
 * `code`, `region` and `countryCode` from its town — never typed by the Owner
 * (owner-views §9).
 */
export interface Town {
  name: string;
  /** Three-letter ticket code, e.g. CFY. */
  code: string;
  /** Area label under the Lodging's name, e.g. 'Quebrada de Humahuaca'. */
  region: string;
  countryCode: string;
  /** Town center: where the wizard's map opens and the pin starts. */
  lat: number;
  lng: number;
}

/**
 * Every listable town: the Ripio countries only, since the Booking settles into
 * the Owner's own-country account (ADR-0001). Codes match the seeded Lodgings.
 */
export const TOWNS: readonly Town[] = [
  // Argentina
  { name: 'Salta', code: 'SLA', region: 'Valle de Lerma', countryCode: 'AR', lat: -24.7883, lng: -65.4106 },
  { name: 'Cafayate', code: 'CFY', region: 'Valles Calchaquíes', countryCode: 'AR', lat: -26.073, lng: -65.976 },
  { name: 'Purmamarca', code: 'PMA', region: 'Quebrada de Humahuaca', countryCode: 'AR', lat: -23.7447, lng: -65.4987 },
  { name: 'Tilcara', code: 'TIL', region: 'Quebrada de Humahuaca', countryCode: 'AR', lat: -23.5776, lng: -65.3966 },
  { name: 'Humahuaca', code: 'HUM', region: 'Quebrada de Humahuaca', countryCode: 'AR', lat: -23.2054, lng: -65.3505 },
  { name: 'Cachi', code: 'CAC', region: 'Valles Calchaquíes', countryCode: 'AR', lat: -25.1203, lng: -66.1631 },
  { name: 'Iruya', code: 'IRU', region: 'Quebrada de Humahuaca', countryCode: 'AR', lat: -22.7889, lng: -65.2153 },
  { name: 'San Salvador de Jujuy', code: 'JUJ', region: 'San Salvador', countryCode: 'AR', lat: -24.1858, lng: -65.2995 },
  { name: 'Buenos Aires', code: 'BUE', region: 'Buenos Aires', countryCode: 'AR', lat: -34.6037, lng: -58.3816 },
  { name: 'Mendoza', code: 'MDZ', region: 'Cuyo', countryCode: 'AR', lat: -32.8895, lng: -68.8458 },
  { name: 'Bariloche', code: 'BRC', region: 'Patagonia', countryCode: 'AR', lat: -41.1335, lng: -71.3103 },
  // Brasil
  { name: 'Florianópolis', code: 'FLN', region: 'Santa Catarina', countryCode: 'BR', lat: -27.5954, lng: -48.548 },
  { name: 'Río de Janeiro', code: 'RIO', region: 'Costa Verde', countryCode: 'BR', lat: -22.9068, lng: -43.1729 },
  { name: 'Salvador', code: 'SSA', region: 'Bahía', countryCode: 'BR', lat: -12.9777, lng: -38.5016 },
  // Chile
  { name: 'San Pedro de Atacama', code: 'CJC', region: 'Desierto de Atacama', countryCode: 'CL', lat: -22.911, lng: -68.2001 },
  { name: 'Santiago', code: 'SCL', region: 'Región Metropolitana', countryCode: 'CL', lat: -33.4372, lng: -70.6506 },
  { name: 'Valparaíso', code: 'VAP', region: 'Costa central', countryCode: 'CL', lat: -33.0472, lng: -71.6127 },
  // Colombia
  { name: 'Cartagena', code: 'CTG', region: 'Caribe colombiano', countryCode: 'CO', lat: 10.4236, lng: -75.5486 },
  { name: 'Bogotá', code: 'BOG', region: 'Cundinamarca', countryCode: 'CO', lat: 4.5981, lng: -74.0758 },
  { name: 'Medellín', code: 'MDE', region: 'Antioquia', countryCode: 'CO', lat: 6.2518, lng: -75.5636 },
  // México
  { name: 'Tulum', code: 'TUL', region: 'Riviera Maya', countryCode: 'MX', lat: 20.2114, lng: -87.4654 },
  { name: 'Ciudad de México', code: 'MEX', region: 'CDMX', countryCode: 'MX', lat: 19.4326, lng: -99.1332 },
  { name: 'Oaxaca', code: 'OAX', region: 'Valles Centrales', countryCode: 'MX', lat: 17.061, lng: -96.7253 },
  // Uruguay
  { name: 'Colonia del Sacramento', code: 'CYR', region: 'Colonia', countryCode: 'UY', lat: -34.4717, lng: -57.8442 },
  { name: 'Montevideo', code: 'MVD', region: 'Montevideo', countryCode: 'UY', lat: -34.9058, lng: -56.1913 },
  { name: 'Punta del Este', code: 'PDE', region: 'Maldonado', countryCode: 'UY', lat: -34.96, lng: -54.942 },
];

export function townByName(name: string): Town | undefined {
  return TOWNS.find((t) => t.name === name);
}

/** Towns an Owner with that country can list in — the wizard's town list. */
export function townsInCountry(countryCode: string): Town[] {
  return TOWNS.filter((t) => t.countryCode === countryCode);
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
      { label: 'Total', value: formatBRL(total, { withCode: true }), kind: 'total' },
    ],
  };
}
