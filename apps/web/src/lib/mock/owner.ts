/** Mock Owner for the dashboard panel. Replaced by the account API later. */

import { ownerBySlug } from '@/lib/lodgings';

/**
 * The logged-in Owner: Ramón Guaymás. His Casa de Adobe is the Booking Lucas
 * confirms in the §4 scenario — here it shows up as money received.
 */
export const currentOwner = ownerBySlug('ramon-guaymas')!;

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
    checkIn: '2026-11-12',
    checkOut: '2026-11-15',
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
export const monthNetARS = 622_500;
