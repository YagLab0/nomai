'use client';

import { useEffect, useState } from 'react';

import { WidgetCard } from '@/components/app/widget-card';
import { formatStayRange } from '@/lib/format';
import { useLodgings } from '@/lib/use-lodgings';

/** One row of GET /bookings (apps/api BookingSummary). */
interface BookingSummary {
  booking_id: string;
  listing_slug: string;
  status: string;
  checkin: string;
  checkout: string;
  total_display: string;
}

type Tone = 'agua' | 'terra' | 'amber' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  agua: 'bg-agua-soft text-agua',
  terra: 'bg-terra-soft text-terra-deep',
  amber: 'bg-amber-100 text-amber-800',
  neutral: 'bg-sand/60 text-ink-muted',
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_payment: { label: 'Pago pendiente', tone: 'amber' },
  confirmed: { label: 'Confirmada', tone: 'agua' },
  in_progress: { label: 'En curso', tone: 'terra' },
  claim_open: { label: 'Reclamo abierto', tone: 'amber' },
  completed: { label: 'Finalizada', tone: 'neutral' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  refunded: { label: 'Reembolsada', tone: 'neutral' },
};

const humanize = (slug: string) => {
  const s = slug.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; bookings: BookingSummary[] };

/** The signed-in Traveler's Bookings, read through /api/bookings. */
export function ReservasPanel() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const lodgings = useLodgings();

  useEffect(() => {
    let alive = true;
    fetch('/api/bookings')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { bookings?: BookingSummary[] }) => {
        if (alive) setState({ kind: 'ready', bookings: d.bookings ?? [] });
      })
      .catch(() => {
        if (alive) setState({ kind: 'error' });
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <WidgetCard title="Mis reservas">
      {state.kind === 'loading' && (
        <ul aria-busy="true" aria-label="Cargando reservas" className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-2xl bg-sand/50 motion-reduce:animate-none" />
          ))}
        </ul>
      )}
      {state.kind === 'error' && <p className="text-xs text-ink-muted">No pudimos cargar tus reservas.</p>}
      {state.kind === 'ready' && state.bookings.length === 0 && (
        <p className="text-sm text-ink-muted">Todavía no tenés reservas — pedile a Nomito que te encuentre algo</p>
      )}
      {state.kind === 'ready' && state.bookings.length > 0 && (
        <ul className="-mr-1 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {state.bookings.map((b) => {
            const status = STATUS[b.status] ?? { label: humanize(b.status), tone: 'neutral' as const };
            const title = lodgings.find((l) => l.id === b.listing_slug)?.name ?? humanize(b.listing_slug);
            return (
              <li
                key={b.booking_id}
                className="flex items-center gap-3 rounded-2xl border border-sand bg-white px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{title}</p>
                  <p className="truncate text-xs text-ink-muted">
                    <span className="font-mono">{formatStayRange(b.checkin.slice(0, 10), b.checkout.slice(0, 10))}</span>
                    {b.total_display && <span className="font-mono"> · {b.total_display}</span>}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[status.tone]}`}>
                  {status.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
