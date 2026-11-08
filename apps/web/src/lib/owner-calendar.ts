/** A Booking's night span, as the consolidated calendar draws it. */
export interface CalendarBookingLike {
  checkin: string;
  checkout: string;
}

/** Whole days between two ISO dates, in UTC so no timezone shifts a night. */
const dayDiff = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );

/**
 * The grid columns a Booking's bar occupies in a month grid whose column 1 is
 * the Lodging name and column 2 is the month's first night (owner-views §7).
 *
 * A stay is a range of nights — check-in included, check-out excluded — so a
 * Booking that starts before the month or ends after it is clipped to the
 * month instead of overflowing the grid. `endCol` is exclusive, the way
 * `gridColumn: 'start / end'` reads it. Returns null when the stay has no
 * night in this month.
 */
export function bookingBarSpan(
  booking: CalendarBookingLike,
  monthStart: string,
  monthEnd: string,
): { startCol: number; endCol: number } | null {
  // Clamp to the month; check-out is exclusive, so it is the end line.
  const first = booking.checkin > monthStart ? booking.checkin : monthStart;
  const last = booking.checkout < monthEnd ? booking.checkout : monthEnd;
  if (first >= last) return null;

  const startIndex = dayDiff(monthStart, first);
  const endIndex = dayDiff(monthStart, last);
  return { startCol: startIndex + 2, endCol: endIndex + 2 };
}
