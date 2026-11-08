import { describe, expect, it } from 'vitest';

import { bookingBarSpan } from './owner-calendar';

const MONTH = '2026-11-01';
const MONTH_END = '2026-12-01';

describe('bookingBarSpan', () => {
  it('places a stay inside the month, column 2 being the 1st', () => {
    expect(bookingBarSpan({ checkin: '2026-11-20', checkout: '2026-11-23' }, MONTH, MONTH_END)).toEqual({
      startCol: 21,
      endCol: 24,
    });
  });

  it('clips a stay that started in the previous month', () => {
    expect(bookingBarSpan({ checkin: '2026-10-28', checkout: '2026-11-03' }, MONTH, MONTH_END)).toEqual({
      startCol: 2,
      endCol: 4,
    });
  });

  it('clips a stay that runs past the month', () => {
    expect(bookingBarSpan({ checkin: '2026-11-29', checkout: '2026-12-03' }, MONTH, MONTH_END)).toEqual({
      startCol: 30,
      endCol: 32,
    });
  });

  it('draws a stay checking out on the 1st of next month to the month edge', () => {
    expect(bookingBarSpan({ checkin: '2026-11-27', checkout: '2026-12-01' }, MONTH, MONTH_END)).toEqual({
      startCol: 28,
      endCol: 32,
    });
    expect(bookingBarSpan({ checkin: '2026-11-30', checkout: '2026-12-01' }, MONTH, MONTH_END)).toEqual({
      startCol: 31,
      endCol: 32,
    });
  });

  it('fills the month when the stay covers all of it', () => {
    expect(bookingBarSpan({ checkin: '2026-10-20', checkout: '2026-12-10' }, MONTH, MONTH_END)).toEqual({
      startCol: 2,
      endCol: 32,
    });
  });

  it('draws nothing when the stay has no night in the month', () => {
    // Checks out the morning the month starts.
    expect(bookingBarSpan({ checkin: '2026-10-30', checkout: '2026-11-01' }, MONTH, MONTH_END)).toBeNull();
    // Entirely before or after.
    expect(bookingBarSpan({ checkin: '2026-10-01', checkout: '2026-10-05' }, MONTH, MONTH_END)).toBeNull();
    expect(bookingBarSpan({ checkin: '2026-12-05', checkout: '2026-12-08' }, MONTH, MONTH_END)).toBeNull();
    // Zero nights.
    expect(bookingBarSpan({ checkin: '2026-11-10', checkout: '2026-11-10' }, MONTH, MONTH_END)).toBeNull();
  });
});
