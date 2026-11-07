'use client';

import { useCallback, useEffect, useState } from 'react';

import { WidgetCard } from '@/components/app/widget-card';
import { formatStayRange } from '@/lib/format';
import { useLodgings } from '@/lib/use-lodgings';

/** One row of GET /api/booking-requests (apps/api shape(), ADR-0010). */
interface BookingRequest {
  request_id: string;
  listing_slug?: string;
  checkin: string;
  checkout: string;
  guests: number;
  total_minor: number;
  total_display?: string;
  currency: string;
  status: string;
  booking_id: string | null;
  expires_at: string;
  created_at: string;
}

const humanize = (slug: string) => {
  const s = slug.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      requests: BookingRequest[];
      /** request_id currently confirming (paid retry in flight). */
      confirming: string | null;
      notice: string | null;
    };

/**
 * The Traveler's pending Booking requests (ADR-0010): drafts an external
 * agent created over MCP ("reservame X para tal fecha"). Confirming runs the
 * normal paid Booking flow server-side and links the draft to the Booking;
 * cancelling just withdraws the draft — no money ever moved.
 */
export function SolicitudesPanel() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const lodgings = useLodgings();

  const load = useCallback(() => {
    fetch('/api/booking-requests')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { requests?: BookingRequest[] }) => {
        setState({ kind: 'ready', requests: d.requests ?? [], confirming: null, notice: null });
      })
      .catch(() => {
        setState({ kind: 'error' });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirm(requestId: string) {
    setState((prev) => (prev.kind === 'ready' ? { ...prev, confirming: requestId, notice: null } : prev));
    try {
      const res = await fetch(`/api/booking-requests/${encodeURIComponent(requestId)}/confirm`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        details?: { currency?: string; missing?: string };
      };
      if (!res.ok) {
        const hint =
          data.code === 'insufficient_balance'
            ? `Te faltan fondos en tu saldo para confirmar esta reserva.`
            : data.code === 'funding_required'
              ? `Cargá tu saldo primero para confirmar esta reserva.`
              : (data.error ?? 'No pudimos confirmar tu reserva.');
        setState((prev) => (prev.kind === 'ready' ? { ...prev, confirming: null, notice: hint } : prev));
        return;
      }
      load();
    } catch {
      setState((prev) =>
        prev.kind === 'ready' ? { ...prev, confirming: null, notice: 'No pudimos confirmar tu reserva.' } : prev,
      );
    }
  }

  async function cancel(requestId: string) {
    const res = await fetch(`/api/booking-requests/${encodeURIComponent(requestId)}/cancel`, {
      method: 'POST',
    });
    if (res.ok) load();
  }

  if (state.kind === 'loading') {
    return (
      <WidgetCard title="Por confirmar">
        <ul aria-busy="true" aria-label="Cargando solicitudes" className="flex flex-col gap-2">
          {[0].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-2xl bg-sand/50 motion-reduce:animate-none" />
          ))}
        </ul>
      </WidgetCard>
    );
  }
  if (state.kind === 'error') return null;

  const pending = state.requests.filter((r) => r.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <WidgetCard title="Por confirmar">
      <p className="mb-2 text-xs text-ink-muted">
        Pedidos que llegaron por tus asistentes — revisá y confirmá los que quieras.
      </p>
      <ul className="-mr-1 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        {pending.map((r) => {
          const title = r.listing_slug
            ? (lodgings.find((l) => l.id === r.listing_slug)?.name ?? humanize(r.listing_slug))
            : 'Reserva pedida';
          const busy = state.confirming === r.request_id;
          return (
            <li
              key={r.request_id}
              className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{title}</p>
                <p className="truncate text-xs text-ink-muted">
                  <span className="font-mono">{formatStayRange(r.checkin.slice(0, 10), r.checkout.slice(0, 10))}</span>
                  {r.total_display && <span className="font-mono"> · {r.total_display}</span>}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => confirm(r.request_id)}
                    className="rounded-full bg-terra px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? 'Confirmando…' : 'Confirmar y pagar'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => cancel(r.request_id)}
                    className="text-xs font-medium text-ink-muted underline underline-offset-4 disabled:opacity-60"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {state.notice && (
        <p role="alert" className="mt-2 text-xs font-medium text-terra-deep">
          {state.notice}
        </p>
      )}
    </WidgetCard>
  );
}
