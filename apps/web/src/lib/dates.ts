/** Calendar-date helpers over ISO `YYYY-MM-DD` strings, in UTC so no timezone shifts a night. */

const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const format = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** The nights of a stay: check-in included, check-out excluded. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  for (let night = checkIn; night < checkOut; night = addDays(night, 1)) nights.push(night);
  return nights;
}

/** `'2026-11'` → first day `'2026-11-01'`, shifted by `delta` months. */
export function addMonths(monthStart: string, delta: number): string {
  const d = parse(monthStart);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return format(d);
}

/** Monday-first weekday index, 0 = lunes … 6 = domingo. */
export function weekdayOf(iso: string): number {
  return (parse(iso).getUTCDay() + 6) % 7;
}

export function daysInMonth(monthStart: string): number {
  const d = parse(monthStart);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
