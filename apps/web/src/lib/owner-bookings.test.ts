import { describe, expect, it } from 'vitest';

import {
  bookingBucket,
  groupBookings,
  nextPayout,
  paginate,
  pendingReleases,
  releaseStages,
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

describe('releaseStages', () => {
  it('shows both stages as pending while their dates are ahead', () => {
    expect(releaseStages(booking({}), 0, TODAY, true)).toEqual([
      { stage: 'first', date: '2026-11-15', amountMinor: 500, state: 'pending' },
      { stage: 'second', date: '2026-11-21', amountMinor: 500, state: 'pending' },
    ]);
  });

  it('marks a stage due once its date has arrived (keeper runs next)', () => {
    expect(releaseStages(booking({}), 0, '2026-11-15', true)).toEqual([
      { stage: 'first', date: '2026-11-15', amountMinor: 500, state: 'due' },
      { stage: 'second', date: '2026-11-21', amountMinor: 500, state: 'pending' },
    ]);
    expect(releaseStages(booking({}), 0, '2026-11-21', true).map((s) => s.state)).toEqual([
      'due',
      'due',
    ]);
  });

  it('marks the first stage released when its sent payment covered it', () => {
    expect(releaseStages(booking({}), 500, TODAY, true)).toEqual([
      { stage: 'first', date: '2026-11-15', amountMinor: 500, state: 'released' },
      { stage: 'second', date: '2026-11-21', amountMinor: 500, state: 'pending' },
    ]);
    expect(releaseStages(booking({}), 1_000, TODAY, true).map((s) => s.state)).toEqual([
      'released',
      'released',
    ]);
  });

  it('assumes the first half once escrow left funded, even without its row', () => {
    expect(releaseStages(booking({ escrow_status: 'partially_released' }), 0, TODAY, true)).toEqual([
      { stage: 'first', date: '2026-11-15', amountMinor: 500, state: 'released' },
      { stage: 'second', date: '2026-11-21', amountMinor: 500, state: 'pending' },
    ]);
    expect(releaseStages(booking({ escrow_status: 'released', status: 'completed' }), 0, TODAY, true).map((s) => s.state)).toEqual([
      'released',
      'released',
    ]);
  });

  it('holds whichever stage cannot be sent while the payout is unverified', () => {
    expect(releaseStages(booking({}), 0, TODAY, false)).toEqual([
      { stage: 'first', date: '2026-11-15', amountMinor: 500, state: 'held', heldBy: 'payout' },
      { stage: 'second', date: '2026-11-21', amountMinor: 500, state: 'held', heldBy: 'payout' },
    ]);
    // Already released money stays released; only the remainder is held.
    expect(releaseStages(booking({}), 500, TODAY, false)[1]).toEqual({
      stage: 'second',
      date: '2026-11-21',
      amountMinor: 500,
      state: 'held',
      heldBy: 'payout',
    });
  });

  it('holds the final stage while a Claim is open (ADR-0006)', () => {
    expect(
      releaseStages(booking({ status: 'claim_open', escrow_status: 'claimed' }), 500, TODAY, true),
    ).toEqual([
      { stage: 'first', date: '2026-11-15', amountMinor: 500, state: 'released' },
      { stage: 'second', date: '2026-11-21', amountMinor: 500, state: 'held', heldBy: 'claim' },
    ]);
  });

  it('has no stages for cancelled, refunded, unpaid or unfunded Bookings', () => {
    expect(releaseStages(booking({ status: 'cancelled' }), 0, TODAY, true)).toEqual([]);
    expect(releaseStages(booking({ status: 'refunded' }), 0, TODAY, true)).toEqual([]);
    expect(releaseStages(booking({ status: 'pending_payment', escrow_status: 'unfunded' }), 0, TODAY, true)).toEqual([]);
    expect(releaseStages(booking({ escrow_status: 'unfunded' }), 0, TODAY, true)).toEqual([]);
  });

  it('mirrors process_escrow_releases rounding: floor the first half, keep the rest', () => {
    const stages = releaseStages(booking({ total_minor: 1_101 }), 0, TODAY, true);
    expect(stages.map((s) => s.amountMinor)).toEqual([500, 501]);
  });

  it('uses the stored cancel_deadline and the check-in + 1 day for stage two', () => {
    const stages = releaseStages(booking({ cancel_deadline: '2026-11-14' }), 0, TODAY, true);
    expect(stages.map((s) => s.date)).toEqual(['2026-11-14', '2026-11-21']);
  });
});
