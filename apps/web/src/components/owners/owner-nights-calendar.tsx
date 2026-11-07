'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner, toast } from '@heroui/react';

import { ArrowLeftIcon } from '@/components/icons';
import { addDays, addMonths, daysInMonth, weekdayOf } from '@/lib/dates';

type NightStatus = 'open' | 'blocked' | 'booked';

interface NightRow {
  night: string;
  status: NightStatus;
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`;

/**
 * The Owner's night calendar (owner-views §7): one Lodging's Availability
 * month by month — open, blocked and booked nights. Open and blocked nights
 * can be selected (shift-click extends the range) and then blocked or
 * unblocked; booked nights belong to a Booking and are never clickable.
 * Writes go through /api/owners/lodgings/:id/nights/* → apps/api → the
 * service_role RPCs; the table itself is never written from the browser.
 */
export function OwnerNightsCalendar({
  listingId,
  lodgingName,
}: {
  /** The Lodging's slug, as the Owner dashboard knows it. */
  listingId: string;
  lodgingName: string;
}) {
  const [today, setToday] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Map<string, NightStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'block' | 'unblock' | null>(null);
  const lastPicked = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/owners/lodgings/${encodeURIComponent(listingId)}/nights`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        toast('No pudimos cargar la disponibilidad.');
        return;
      }
      const data = (await res.json()) as { today?: string; nights?: NightRow[] };
      const start = data.today ?? new Date().toISOString().slice(0, 10);
      setToday(start);
      setMonth((current) => current ?? monthOf(start));
      setStatuses(new Map((data.nights ?? []).map((row) => [row.night, row.status])));
    } catch {
      toast('No pudimos cargar la disponibilidad.');
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOf = (night: string): NightStatus => statuses.get(night) ?? 'open';

  function pick(night: string, shift: boolean) {
    if (!today || night < today || statusOf(night) === 'booked') return;
    setSelected((prev) => {
      const next = new Set(prev);
      const anchor = lastPicked.current;
      if (shift && anchor && anchor !== night) {
        const [from, to] = anchor <= night ? [anchor, night] : [night, anchor];
        const adding = prev.has(anchor);
        for (let d = from; d <= to; d = addDays(d, 1)) {
          if (!today || d < today || statusOf(d) === 'booked') continue;
          if (adding) next.add(d);
          else next.delete(d);
        }
      } else if (next.has(night)) {
        next.delete(night);
      } else {
        next.add(night);
      }
      return next;
    });
    lastPicked.current = night;
  }

  async function act(action: 'block' | 'unblock') {
    if (selected.size === 0 || busy) return;
    setBusy(action);
    try {
      const res = await fetch(
        `/api/owners/lodgings/${encodeURIComponent(listingId)}/nights/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nights: [...selected].sort() }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        blocked?: string[];
        unblocked?: string[];
        skipped?: string[];
      };
      if (!res.ok) {
        toast(data.error ?? 'No pudimos guardar los cambios.');
        return;
      }

      const changed = (action === 'block' ? data.blocked : data.unblocked) ?? [];
      setStatuses((prev) => {
        const next = new Map(prev);
        for (const night of changed) next.set(night, action === 'block' ? 'blocked' : 'open');
        return next;
      });
      setSelected(new Set());
      lastPicked.current = null;

      const skipped = data.skipped?.length ?? 0;
      if (skipped > 0) {
        toast(
          skipped === 1
            ? 'Una de esas noches tiene una reserva y no se tocó.'
            : `${skipped} de esas noches tienen reserva y no se tocaron.`,
        );
      } else {
        toast(action === 'block' ? 'Noches bloqueadas' : 'Noches desbloqueadas');
      }
    } catch {
      toast('No pudimos guardar los cambios.');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !today) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-card border border-sand bg-white p-6 text-sm text-ink-muted">
        <Spinner size="sm" color="current" />
        Cargando disponibilidad…
      </div>
    );
  }
  if (!today || !month) return null;

  const [year, monthIndex] = month.split('-').map(Number);
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => addDays(month, i));
  const cells: (string | null)[] = [...Array<null>(weekdayOf(month)).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const blockable = [...selected].filter((n) => statusOf(n) === 'open').length;
  const unblockable = [...selected].filter((n) => statusOf(n) === 'blocked').length;

  return (
    <section
      aria-label={`Disponibilidad de ${lodgingName}`}
      className="rounded-card border border-sand bg-white p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-brand text-lg font-medium text-ink">Disponibilidad</h3>
        <p className="text-xs text-ink-muted">Tocá noches libres o bloqueadas · shift para un rango</p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={month <= monthOf(today)}
          onClick={() => setMonth(addMonths(month, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-sand bg-white text-ink transition-colors hover:border-terra disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <p aria-live="polite" className="font-brand text-base font-medium text-ink">
          {MONTHS[monthIndex - 1]} {year}
        </p>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => setMonth(addMonths(month, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-sand bg-white text-ink transition-colors hover:border-terra focus-visible:outline-2 focus-visible:outline-terra"
        >
          <ArrowLeftIcon className="h-4 w-4 rotate-180" />
        </button>
      </div>

      <table role="grid" className="mt-2 w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col" abbr={w} className="pb-1 text-center text-[11px] font-medium text-ink-muted">
                {w.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={i}>
              {week.map((night, j) => {
                if (!night) return <td key={j} />;
                const status = statusOf(night);
                const isPast = night < today;
                const isSelected = selected.has(night);
                const clickable = !isPast && status !== 'booked';
                const label = `${WEEKDAYS[weekdayOf(night)]} ${Number(night.slice(8))} de ${
                  MONTHS[monthIndex - 1]
                }, ${
                  status === 'booked' ? 'reservada' : status === 'blocked' ? 'bloqueada' : 'libre'
                }${isSelected ? ', seleccionada' : ''}`;
                return (
                  <td key={night} className="p-0.5">
                    <button
                      type="button"
                      data-night={night}
                      aria-label={label}
                      aria-pressed={isSelected}
                      aria-disabled={!clickable}
                      onClick={(e) => pick(night, e.shiftKey)}
                      className={`flex h-9 w-full items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-terra ${
                        isSelected
                          ? 'bg-terra font-semibold text-white'
                          : status === 'booked'
                            ? 'cursor-not-allowed bg-sand/60 text-ink-muted line-through'
                            : status === 'blocked'
                              ? 'border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200'
                              : isPast
                                ? 'cursor-not-allowed text-ink-muted/50'
                                : 'text-ink hover:bg-terra-soft'
                      } ${!clickable && !isSelected ? 'cursor-not-allowed' : ''}`}
                    >
                      {Number(night.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-full border border-sand bg-white" /> Libre
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-amber-200" /> Bloqueada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-sand" /> Reservada
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          isPending={busy === 'block'}
          isDisabled={blockable === 0 || busy !== null}
          onPress={() => act('block')}
        >
          {({ isPending }) => (
            <>
              {isPending && <Spinner color="current" size="sm" />}
              Bloquear{blockable > 0 ? ` (${blockable})` : ''}
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isPending={busy === 'unblock'}
          isDisabled={unblockable === 0 || busy !== null}
          onPress={() => act('unblock')}
        >
          {({ isPending }) => (
            <>
              {isPending && <Spinner color="current" size="sm" />}
              Desbloquear{unblockable > 0 ? ` (${unblockable})` : ''}
            </>
          )}
        </Button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              lastPicked.current = null;
            }}
            className="text-xs font-medium text-ink-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
          >
            Limpiar selección
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Una noche bloqueada no se puede reservar; las reservadas no se tocan.
      </p>
    </section>
  );
}
