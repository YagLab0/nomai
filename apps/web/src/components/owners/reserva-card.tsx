'use client';

import { useEffect, useState } from 'react';
import { toast } from '@heroui/react';
import { ChatModal } from '@/components/chat/chat-modal';
import { CheckBadgeIcon } from '@/components/icons';
import { ReviewModal, TRAVELER_CATEGORIES, type ReviewPayload } from '@/components/reviews/review-modal';
import { Stars } from '@/components/reviews/stars';
import { formatMoney, formatShortDate, formatStayRange } from '@/lib/format';
import { releaseStages, type ReleaseStage } from '@/lib/owner-bookings';

export interface BookingData {
  id: string;
  checkin: string;
  checkout: string;
  guests: number;
  total_minor: number;
  currency: string;
  status: string;
  guest_ref?: string | null;
  traveler_id?: string | null;
  created_at?: string;
  /** ADR-0006: the platform's cut (never refunded) and the Escrow state. */
  service_fee_minor?: number;
  escrow_status?: string;
  /** The Cancellation deadline: the first Escrow release day (ADR-0006). */
  cancel_deadline?: string | null;
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
  // The DB's `booking_status` values, labelled like the Traveler's Reservas
  // panel so both sides of a Booking read the same (ADR-0006).
  pending_payment: { label: 'Pago pendiente', className: 'bg-amber-100 text-amber-800' },
  pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmada', className: 'bg-agua-soft text-agua' },
  confirmada: { label: 'Confirmada', className: 'bg-agua-soft text-agua' },
  in_progress: { label: 'En curso', className: 'bg-terra-soft text-terra-deep' },
  'en-curso': { label: 'En curso', className: 'bg-sand text-ink' },
  claim_open: { label: 'Reclamo abierto', className: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Completada', className: 'bg-sand/70 text-ink-muted' },
  completada: { label: 'Completada', className: 'bg-sand/70 text-ink-muted' },
  cancelled: { label: 'Cancelada', className: 'bg-sand/70 text-ink-muted' },
  cancelada: { label: 'Cancelada', className: 'bg-sand/70 text-ink-muted' },
  refunded: { label: 'Reembolsada', className: 'bg-sand/70 text-ink-muted' },
};

/** The guest's weighted score — Airbnb's host-facing guest rating (ADR-0008). */
function TravelerScore({ travelerId }: { travelerId: string }) {
  const [score, setScore] = useState<{ rating: number | null; reviews: number } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/owners/travelers/${encodeURIComponent(travelerId)}/score`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && typeof d.reviews === 'number') setScore(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [travelerId]);

  if (!score || !score.reviews || score.rating == null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-muted" title={`${score.reviews} reseñas de anfitriones`}>
      <Stars rating={score.rating} size="sm" />
      {score.rating.toFixed(1)}
    </span>
  );
}

/** The one-line copy of an Escrow stage (ADR-0006), in the Owner's voseo. */
function stageCopy(stage: ReleaseStage): string {
  if (stage.state === 'released') return 'en tu Ripio';
  if (stage.state === 'due') return 'se libera en las próximas horas';
  if (stage.state === 'held') {
    return stage.heldBy === 'claim' ? 'retenido por un reclamo' : 'retenido hasta verificar tu Ripio';
  }
  return stage.stage === 'first' ? '5 días antes de la llegada' : '24 h después de la llegada';
}

/** The mark and tone of an Escrow stage: released, scheduled or held. */
function stageTone(stage: ReleaseStage): { mark: string; className: string } {
  if (stage.state === 'released') return { mark: '✓', className: 'text-emerald-700' };
  if (stage.state === 'held') return { mark: '⊘', className: 'text-amber-700' };
  if (stage.state === 'due') return { mark: '○', className: 'text-terra-deep' };
  return { mark: '○', className: 'text-ink-muted' };
}

/** A Booking as the Owner sees it: real dates, settled amount in Ripio, guests. */
export function ReservaCard({
  booking,
  alreadyReviewed = false,
  unreadMessages = 0,
  releasedMinor = 0,
  payoutVerified = false,
  today,
}: {
  booking: BookingData;
  /** True once the Owner's to_traveler Review for this Booking exists (ADR-0008). */
  alreadyReviewed?: boolean;
  /** Unread chat messages from the Traveler, from GET /owners/inbox (ADR-0009). */
  unreadMessages?: number;
  /** Sent Escrow releases for this Booking (payments kind='release') — ADR-0006. */
  releasedMinor?: number;
  /** The Owner's Ripio address is verified; until then the keeper holds releases. */
  payoutVerified?: boolean;
  /** YYYY-MM-DD as the dashboard sees it; omitted by the mock panel (no timeline). */
  today?: string;
}) {
  const status = STATUS_MAP[booking.status] || STATUS_MAP.confirmed;
  const isCanceled =
    booking.status === 'cancelled' || booking.status === 'cancelada' || booking.status === 'refunded';
  const isCompleted = booking.status === 'completed' || booking.status === 'completada';
  const [reviewing, setReviewing] = useState(false);
  const [reviewed, setReviewed] = useState(alreadyReviewed);
  const [chatOpen, setChatOpen] = useState(false);

  async function submitReview(payload: ReviewPayload) {
    const res = await fetch(`/api/owners/bookings/${encodeURIComponent(booking.id)}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? 'No pudimos publicar la reseña.');
    }
    setReviewed(true);
    toast('Reseña del viajero publicada');
  }

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
  // ADR-0006: the two Escrow releases of this Booking. The mock panel omits
  // `today`, so its cards keep the simple total.
  const stages = today ? releaseStages(booking, releasedMinor, today, payoutVerified) : [];

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
          {booking.traveler_id && <TravelerScore travelerId={booking.traveler_id} />}
          {booking.status === 'confirmed' || booking.status === 'in_progress' ? (
            <span className="rounded-full bg-terra px-2 py-0.5 text-xs font-medium text-white">
              Pago en garantía
            </span>
          ) : null}
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

        {stages.length > 0 && (
          <ul className="mt-3 flex flex-col gap-0.5 text-xs" aria-label="Liberaciones de Escrow">
            {stages.map((stage) => {
              const tone = stageTone(stage);
              return (
                <li
                  key={stage.stage}
                  data-testid="release-stage"
                  className={`flex flex-wrap items-baseline gap-x-1.5 ${tone.className}`}
                >
                  <span aria-hidden="true">{tone.mark}</span>
                  <span className="font-mono font-medium">
                    {formatMoney(stage.amountMinor, booking.currency)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatShortDate(stage.date)}</span>
                  <span aria-hidden="true">—</span>
                  <span>{stageCopy(stage)}</span>
                </li>
              );
            })}
          </ul>
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
        {isCompleted && !reviewed && (
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="text-xs font-medium text-terra-deep underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-terra"
          >
            Calificar al viajero
          </button>
        )}
        {isCompleted && reviewed && (
          <span className="text-xs text-ink-muted">Viajero reseñado</span>
        )}
        {/* The Booking's private chat with the Traveler — on every status. */}
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-terra-deep focus-visible:outline-2 focus-visible:outline-terra"
        >
          <span className="underline underline-offset-4">Mensajes</span>
          {unreadMessages > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-terra px-1 text-[10px] font-semibold leading-none text-white">
              {unreadMessages}
            </span>
          )}
        </button>
      </div>
      <ReviewModal
        isOpen={reviewing}
        onOpenChange={setReviewing}
        title={`¿Cómo fue ${guestName} como huésped?`}
        subtitle="La reseña queda visible para otros anfitriones — se publica de inmediato."
        categories={TRAVELER_CATEGORIES}
        bodyPlaceholder="Contale a otros anfitriones cómo cuidó tu espacio…"
        submitLabel="Publicar reseña del viajero"
        onSubmit={submitReview}
      />
      <ChatModal
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        title={`Chat con ${guestName}`}
        subtitle={`${lodgingTitle} · ${formatStayRange(booking.checkin, booking.checkout)}`}
        endpoint={`/api/owners/bookings/${encodeURIComponent(booking.id)}/messages`}
        bookingId={booking.id}
        emptyHint={`Todavía no hay mensajes — escribile a ${guestName}.`}
      />
    </article>
  );
}
