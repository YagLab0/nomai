import { describe, expect, it } from 'vitest';

import {
  bookingBucket,
  groupBookings,
  nextPayout,
  paginate,
  pendingReleases,
  type OwnerBookingLike,
} from './owner-bookings';

const TODAY = '2026-11-08';

const booking = (over: Partial<OwnerBookingLike>): OwnerBookingLike => ({
  id: 'b1',
  checkin: '2026-11-20',
  checkout: '2026-11-23',
  status: 'confirmed',
  currency: 'ARS',
  total_minor: 1_100,
  service_fee_minor: 100,
  escrow_status: 'funded',
  ...over,
});

describe('bookingBucket', () => {
  it('sorts each status/date into its tab', () => {
    expect(bookingBucket(booking({}), TODAY)).toBe('proximas');
    expect(bookingBucket(booking({ status: 'pending_payment' }), TODAY)).toBe('proximas');
    expect(bookingBucket(booking({ checkin: '2026-11-07', checkout: '2026-11-10' }), TODAY)).toBe('en-curso');
    expect(bookingBucket(booking({ checkin: '2026-11-08', checkout: '2026-11-10' }), TODAY)).toBe('en-curso');
    expect(bookingBucket(booking({ checkin: '2026-11-05', checkout: '2026-11-08' }), TODAY)).toBe('pasadas');
    expect(bookingBucket(booking({ status: 'completed' }), TODAY)).toBe('pasadas');
    expect(bookingBucket(booking({ status: 'cancelled' }), TODAY)).toBe('canceladas');
    expect(bookingBucket(booking({ status: 'refunded' }), TODAY)).toBe('canceladas');
  });
});

describe('groupBookings', () => {
  it('orders upcoming soonest first and past newest first', () => {
    const g = groupBookings(
      [
        booking({ id: 'late', checkin: '2026-12-20', checkout: '2026-12-22' }),
        booking({ id: 'soon', checkin: '2026-11-10', checkout: '2026-11-12' }),
        booking({ id: 'old', checkin: '2026-09-01', checkout: '2026-09-03' }),
        booking({ id: 'older', checkin: '2026-08-01', checkout: '2026-08-03' }),
      ],
      TODAY,
    );
    expect(g.proximas.map((b) => b.id)).toEqual(['soon', 'late']);
    expect(g.pasadas.map((b) => b.id)).toEqual(['old', 'older']);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 12 }, (_, i) => i);
  it('slices pages and reports the range', () => {
    expect(paginate(items, 1, 5)).toMatchObject({ items: [0, 1, 2, 3, 4], pages: 3, from: 1, to: 5, total: 12 });
    expect(paginate(items, 3, 5)).toMatchObject({ items: [10, 11], from: 11, to: 12 });
  });
  it('clamps out-of-range pages and handles empty lists', () => {
    expect(paginate(items, 9, 5).page).toBe(3);
    expect(paginate([], 1, 5)).toMatchObject({ items: [], page: 1, pages: 1, from: 0, to: 0 });
  });
});

describe('pendingReleases / nextPayout', () => {
  it('splits a funded rental in two stages: deadline and check-in + 1', () => {
    expect(pendingReleases([booking({})], new Map())).toEqual([
      { bookingId: 'b1', date: '2026-11-15', amountMinor: 500, stage: 'first' },
      { bookingId: 'b1', date: '2026-11-21', amountMinor: 500, stage: 'second' },
    ]);
  });

  it('uses the stored cancel_deadline when present', () => {
    const [first] = pendingReleases([booking({ cancel_deadline: '2026-11-14' })], new Map());
    expect(first.date).toBe('2026-11-14');
  });

  it('only owes the remainder once partially released', () => {
    const r = pendingReleases(
      [booking({ escrow_status: 'partially_released' })],
      new Map([['b1', 500]]),
    );
    expect(r).toEqual([{ bookingId: 'b1', date: '2026-11-21', amountMinor: 500, stage: 'second' }]);
  });

  it('assumes the first half is committed as soon as escrow left funded', () => {
    // The release payment row may lag behind escrow_status: never re-promise
    // the first half as the final stage.
    const r = pendingReleases([booking({ escrow_status: 'partially_released' })], new Map());
    expect(r).toEqual([{ bookingId: 'b1', date: '2026-11-21', amountMinor: 500, stage: 'second' }]);
  });

  it('holds the final release while a Claim is open (ADR-0006)', () => {
    const r = pendingReleases(
      [booking({ escrow_status: 'partially_released', status: 'claim_open' })],
      new Map([['b1', 500]]),
    );
    expect(r).toEqual([]);
  });

  it('owes nothing for cancelled, unpaid or fully released Bookings', () => {
    expect(
      pendingReleases(
        [
          booking({ id: 'c', status: 'cancelled' }),
          booking({ id: 'p', status: 'pending_payment' }),
          booking({ id: 'r', escrow_status: 'released' }),
        ],
        new Map(),
      ),
    ).toEqual([]);
  });

  it('sums every release falling on the earliest day, in one currency', () => {
    const next = nextPayout(
      [
        booking({ id: 'a' }),
        booking({ id: 'b' }),
        booking({ id: 'usd', currency: 'USD', checkin: '2026-11-10' }),
      ],
      new Map(),
      'ARS',
    );
    expect(next).toEqual({ date: '2026-11-15', amountMinor: 1_000, count: 2 });
    expect(nextPayout([], new Map(), 'ARS')).toBeNull();
  });
});
