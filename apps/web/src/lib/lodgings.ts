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

/** Local fiat the Traveler sees. */
export type Fiat = 'ARS' | 'BRL' | 'COP' | 'MXN' | 'PEN' | 'CLP';

export const FIAT_META: Record<Fiat, { name: string; symbol: string }> = {
  ARS: { name: 'Pesos argentinos', symbol: '$' },
  BRL: { name: 'Reales', symbol: 'R$' },
  COP: { name: 'Pesos colombianos', symbol: '$' },
  MXN: { name: 'Pesos mexicanos', symbol: 'MX$' },
  PEN: { name: 'Soles', symbol: 'S/' },
  CLP: { name: 'Pesos chilenos', symbol: '$' },
};

export const FIAT_OPTIONS: { id: Fiat; label: string }[] = [
  { id: 'ARS', label: 'ARS · $' },
  { id: 'BRL', label: 'BRL · R$' },
  { id: 'COP', label: 'COP · $' },
  { id: 'MXN', label: 'MXN · MX$' },
  { id: 'PEN', label: 'PEN · S/' },
  { id: 'CLP', label: 'CLP · $' },
];

/**
 * Fallback fiat-per-USD rates, used when /api/fx can't reach any live source.
 * Display-only: a real Booking gets a firm quote when Nomito executes the FX
 * leg (that's where the FX fee lands, per ADR-0001).
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
    bio: 'Posada familiar a tres cuadras de Barra da Lagoa. Recibo huéspedes hace 12 años; con nomai cobro al instante y en reales.',
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
    slug: 'diego-quispe',
    name: 'Diego Quispe',
    initials: 'DQ',
    city: 'Cusco',
    country: 'Perú',
    countryCode: 'PE',
    since: 2023,
    wallet: '0x9c1d3e5f7a9b0c2d4e6f8a0b2c4d6e8f0a1b3c5d',
    verified: true,
    responseTime: '~2 h',
    bio: 'Tercera generación de hosteleros en San Blas. Te oriento sobre altura, mate de coca y los horarios reales de Machu Picchu.',
  },
  {
    slug: 'ana-lucia-mendoza',
    name: 'Ana Lucía Mendoza',
    initials: 'AM',
    city: 'Cancún',
    country: 'México',
    countryCode: 'MX',
    since: 2024,
    wallet: '0x4d6f8a0b2c4e6f8a0b1c3d5e7f9a0b2c4d6e8f0a',
    verified: true,
    responseTime: '~45 min',
    bio: 'Casas entre cenotes y manglares de la Riviera Maya. Cobro en pesos el mismo día, sin esperar la liquidación de la OTA.',
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
    blurb: 'Posada familiar a tres cuadras de la playa.',
    name: 'Posada Marina',
    kind: 'posada',
    city: 'Florianópolis',
    region: 'Barra da Lagoa',
    countryCode: 'BR',
    pricePerNight: 240,
    currency: 'BRL',
    rating: 4.9,
    reviews: 132,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ['Desayuno', 'Wifi', 'A 3 cuadras de la playa'],
    featured: true,
    ownerSlug: 'marina-rios',
    tone: 'agua',
  },
  {
    id: 'casa-duna',
    code: 'FLN',
    blurb: 'Casa con parrilla y tablas de surf.',
    name: 'Casa Duna',
    kind: 'casa',
    city: 'Florianópolis',
    region: 'Joaquina',
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
    id: 'hostal-inti',
    code: 'CUZ',
    blurb: 'Hostal con terraza en el centro histórico.',
    name: 'Hostal Inti',
    kind: 'hostal',
    city: 'Cusco',
    region: 'Centro histórico',
    countryCode: 'PE',
    pricePerNight: 180,
    currency: 'PEN',
    rating: 4.6,
    reviews: 210,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ['Mate de coca', 'Terraza', 'Cocina común'],
    ownerSlug: 'diego-quispe',
    tone: 'terra',
  },
  {
    id: 'loft-san-blas',
    code: 'CUZ',
    blurb: 'Loft con vista a la ciudad en San Blas.',
    name: 'Loft San Blas',
    kind: 'departamento',
    city: 'Cusco',
    region: 'San Blas',
    countryCode: 'PE',
    pricePerNight: 215,
    currency: 'PEN',
    rating: 4.8,
    reviews: 76,
    guests: 3,
    bedrooms: 1,
    baths: 1,
    amenities: ['Vista a la ciudad', 'Cocina', 'Calefacción'],
    featured: true,
    ownerSlug: 'diego-quispe',
    tone: 'sand',
  },
  {
    id: 'casa-cenote',
    code: 'PMO',
    blurb: 'Casa con cenote privado en la Riviera Maya.',
    name: 'Casa Cenote',
    kind: 'casa',
    city: 'Puerto Morelos',
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

export function lodgingsByOwner(ownerSlug: string): Lodging[] {
  return LODGINGS.filter((l) => l.ownerSlug === ownerSlug);
}


export function lodgingById(id: string): Lodging | undefined {
  return LODGINGS.find((l) => l.id === id);
}

/** The headline scenario: Casa de Adobe, Cafayate. */
export const CASA_DE_ADOBE = lodgingById('casa-de-adobe')!;

const NORTE_TOWNS = ['Salta', 'Cafayate', 'Purmamarca', 'Tilcara', 'Humahuaca'];

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

/** `$ 95.000`, `R$ 240`, `S/ 180` */
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
