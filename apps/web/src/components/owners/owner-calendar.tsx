'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal, Spinner } from '@heroui/react';

import { ArrowLeftIcon } from '@/components/icons';
import { OwnerNightsCalendar } from '@/components/owners/owner-nights-calendar';
import type { BookingData } from '@/components/owners/reserva-card';
import { addDays, addMonths, daysInMonth, weekdayOf } from '@/lib/dates';
import { formatStayRange } from '@/lib/format';
import { bookingBarSpan } from '@/lib/owner-calendar';
import { isCancelled } from '@/lib/owner-bookings';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;

type NightStatus = 'open' | 'blocked' | 'booked';

/** The "today" the Owner sees: the browser's local date, like the night calendar. */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The bar colour for each Booking moment. */
function barClass(b: BookingData, today: string) {
  if (b.status === 'pending_payment') return 'border border-dashed border-amber-500 bg-amber-50 text-amber-900';
  if (b.checkout <= today || b.status === 'completed') return 'bg-sand text-ink';
  if (b.checkin <= today) return 'bg-terra-deep text-white';
  return 'bg-terra text-white';
}

/**
 * Every Lodging's month at a glance (owner-views §7): one row per Lodging,
 * one column per night. Bookings are bars with the Traveler's name; blocked
 * nights are striped. "Editar disponibilidad" opens that Lodging's night
 * calendar (OwnerNightsCalendar) to block or reopen nights.
 */
export function OwnerCalendar({
  lodgings,
  bookings,
}: {
  lodgings: { id: string; name: string }[];
  bookings: BookingData[];
}) {
  const [today] = useState(localToday);
  const [month, setMonth] = useState(() => monthOf(localToday()));
  const [blocked, setBlocked] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const lodgingKey = lodgings.map((l) => l.id).join(',');

  const load = useCallback(async () => {
    setLoading(true);
    const ids = lodgingKey ? lodgingKey.split(',') : [];
    const entries = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/owners/lodgings/${encodeURIComponent(id)}/nights`, {
            cache: 'no-store',
          });
          if (!res.ok) return [id, new Set<string>()] as const;
          const data = (await res.json()) as { nights?: { night: string; status: NightStatus }[] };
          return [
            id,
            new Set((data.nights ?? []).filter((n) => n.status === 'blocked').map((n) => n.night)),
          ] as const;
        } catch {
          return [id, new Set<string>()] as const;
        }
      }),
    );
    setBlocked(new Map(entries));
    setLoading(false);
  }, [lodgingKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const [year, monthIndex] = month.split('-').map(Number);
  const count = daysInMonth(month);
  const days = Array.from({ length: count }, (_, i) => addDays(month, i));
  const monthEnd = addDays(month, count); // exclusive
  const columns = `minmax(8rem, 11rem) repeat(${count}, minmax(1.75rem, 1fr))`;

  /** 1-based grid column of a night inside this month (column 1 is the name). */
  const col = (night: string) => days.indexOf(night) + 2;

  const visible = bookings.filter(
    (b) => !isCancelled(b.status) && b.checkin < monthEnd && b.checkout > month,
  );

  return (
    <div className="mt-4 rounded-card border border-sand bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => setMonth(addMonths(month, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-sand text-ink transition-colors hover:border-terra focus-visible:outline-2 focus-visible:outline-terra"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </button>
          <p aria-live="polite" className="min-w-36 text-center font-brand text-lg font-medium capitalize text-ink">
            {MONTHS[monthIndex - 1]} {year}
          </p>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => setMonth(addMonths(month, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-sand text-ink transition-colors hover:border-terra focus-visible:outline-2 focus-visible:outline-terra"
          >
            <ArrowLeftIcon className="h-4 w-4 rotate-180" />
          </button>
          {month !== monthOf(today) && (
            <button
              type="button"
              onClick={() => setMonth(monthOf(today))}
              className="ml-1 text-sm font-medium text-terra-deep underline underline-offset-4 hover:text-terra focus-visible:outline-2 focus-visible:outline-terra"
            >
              Hoy
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <Legend className="bg-terra" label="Próxima" />
          <Legend className="bg-terra-deep" label="En curso" />
          <Legend className="bg-sand" label="Pasada" />
          <Legend className="border border-dashed border-amber-500 bg-amber-50" label="Sin pagar" />
          <Legend className="blocked-stripes border border-amber-300" label="Bloqueada" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 p-8 text-sm text-ink-muted">
          <Spinner size="sm" color="current" />
          Cargando calendario…
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div role="table" aria-label={`Ocupación de ${MONTHS[monthIndex - 1]} ${year}`} className="min-w-[56rem]">
            {/* Day header */}
            <div role="row" className="grid" style={{ gridTemplateColumns: columns }}>
              <div role="columnheader" className="sticky left-0 z-20 bg-white" />
              {days.map((d) => {
                const isToday = d === today;
                const weekend = weekdayOf(d) >= 5;
                return (
                  <div
                    key={d}
                    role="columnheader"
                    aria-label={d}
                    className={`flex flex-col items-center pb-1 text-[11px] leading-tight ${
                      weekend ? 'text-ink' : 'text-ink-muted'
                    }`}
                  >
                    <span>{WEEKDAY_INITIALS[weekdayOf(d)]}</span>
                    <span
                      className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs ${
                        isToday ? 'bg-ink font-semibold text-white' : ''
                      }`}
                    >
                      {Number(d.slice(8))}
                    </span>
                  </div>
                );
              })}
            </div>

            {lodgings.map((l) => {
              const nightsBlocked = blocked.get(l.id) ?? new Set<string>();
              const rows = visible.filter((b) => b.listing?.slug === l.id);
              return (
                <div
                  key={l.id}
                  role="row"
                  className="grid border-t border-sand/70"
                  style={{ gridTemplateColumns: columns, gridTemplateRows: '3rem' }}
                >
                  <div
                    role="rowheader"
                    className="sticky left-0 z-20 flex flex-col justify-center gap-0.5 bg-white pr-3"
                    style={{ gridRow: 1, gridColumn: 1 }}
                  >
                    <span className="truncate text-sm font-medium text-ink">{l.name}</span>
                    <button
                      type="button"
                      onClick={() => setEditing(l)}
                      className="self-start text-xs font-medium text-terra-deep underline underline-offset-4 hover:text-terra focus-visible:outline-2 focus-visible:outline-terra"
                    >
                      Editar disponibilidad
                    </button>
                  </div>

                  {/* Background cells: weekends, past days, blocked nights */}
                  {days.map((d) => (
                    <div
                      key={d}
                      role="cell"
                      aria-label={nightsBlocked.has(d) ? `${d} bloqueada` : undefined}
                      style={{ gridRow: 1, gridColumn: col(d) }}
                      className={`border-l border-sand/40 ${
                        nightsBlocked.has(d)
                          ? 'blocked-stripes'
                          : d < today
                            ? 'bg-paper'
                            : weekdayOf(d) >= 5
                              ? 'bg-sand/20'
                              : ''
                      } ${d === today ? 'shadow-[inset_2px_0_0_var(--ink)]' : ''}`}
                    />
                  ))}

                  {/* Booking bars, clipped to this month */}
                  {rows.map((b) => {
                    const span = bookingBarSpan(b, month, monthEnd);
                    if (!span) return null;
                    const guest = b.guest_ref || 'Viajero';
                    const stay = formatStayRange(b.checkin, b.checkout);
                    return (
                      <div
                        key={b.id}
                        role="cell"
                        title={`${guest} · ${stay}`}
                        aria-label={`Reserva de ${guest}, ${stay}`}
                        style={{ gridRow: 1, gridColumn: `${span.startCol} / ${span.endCol}` }}
                        className={`z-10 my-2 flex items-center overflow-hidden px-2 text-xs font-medium ${barClass(b, today)} ${
                          b.checkin >= month ? 'ml-1 rounded-l-full' : ''
                        } ${b.checkout <= monthEnd ? 'mr-1 rounded-r-full' : ''}`}
                      >
                        <span className="truncate">{guest}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <Modal
          isOpen
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
              void load();
            }
          }}
        >
          <Modal.Backdrop>
            <Modal.Container placement="center">
              <Modal.Dialog className="bg-paper">
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading className="font-brand text-2xl font-medium text-ink">
                    {editing.name}
                  </Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <OwnerNightsCalendar listingId={editing.id} lodgingName={editing.name} />
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-3 w-5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
