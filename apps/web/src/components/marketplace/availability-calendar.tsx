'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { ArrowLeftIcon } from '@/components/icons';
import { addDays, addMonths, daysInMonth, weekdayOf } from '@/lib/dates';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;

/**
 * The Lodging's Availability (traveler-views §16): one month at a time,
 * occupied nights marked, check-in then check-out. A check-out past the first
 * taken night after the check-in can't be picked, so a range never crosses
 * one — checking out the morning the next guest arrives is fine. Arrow keys
 * move between days (roving focus), Enter picks.
 */
export function AvailabilityCalendar({
  occupied,
  today,
  checkIn,
  checkOut,
  onChange,
}: {
  /** ISO nights taken by Upcoming Bookings, sorted. */
  occupied: string[];
  today: string;
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
}) {
  const headingId = useId();
  const [month, setMonth] = useState(monthOf(checkIn ?? today));
  const [focused, setFocused] = useState(checkIn ?? today);
  const moveFocus = useRef(false);
  const grid = useRef<HTMLTableElement>(null);

  const taken = useMemo(() => new Set(occupied), [occupied]);
  const choosingCheckOut = checkIn !== null && checkOut === null;
  /** The check-out can be at most the first taken night after the check-in. */
  const limit = choosingCheckOut ? occupied.find((n) => n > checkIn) : undefined;

  const canCheckIn = (d: string) => d >= today && !taken.has(d);
  const canCheckOut = (d: string) => choosingCheckOut && d > checkIn && (!limit || d <= limit);
  const enabled = (d: string) => (choosingCheckOut ? canCheckOut(d) || (d <= checkIn && canCheckIn(d)) : canCheckIn(d));

  function pick(d: string) {
    if (!enabled(d)) return;
    if (canCheckOut(d)) onChange(checkIn, d);
    else onChange(d, null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = KEY_STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    const next = addDays(focused, step);
    moveFocus.current = true;
    setFocused(next);
    setMonth(monthOf(next));
  }

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, month]);

  const [year, monthIndex] = month.split('-').map(Number);
  const lead = weekdayOf(month);
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => addDays(month, i));
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  // Roving tab stop: the focused day when it's in view, else the month's first day.
  const tabStop = monthOf(focused) === month ? focused : month;

  const changeMonth = (delta: number) => {
    const next = addMonths(month, delta);
    setMonth(next);
    setFocused(next < today ? today : next);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={month <= monthOf(today)}
          onClick={() => changeMonth(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-sand bg-white text-ink transition-colors hover:border-terra disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <h3 id={headingId} aria-live="polite" className="font-brand text-lg font-medium text-ink">
          {MONTHS[monthIndex - 1]} {year}
        </h3>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => changeMonth(1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-sand bg-white text-ink transition-colors hover:border-terra focus-visible:outline-2 focus-visible:outline-terra"
        >
          <ArrowLeftIcon className="h-4 w-4 rotate-180" />
        </button>
      </div>

      <table ref={grid} role="grid" aria-labelledby={headingId} className="mt-3 w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col" abbr={w} className="pb-1 text-center text-xs font-medium text-ink-muted">
                {w.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody onKeyDown={onKeyDown}>
          {weeks.map((week, i) => (
            <tr key={i}>
              {week.map((d, j) => {
                if (!d) return <td key={j} />;
                const isTaken = taken.has(d);
                const isEdge = d === checkIn || d === checkOut;
                const inStay = checkIn !== null && checkOut !== null && d > checkIn && d < checkOut;
                const label = [
                  `${WEEKDAYS[weekdayOf(d)]} ${Number(d.slice(8))} de ${MONTHS[monthIndex - 1]}`,
                  isTaken && 'ocupada',
                  d === checkIn && 'llegada',
                  d === checkOut && 'salida',
                ]
                  .filter(Boolean)
                  .join(', ');
                return (
                  <td key={d} aria-selected={isEdge || inStay} className="p-0.5">
                    <button
                      type="button"
                      data-date={d}
                      tabIndex={d === tabStop ? 0 : -1}
                      aria-label={label}
                      aria-disabled={!enabled(d)}
                      onClick={() => pick(d)}
                      onFocus={() => setFocused(d)}
                      className={`flex h-10 w-full items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-terra ${
                        isEdge
                          ? 'bg-terra font-semibold text-white'
                          : inStay
                            ? 'bg-terra-soft text-terra-deep'
                            : isTaken
                              ? 'bg-sand/50 text-ink-muted line-through'
                              : d < today
                                ? 'text-ink-muted/50'
                                : 'text-ink'
                      } ${enabled(d) && !isEdge ? 'hover:bg-terra-soft' : ''} ${!enabled(d) ? 'cursor-not-allowed' : ''}`}
                    >
                      {Number(d.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-sand" /> Ocupada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-terra" /> Tu estadía
        </span>
      </p>
    </div>
  );
}
