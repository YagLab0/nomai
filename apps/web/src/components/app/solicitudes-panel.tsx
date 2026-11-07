'use client';

import { useCallback, useEffect, useState } from 'react';

import { WidgetCard } from '@/components/app/widget-card';
import { formatStayRange } from '@/lib/format';
import { useLodgings } from '@/lib/use-lodgings';

/** One row of GET /api/booking-requests (apps/api shape(), ADR-0010). */
interface BookingRequest {
  request_id: string;
  listing_slug?: string;
  origin: string;
  checkin: string | null;
  checkout: string | null;
  guests: number | null;
  total_minor: number | null;
  total_display?: string;
  currency: string | null;
  status: string;
  booking_id: string | null;
  expires_at: string;
  created_at: string;
}

const humanize = (slug: string) => {
  const s = slug.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const ORIGIN_LABEL: Record<string, string> = {
  mcp: 'Agendado por tu asistente',
  app: 'Agendado por vos',
  agent: 'Agendado por Nomito',
};

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | {
      kind: 'ready';
      requests: BookingRequest[];
      /** request_id with a paid retry or completion in flight. */
      busy: string | null;
      notice: string | null;
      /** request_id whose inline date form is open. */
      completing: string | null;
      draft: { checkin: string; checkout: string; guests: string };
    };

/**
 * The Traveler's pending Booking requests (ADR-0010): ideas an agent saved
 * with only the place ("agendame X"), drafts ready to pay, and paid ones
 * linked to their Booking. Confirming runs the normal paid Booking flow
 * server-side and links the draft to the Booking; completing an idea freezes
 * a fresh quote and flips it to ready-to-pay.
 */
export function SolicitudesPanel() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const lodgings = useLodgings();

  const load = useCallback(() => {
    fetch('/api/booking-requests')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { requests?: BookingRequest[] }) => {
        setState({
          kind: 'ready',
          requests: d.requests ?? [],
          busy: null,
          notice: null,
          completing: null,
          draft: { checkin: '', checkout: '', guests: '2' },
        });
      })
      .catch(() => {
        setState({ kind: 'error' });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setBusy(requestId: string | null, notice: string | null = null) {
    setState((prev) => (prev.kind === 'ready' ? { ...prev, busy: requestId, notice } : prev));
  }

  async function confirm(requestId: string) {
    setBusy(requestId);
    try {
      const res = await fetch(`/api/booking-requests/${encodeURIComponent(requestId)}/confirm`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        const hint =
          data.code === 'insufficient_balance'
            ? `Te faltan fondos en tu saldo para confirmar esta reserva.`
            : data.code === 'funding_required'
              ? `Cargá tu saldo primero para confirmar esta reserva.`
              : (data.error ?? 'No pudimos confirmar tu reserva.');
        setBusy(null, hint);
        return;
      }
      load();
    } catch {
      setBusy(null, 'No pudimos confirmar tu reserva.');
    }
  }

  async function complete(requestId: string) {
    if (state.kind !== 'ready') return;
    const { checkin, checkout, guests } = state.draft;
    const n = Number.parseInt(guests, 10);
    if (!checkin || !checkout || !Number.isInteger(n) || n < 1) {
      setBusy(null, 'Completá fechas válidas y cantidad de huéspedes.');
      return;
    }
    setBusy(requestId);
    try {
      const res = await fetch(`/api/booking-requests/${encodeURIComponent(requestId)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkin, checkout, guests: n }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setBusy(null, data.error ?? 'No pudimos completar tu pedido.');
        return;
      }
      load();
    } catch {
      setBusy(null, 'No pudimos completar tu pedido.');
    }
  }

  async function cancel(requestId: string) {
    setBusy(requestId);
    const res = await fetch(`/api/booking-requests/${encodeURIComponent(requestId)}/cancel`, {
      method: 'POST',
    });
    if (res.ok) load();
    else setBusy(null, 'No pudimos descartar el pedido.');
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

  const visible = state.requests.filter((r) => r.status === 'idea' || r.status === 'pending');
  const paid = state.requests.filter((r) => r.status === 'confirmed');
  if (visible.length === 0 && paid.length === 0) return null;

  return (
    <WidgetCard title="Por confirmar">
      <p className="mb-2 text-xs text-ink-muted">
        Pedidos que llegaron por tus asistentes — completá los datos o confirmá los que quieras.
      </p>
      <ul className="-mr-1 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        {visible.map((r) => {
          const title = r.listing_slug
            ? (lodgings.find((l) => l.id === r.listing_slug)?.name ?? humanize(r.listing_slug))
            : 'Reserva pedida';
          const busy = state.busy === r.request_id;
          const isIdea = r.status === 'idea';
          const completing = state.completing === r.request_id;
          return (
            <li
              key={r.request_id}
              className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50/50 px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{title}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {ORIGIN_LABEL[r.origin] ?? 'Agendado'}
                    {!isIdea && r.checkin && r.checkout && (
                      <span className="font-mono">
                        {' '}
                        · {formatStayRange(r.checkin.slice(0, 10), r.checkout.slice(0, 10))}
                      </span>
                    )}
                    {!isIdea && r.total_display && <span className="font-mono"> · {r.total_display}</span>}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {isIdea ? 'Faltan datos' : 'Listo para pagar'}
                </span>
              </div>
              {isIdea && !completing && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setState((prev) =>
                        prev.kind === 'ready' ? { ...prev, completing: r.request_id } : prev,
                      )
                    }
                    className="rounded-full bg-terra px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Completar datos
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
              )}
              {isIdea && completing && (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1 text-xs text-ink-muted">
                      Llegada
                      <input
                        type="date"
                        value={state.draft.checkin}
                        onChange={(e) =>
                          setState((prev) =>
                            prev.kind === 'ready'
                              ? { ...prev, draft: { ...prev.draft, checkin: e.target.value } }
                              : prev,
                          )
                        }
                        className="rounded-lg border border-sand bg-white px-2 py-1 text-xs text-ink"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-ink-muted">
                      Salida
                      <input
                        type="date"
                        value={state.draft.checkout}
                        onChange={(e) =>
                          setState((prev) =>
                            prev.kind === 'ready'
                              ? { ...prev, draft: { ...prev.draft, checkout: e.target.value } }
                              : prev,
                          )
                        }
                        className="rounded-lg border border-sand bg-white px-2 py-1 text-xs text-ink"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-ink-muted">
                      Huéspedes
                      <input
                        type="number"
                        min={1}
                        value={state.draft.guests}
                        onChange={(e) =>
                          setState((prev) =>
                            prev.kind === 'ready'
                              ? { ...prev, draft: { ...prev.draft, guests: e.target.value } }
                              : prev,
                          )
                        }
                        className="rounded-lg border border-sand bg-white px-2 py-1 text-xs text-ink"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => complete(r.request_id)}
                      className="rounded-full bg-terra px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? 'Cotizando…' : 'Ver precio'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setState((prev) =>
                          prev.kind === 'ready' ? { ...prev, completing: null } : prev,
                        )
                      }
                      className="text-xs font-medium text-ink-muted underline underline-offset-4 disabled:opacity-60"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
              {!isIdea && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
              )}
            </li>
          );
        })}
        {paid.map((r) => {
          const title = r.listing_slug
            ? (lodgings.find((l) => l.id === r.listing_slug)?.name ?? humanize(r.listing_slug))
            : 'Reserva pedida';
          return (
            <li
              key={r.request_id}
              className="flex items-center gap-3 rounded-2xl border border-sand bg-white px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{title}</p>
                <p className="truncate text-xs text-ink-muted">
                  {ORIGIN_LABEL[r.origin] ?? 'Agendado'}
                  {r.checkin && r.checkout && (
                    <span className="font-mono">
                      {' '}
                      · {formatStayRange(r.checkin.slice(0, 10), r.checkout.slice(0, 10))}
                    </span>
                  )}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-agua-soft px-2 py-0.5 text-xs font-medium text-agua">
                Pagado en nomai
              </span>
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
