import { addDays } from '@/lib/dates';

/** The fields of a Booking the Owner dashboard groups, pages and schedules. */
export interface OwnerBookingLike {
  id: string;
  checkin: string;
  checkout: string;
  status: string;
  currency: string;
  total_minor: number;
  service_fee_minor?: number;
  escrow_status?: string;
  cancel_deadline?: string | null;
}

export type BookingBucket = 'proximas' | 'en-curso' | 'pasadas' | 'canceladas';

export const BUCKETS: { id: BookingBucket; label: string }[] = [
  { id: 'proximas', label: 'Próximas' },
  { id: 'en-curso', label: 'En curso' },
  { id: 'pasadas', label: 'Pasadas' },
  { id: 'canceladas', label: 'Canceladas' },
];

const CANCELLED = new Set(['cancelled', 'cancelada', 'refunded']);
const COMPLETED = new Set(['completed', 'completada']);

export const isCancelled = (status: string) => CANCELLED.has(status);

/** Which tab of the Reservas list a Booking lives in, as of `today` (YYYY-MM-DD). */
export function bookingBucket(b: Pick<OwnerBookingLike, 'checkin' | 'checkout' | 'status'>, today: string): BookingBucket {
  if (CANCELLED.has(b.status)) return 'canceladas';
  if (COMPLETED.has(b.status) || b.checkout <= today) return 'pasadas';
  if (b.status === 'en-curso' || b.checkin <= today) return 'en-curso';
  return 'proximas';
}

/**
 * Bookings grouped per tab, each sorted the way the Owner reads it: upcoming
 * and current by arrival (soonest first), past and cancelled newest first.
 */
export function groupBookings<T extends OwnerBookingLike>(bookings: T[], today: string) {
  const groups: Record<BookingBucket, T[]> = {
    proximas: [],
    'en-curso': [],
    pasadas: [],
    canceladas: [],
  };
  for (const b of bookings) groups[bookingBucket(b, today)].push(b);
  const asc = (a: T, b: T) => a.checkin.localeCompare(b.checkin);
  const desc = (a: T, b: T) => b.checkin.localeCompare(a.checkin);
  groups.proximas.sort(asc);
  groups['en-curso'].sort(asc);
  groups.pasadas.sort(desc);
  groups.canceladas.sort(desc);
  return groups;
}

/** One page of `items` (1-based `page`, clamped into range). */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: current,
    pages,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + pageSize, items.length),
    total: items.length,
  };
}

/** One Escrow stage still owed to the Owner (ADR-0006). */
export interface PendingRelease {
  bookingId: string;
  /** The day the keeper releases it (YYYY-MM-DD). */
  date: string;
  amountMinor: number;
  stage: 'first' | 'second';
}

/**
 * Escrow stages not yet released, mirroring process_escrow_releases: half the
 * rental (total − Service fee) at the Cancellation deadline (cancel_deadline,
 * default check-in − 5), the rest 24 h after check-in. `released` is what
 * already went out per Booking (payments kind='release', status='sent'); once
 * escrow_status leaves 'funded' the first half counts as committed even if its
 * payment row is still in flight, and an open Claim holds the final stage
 * until Nomai resolves it (ADR-0006).
 */
export function pendingReleases(
  bookings: OwnerBookingLike[],
  released: Map<string, number>,
): PendingRelease[] {
  const out: PendingRelease[] = [];
  for (const b of bookings) {
    if (b.escrow_status !== 'funded' && b.escrow_status !== 'partially_released') continue;
    if (isCancelled(b.status) || b.status === 'pending_payment') continue;
    const rental = Math.max(0, b.total_minor - (b.service_fee_minor ?? 0));
    const already = released.get(b.id) ?? 0;
    const half = Math.floor(rental / 2);
    if (b.escrow_status === 'funded' && already < half) {
      out.push({
        bookingId: b.id,
        date: b.cancel_deadline?.slice(0, 10) ?? addDays(b.checkin, -5),
        amountMinor: half - already,
        stage: 'first',
      });
    }
    // The second stage is only ever the rest of the rental: half is already
    // committed once escrow_status leaves 'funded', whether or not its
    // payment row has landed yet (process_escrow_releases).
    const rest = rental - Math.max(already, half);
    // An open Claim holds the final release until Nomai resolves it (ADR-0006).
    if (rest > 0 && b.status !== 'claim_open') {
      out.push({ bookingId: b.id, date: addDays(b.checkin, 1), amountMinor: rest, stage: 'second' });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** One stage of the ADR-0006 Escrow timeline, as the Owner's card shows it. */
export interface ReleaseStage {
  stage: 'first' | 'second';
  /** The day the keeper releases it (YYYY-MM-DD). */
  date: string;
  amountMinor: number;
  state: 'released' | 'pending' | 'due' | 'held';
  /** Why a held stage waits — the copy differs (payout account vs Claim). */
  heldBy?: 'payout' | 'claim';
}

/**
 * The two Escrow stages of one Booking, mirroring process_escrow_releases:
 * half the rental (total − Service fee) at the Cancellation deadline, the rest
 * 24 h after check-in. Amounts floor the first stage and give it the remainder,
 * exactly like the SQL's `v_rental / 2` and `v_rental - v_rental / 2`.
 *
 * `releasedMinor` is what sent release payments already covered for the
 * Booking; once escrow_status leaves 'funded' the first half counts as
 * committed even if its payment row is still in flight (same rule as
 * pendingReleases). An open Claim holds the final stage until Nomai resolves
 * it, and an unverified payout address holds whatever has not gone out yet.
 * Cancelled/refunded and unpaid Bookings have no Escrow timeline at all.
 */
export function releaseStages(
  booking: OwnerBookingLike,
  releasedMinor: number,
  today: string,
  payoutVerified: boolean,
): ReleaseStage[] {
  if (isCancelled(booking.status) || booking.status === 'pending_payment') return [];
  const escrow = booking.escrow_status;
  if (escrow !== 'funded' && escrow !== 'partially_released' && escrow !== 'released' && escrow !== 'claimed') {
    return [];
  }

  const rental = Math.max(0, booking.total_minor - (booking.service_fee_minor ?? 0));
  const first = Math.floor(rental / 2);
  const rest = rental - first;
  const paid = Math.max(0, releasedMinor);
  const stages: ReleaseStage[] = [];

  const push = (stage: 'first' | 'second', date: string, amountMinor: number, released: boolean) => {
    if (amountMinor <= 0) return;
    if (released) {
      stages.push({ stage, date, amountMinor, state: 'released' });
      return;
    }
    if (stage === 'second' && booking.status === 'claim_open') {
      stages.push({ stage, date, amountMinor, state: 'held', heldBy: 'claim' });
      return;
    }
    if (!payoutVerified) {
      stages.push({ stage, date, amountMinor, state: 'held', heldBy: 'payout' });
      return;
    }
    stages.push({ stage, date, amountMinor, state: date <= today ? 'due' : 'pending' });
  };

  // A released/partially_released escrow proves the first half was committed
  // even when its payment row is not in the snapshot yet.
  const firstReleased = paid >= first || escrow === 'partially_released' || escrow === 'released';
  const secondReleased = paid >= rental || escrow === 'released';
  push('first', booking.cancel_deadline?.slice(0, 10) ?? addDays(booking.checkin, -5), first, firstReleased);
  push('second', addDays(booking.checkin, 1), rest, secondReleased);

  return stages;
}

/** The next payout day and everything released that day, in `currency`. */
export function nextPayout(
  bookings: OwnerBookingLike[],
  released: Map<string, number>,
  currency: string,
): { date: string; amountMinor: number; count: number } | null {
  const pending = pendingReleases(
    bookings.filter((b) => b.currency === currency),
    released,
  );
  if (!pending.length) return null;
  const date = pending[0].date;
  const sameDay = pending.filter((p) => p.date === date);
  return {
    date,
    amountMinor: sameDay.reduce((s, p) => s + p.amountMinor, 0),
    count: sameDay.length,
  };
}
