import { CheckBadgeIcon, StarIcon } from '@/components/icons';
import type { Owner } from '@/lib/lodgings';

/** Storefront header. Settlement details are deliberately not shown. */
export function OwnerProfile({
  owner,
  lodgingCount,
  avgRating,
  totalReviews,
}: {
  owner: Owner;
  lodgingCount: number;
  avgRating: number;
  totalReviews: number;
}) {
  return (
    <section className="grid gap-8 rounded-panel bg-white p-6 md:grid-cols-[1fr_17rem] md:p-10">
      <div className="flex flex-col gap-5 sm:flex-row">
        <span
          aria-hidden="true"
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-terra-soft font-brand text-2xl font-medium text-terra-deep"
        >
          {owner.initials}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="brand-display text-3xl font-medium text-ink md:text-4xl">{owner.name}</h1>
            {owner.verified === true ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-agua-soft px-2.5 py-1 text-xs font-medium text-agua">
                <CheckBadgeIcon className="h-3.5 w-3.5" />
                Dueño verificado
              </span>
            ) : owner.verified === false ? (
              <span className="rounded-full bg-sand px-2.5 py-1 text-xs font-medium text-ink-muted">
                Verificación en curso
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-ink-muted">
            {owner.city}
            {owner.country ? `, ${owner.country}` : ''}
          </p>
          {owner.bio && <p className="mt-4 max-w-xl leading-relaxed text-ink">{owner.bio}</p>}
          <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5 text-ink">
              <StarIcon className="h-4 w-4 text-terra" />
              {avgRating.toFixed(1)} · {totalReviews} reseñas
            </span>
            {owner.responseTime && <span>Responde en {owner.responseTime}</span>}
            <span>
              {lodgingCount} {lodgingCount === 1 ? 'alojamiento' : 'alojamientos'}
              {owner.since ? ` · en nomai desde ${owner.since}` : ''}
            </span>
          </p>
        </div>
      </div>

      <aside className="relative rounded-card border-2 border-dashed border-sand bg-paper p-5">
        <p className="font-brand text-lg font-medium leading-snug text-ink">
          Cobra directo, sin comisión, al instante en su moneda
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Tu reserva se paga a {owner.name.split(' ')[0]}, no a nosotros.
        </p>
      </aside>
    </section>
  );
}
