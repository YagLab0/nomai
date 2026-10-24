/** Mock Owner for the dashboard panel. Replaced by the account API later. */

import type { Lodging, Owner } from '@/lib/lodgings';

/**
 * The logged-in Owner: Ramón Guaymás. His Casa de Adobe is the Booking Lucas
 * confirms in the §4 scenario — here it shows up as money received.
 */
export const currentOwner: Owner = {
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
};

export const ownerLodgings: Lodging[] = [
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
    blurb: 'Galería fresca con vista a los cerros.',
    rating: 4.8,
    reviews: 94,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ['Galería colonial', 'Desayuno', 'WiFi'],
    ownerSlug: 'ramon-guaymas',
    tone: 'sand',
    photo: 'saltaCatedral',
  },
  {
    id: 'casona-guemes',
    name: 'Casona Güemes',
    kind: 'hotel-boutique',
    city: 'Salta',
    region: 'Centro Histórico',
    countryCode: 'AR',
    code: 'SLA',
    pricePerNight: 135_000,
    currency: 'ARS',
    blurb: 'Casona del siglo XIX restaurada, patio de aljibe.',
    rating: 4.9,
    reviews: 87,
    guests: 2,
    bedrooms: 1,
    baths: 1,
    amenities: ['Patio con aljibe', 'Desayuno buffet', 'Aire acondicionado'],
    ownerSlug: 'ramon-guaymas',
    tone: 'sand',
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
    pricePerNight: 88_000,
    currency: 'ARS',
    blurb: 'Entre viñedos de torrontés, pileta y parrilla.',
    rating: 4.8,
    reviews: 76,
    guests: 4,
    bedrooms: 2,
    baths: 1,
    amenities: ['Pileta', 'Parrilla', 'Entre viñedos'],
    ownerSlug: 'ramon-guaymas',
    tone: 'terra',
    photo: 'cafayateVinedos',
  },
];

export function ownerLodgingById(id: string): Lodging | undefined {
  return ownerLodgings.find((l) => l.id === id);
}

export type OwnerBookingStatus = 'confirmada' | 'en-curso' | 'completada' | 'cancelada';

/**
 * The Owner's view of a Booking. Payment is confirmation (x402 settles straight
 * into the Owner's wallet), so there is no "pending payment" state. Statuses
 * are derived from dates in real life; the mock pins them.
 */
export interface OwnerBooking {
  id: string;
  /** ADR-0002 requires government ID at Booking time, so `verified` is true. */
  traveler: { name: string; origin: string; verified: boolean };
  lodgingId: string;
  /** ISO dates, YYYY-MM-DD. */
  checkIn: string;
  checkOut: string;
  nights: number;
  /** Settled to the Owner's Ripio account, in the Owner's own fiat. */
  amount: number;
  status: OwnerBookingStatus;
  /** ISO date; only when status is 'cancelada'. */
  canceledAt?: string;
  /** Only when 'cancelada': what went back to the Traveler (ADR-0004). */
  refunded?: number;
  isNew?: boolean;
}

/** Mock "today" is early November 2026, consistent with mock/traveler.ts. */
export const ownerBookings: OwnerBooking[] = [
  {
    id: 'b-lucas',
    traveler: { name: 'Lucas', origin: 'Florianópolis, Brasil', verified: true },
    lodgingId: 'casa-de-adobe',
    checkIn: '2026-11-20',
    checkOut: '2026-11-23',
    nights: 3,
    amount: 285_000,
    status: 'confirmada',
    isNew: true,
  },
  {
    id: 'b-martina',
    traveler: { name: 'Martina', origin: 'Montevideo, Uruguay', verified: true },
    lodgingId: 'cabana-vinas-del-sol',
    checkIn: '2026-11-03',
    checkOut: '2026-11-07',
    nights: 4,
    amount: 480_000,
    status: 'en-curso',
  },
  {
    id: 'b-camila',
    traveler: { name: 'Camila', origin: 'Santiago de Chile', verified: true },
    lodgingId: 'casa-de-adobe',
    checkIn: '2026-11-08',
    checkOut: '2026-11-11',
    nights: 3,
    amount: 285_000,
    status: 'cancelada',
    canceledAt: '2026-11-04',
    refunded: 142_500,
  },
  {
    id: 'b-sofia',
    traveler: { name: 'Sofía', origin: 'Buenos Aires, Argentina', verified: true },
    lodgingId: 'casa-de-adobe',
    checkIn: '2026-10-12',
    checkOut: '2026-10-15',
    nights: 3,
    amount: 285_000,
    status: 'completada',
  },
  {
    id: 'b-diego',
    traveler: { name: 'Diego', origin: 'Córdoba, Argentina', verified: true },
    lodgingId: 'cabana-vinas-del-sol',
    checkIn: '2026-09-18',
    checkOut: '2026-09-22',
    nights: 4,
    amount: 480_000,
    status: 'completada',
  },
];

/** November's net take: $285.000 + $480.000 settled − $142.500 refunded. */
export const monthNetARS = ownerBookings
  .filter((b) => b.checkIn.startsWith('2026-11'))
  .reduce((sum, b) => sum + (b.status === 'cancelada' ? -(b.refunded ?? 0) : b.amount), 0);
