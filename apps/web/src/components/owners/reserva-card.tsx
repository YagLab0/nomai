'use client';

import { toast } from '@heroui/react';

import { CheckBadgeIcon } from '@/components/icons';
import { formatNumber, formatShortDate, formatStayRange } from '@/lib/format';
import { lodgingById } from '@/lib/lodgings';
import type { OwnerBooking, OwnerBookingStatus } from '@/lib/mock/owner';

const STATUS: Record<OwnerBookingStatus, { label: string; className: string }> = {
  confirmada: { label: 'Confirmada', className: 'bg-agua-soft text-agua' },
  'en-curso': { label: 'En curso', className: 'bg-terra-soft text-terra-deep' },
  completada: { label: 'Completada', className: 'bg-sand/70 text-ink-muted' },
  cancelada: { label: 'Cancelada', className: 'bg-sand/70 text-ink-muted' },
};

/** A Booking as the Owner sees it: already settled, ticket-style card. */
export function ReservaCard({ booking }: { booking: OwnerBooking }) {
  const lodging = lodgingById(booking.lodgingId);
  const status = STATUS[booking.status];
  const canceled = booking.status === 'cancelada';

  return (
    <article
      className={`flex overflow-hidden rounded-card border border-sand ${canceled ? 'bg-sand/30' : 'bg-white'}`}
    >
      <div className="min-w-0 flex-1 p-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <p className="font-medium text-ink">{booking.traveler.name}</p>
          {booking.traveler.verified && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
              <CheckBadgeIcon className="h-3.5 w-3.5 text-agua" />
              documento verificado
            </span>
          )}
          {booking.isNew && (
            <span className="rounded-full bg-terra px-2 py-0.5 text-xs font-medium text-white">
              Reserva nueva
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">{booking.traveler.origin}</p>
        <p className="mt-3 text-sm font-medium text-ink">
          {lodging?.name} · {lodging?.city}
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">
          {formatStayRange(booking.checkIn, booking.checkOut)} · {booking.nights}{' '}
          {booking.nights === 1 ? 'noche' : 'noches'}
        </p>
        {canceled && booking.refunded != null && (
          <p className="mt-3 text-sm text-ink-muted">
            {booking.canceledAt && `Cancelada el ${formatShortDate(booking.canceledAt)} · `}
            se devolvieron $ {formatNumber(booking.refunded)} al viajero
          </p>
        )}
      </div>

      <div className="relative flex w-32 shrink-0 flex-col items-center justify-center gap-2.5 border-l-2 border-dashed border-sand p-4 text-center sm:w-36">
        <span aria-hidden="true" className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-paper" />
        <span aria-hidden="true" className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-paper" />
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
          {status.label}
        </span>
        <span className={`font-mono text-sm font-semibold ${canceled ? 'text-ink-muted' : 'text-ink'}`}>
          $ {formatNumber(booking.amount)}
        </span>
        <button
          type="button"
          onClick={() => toast('Pronto vas a poder escribirle al viajero')}
          className="text-xs font-medium text-terra-deep underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-terra"
        >
          Contactar
        </button>
      </div>
    </article>
  );
}
