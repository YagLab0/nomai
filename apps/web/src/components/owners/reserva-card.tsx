'use client';

import { toast } from '@heroui/react';
import { CheckBadgeIcon } from '@/components/icons';
import { formatMoney, formatStayRange } from '@/lib/format';

export interface BookingData {
  id: string;
  checkin: string;
  checkout: string;
  guests: number;
  total_minor: number;
  currency: string;
  status: string;
  guest_ref?: string | null;
  created_at?: string;
  listing?: {
    id: string;
    title: string;
    slug: string;
    property?: {
      id: string;
      name: string;
      city: string;
    } | null;
  } | null;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmada', className: 'bg-agua-soft text-agua' },
  confirmada: { label: 'Confirmada', className: 'bg-agua-soft text-agua' },
  pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800' },
  'en-curso': { label: 'En curso', className: 'bg-sand text-ink' },
  completed: { label: 'Completada', className: 'bg-sand/70 text-ink-muted' },
  completada: { label: 'Completada', className: 'bg-sand/70 text-ink-muted' },
  cancelled: { label: 'Cancelada', className: 'bg-sand/70 text-ink-muted' },
  cancelada: { label: 'Cancelada', className: 'bg-sand/70 text-ink-muted' },
};

/** A Booking as the Owner sees it: real dates, settled amount in Ripio, guests. */
export function ReservaCard({ booking }: { booking: BookingData }) {
  const status = STATUS_MAP[booking.status] || STATUS_MAP.confirmed;
  const isCanceled = booking.status === 'cancelled' || booking.status === 'cancelada';

  // Calculate nights
  const inD = new Date(booking.checkin);
  const outD = new Date(booking.checkout);
  const nights = Math.max(
    1,
    Math.round((outD.getTime() - inD.getTime()) / (1000 * 60 * 60 * 24))
  );

  const guestName = booking.guest_ref || 'Viajero verificado';
  const lodgingTitle = booking.listing?.title || 'Alojamiento';
  const city = booking.listing?.property?.city || '';

  return (
    <article
      className={`flex overflow-hidden rounded-card border border-sand ${
        isCanceled ? 'bg-sand/30' : 'bg-white'
      }`}
    >
      <div className="min-w-0 flex-1 p-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <p className="font-medium text-ink">{guestName}</p>
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <CheckBadgeIcon className="h-3.5 w-3.5 text-agua" />
            identidad verificada
          </span>
          {booking.status === 'confirmed' && (
            <span className="rounded-full bg-terra px-2 py-0.5 text-xs font-medium text-white">
              Cobrada en Ripio
            </span>
          )}
        </div>

        <p className="mt-3 text-sm font-medium text-ink">
          {lodgingTitle} {city && `· ${city}`}
        </p>

        <p className="mt-0.5 text-sm text-ink-muted">
          {formatStayRange(booking.checkin, booking.checkout)} · {nights}{' '}
          {nights === 1 ? 'noche' : 'noches'} · {booking.guests}{' '}
          {booking.guests === 1 ? 'huésped' : 'huéspedes'}
        </p>

        {isCanceled && (
          <p className="mt-3 text-sm text-ink-muted">
            Reserva cancelada según la política de cancelación.
          </p>
        )}
      </div>

      <div className="relative flex w-36 shrink-0 flex-col items-center justify-center gap-2.5 border-l-2 border-dashed border-sand p-4 text-center sm:w-40">
        <span
          aria-hidden="true"
          className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-paper"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-paper"
        />
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
          {status.label}
        </span>
        <span
          className={`font-mono text-sm font-semibold ${
            isCanceled ? 'text-ink-muted line-through' : 'text-ink'
          }`}
        >
          {formatMoney(booking.total_minor, booking.currency)}
        </span>
        <button
          type="button"
          onClick={() => toast('Pronto vas a poder escribirle al viajero')}
          className="text-xs font-medium text-terra-deep underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-terra"
        >
          Contactar al viajero
        </button>
      </div>
    </article>
  );
}
