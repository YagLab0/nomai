'use client';

import { useMemo, useState } from 'react';

import { ReservaCard, type BookingData } from '@/components/owners/reserva-card';
import { BUCKETS, groupBookings, paginate, type BookingBucket } from '@/lib/owner-bookings';

const PAGE_SIZE = 5;

/**
 * The Owner's Reservas: one tab per moment (Próximas · En curso · Pasadas ·
 * Canceladas), five cards per page. Opens on the first tab with something
 * in it, so a fresh panel lands on the next arrivals.
 */
export function OwnerBookings({
  bookings,
  today,
  reviewedIds,
  unread,
  released,
  payoutVerified,
}: {
  bookings: BookingData[];
  today: string;
  reviewedIds?: Set<string>;
  unread?: Map<string, number>;
  /** Sent release payments per Booking — the Escrow timeline (ADR-0006). */
  released?: Map<string, number>;
  /** The Owner's Ripio address is verified; else the keeper holds releases. */
  payoutVerified?: boolean;
}) {
  const groups = useMemo(() => groupBookings(bookings, today), [bookings, today]);
  const firstWithItems = BUCKETS.find((b) => groups[b.id].length)?.id ?? 'proximas';
  const [tab, setTab] = useState<BookingBucket | null>(null);
  const [page, setPage] = useState(1);
  const active = tab ?? firstWithItems;
  const view = paginate(groups[active], page, PAGE_SIZE);

  // A new tab starts on its first page.
  function selectTab(next: BookingBucket) {
    setTab(next);
    setPage(1);
  }

  function goTo(next: number) {
    setPage(next);
    document.getElementById('reservas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div role="tablist" aria-label="Filtrar reservas" className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => {
          const selected = b.id === active;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              id={`reservas-tab-${b.id}`}
              aria-selected={selected}
              aria-controls="reservas-panel"
              onClick={() => selectTab(b.id)}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-terra ${
                selected
                  ? 'border-terra bg-terra text-white'
                  : 'border-sand bg-white text-ink hover:border-terra/50'
              }`}
            >
              {b.label}
              <span
                className={`font-mono text-xs ${selected ? 'text-white/80' : 'text-ink-muted'}`}
              >
                {groups[b.id].length}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="reservas-panel"
        role="tabpanel"
        aria-labelledby={`reservas-tab-${active}`}
        tabIndex={0}
        className="flex flex-col gap-4 focus-visible:outline-2 focus-visible:outline-terra"
      >
        {view.items.length > 0 ? (
          view.items.map((b) => (
            <ReservaCard
              key={b.id}
              booking={b}
              alreadyReviewed={reviewedIds?.has(b.id)}
              unreadMessages={unread?.get(b.id) ?? 0}
              releasedMinor={released?.get(b.id) ?? 0}
              payoutVerified={payoutVerified ?? false}
              today={today}
            />
          ))
        ) : (
          <div className="rounded-card border border-dashed border-sand bg-white/60 p-8 text-center text-ink-muted">
            {bookings.length === 0 ? (
              <>
                <p className="font-medium text-ink">Aún no hay reservas registradas</p>
                <p className="mt-1 text-sm">
                  Cuando los viajeros reserven con Nomito, aparecerán automáticamente acá.
                </p>
              </>
            ) : (
              <p className="font-medium text-ink">
                No hay reservas {BUCKETS.find((b) => b.id === active)?.label.toLowerCase()}.
              </p>
            )}
          </div>
        )}
      </div>

      {view.pages > 1 && (
        <nav
          aria-label="Páginas de reservas"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-ink-muted">
            {view.from}–{view.to} de {view.total}
          </p>
          <div className="flex items-center gap-1">
            <PageButton disabled={view.page === 1} onClick={() => goTo(view.page - 1)}>
              Anterior
            </PageButton>
            {Array.from({ length: view.pages }, (_, i) => i + 1).map((n) => (
              <PageButton
                key={n}
                current={n === view.page}
                onClick={() => goTo(n)}
                label={`Página ${n}`}
              >
                {n}
              </PageButton>
            ))}
            <PageButton disabled={view.page === view.pages} onClick={() => goTo(view.page + 1)}>
              Siguiente
            </PageButton>
          </div>
        </nav>
      )}
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  current,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  current?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra ${
        current ? 'bg-ink text-white' : 'text-ink hover:bg-sand/60'
      }`}
    >
      {children}
    </button>
  );
}
