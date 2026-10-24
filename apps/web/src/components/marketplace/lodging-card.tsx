import Image from 'next/image';
import Link from 'next/link';

import { CheckBadgeIcon, StarIcon } from '@/components/icons';
import { LodgingArt } from '@/components/marketplace/lodging-art';
import {
  formatNightPrice,
  KIND_LABEL,
  lodgingCover,
  ownerOf,
  type Fiat,
  type FxRates,
  type Lodging,
} from '@/lib/lodgings';

/**
 * Lodging as a ticket: landscape on top, perforated edge, then the stub with
 * price and the hand-off to Nomito. Server-safe: no client hooks.
 */
export function LodgingCard({
  lodging,
  fiat,
  rates,
  askHref,
}: {
  lodging: Lodging;
  fiat?: Fiat;
  /** Live rates from /api/fx; falls back to the static table when absent. */
  rates?: FxRates;
  /** Where "Pedirle a Nomito" goes: /signup publicly, /app?ask=... inside the app. */
  askHref: string;
}) {
  const owner = ownerOf(lodging);
  const photo = lodgingCover(lodging);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card bg-white transition-shadow hover:shadow-[0_20px_40px_-24px_rgba(143,63,32,0.5)]">
      <div className="relative h-48 overflow-hidden">
        {photo ? (
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 1280px) 30vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            unoptimized={photo.src.startsWith('data:')}
          />
        ) : (
          <LodgingArt lodging={lodging} className="h-full w-full" />
        )}
        {lodging.featured && (
          <span className="absolute left-3 top-3 rounded-full bg-paper px-3 py-1 text-xs font-medium text-terra-deep">
            Favorito de viajeros
          </span>
        )}
      </div>

      <div className="relative flex flex-1 flex-col border-t-2 border-dashed border-sand p-5">
        <span aria-hidden="true" className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-paper" />
        <span aria-hidden="true" className="absolute -right-2 -top-2 h-4 w-4 rounded-full bg-paper" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs tracking-widest text-ink-muted">
              {lodging.code} · {lodging.city}
            </p>
            <h3 className="mt-0.5 font-brand text-xl font-medium leading-snug text-ink">
              <Link
                href={`/lodgings/${lodging.id}`}
                className="rounded-sm after:absolute after:inset-0 after:content-[''] hover:underline hover:decoration-terra/50 hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-terra"
              >
                {lodging.name}
              </Link>
            </h3>
          </div>
          {lodging.reviews === 0 ? (
            <span className="shrink-0 rounded-full bg-agua-soft px-2.5 py-1 text-xs font-medium text-agua">
              Nuevo
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 pt-1 text-sm text-ink">
              <StarIcon className="h-3.5 w-3.5 text-terra" />
              {lodging.rating.toFixed(1)}
              <span className="text-ink-muted">({lodging.reviews})</span>
            </span>
          )}
        </div>

        <p className="mt-1 text-sm text-ink-muted">
          {KIND_LABEL[lodging.kind]} · {lodging.region} · hasta {lodging.guests} personas
        </p>
        <p className="mt-2 text-sm leading-snug text-ink">{lodging.blurb}</p>

        <Link
          href={`/owners/${owner.slug}`}
          className="relative z-10 mt-3 flex w-fit items-center gap-2 rounded-md text-xs text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-terra-soft text-[10px] font-semibold text-terra-deep"
          >
            {owner.initials}
          </span>
          por {owner.name}
          {owner.verified && <CheckBadgeIcon className="h-3.5 w-3.5 text-agua" />}
          {owner.verified && <span className="sr-only">Dueño verificado</span>}
        </Link>

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className="font-mono text-base font-semibold text-ink">
              {formatNightPrice(lodging, fiat, rates)}
              <span className="font-sans text-sm font-normal text-ink-muted">
                {fiat && fiat !== lodging.currency ? ' / noche' : ` ${lodging.currency} / noche`}
              </span>
            </p>
            <p className="mt-1 inline-flex rounded-full bg-agua-soft px-2 py-0.5 text-xs font-medium text-agua">
              directo con el dueño
            </p>
          </div>
          <Link
            href={askHref}
            className="relative z-10 shrink-0 rounded-full bg-terra px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
          >
            Pedirle a Nomito
          </Link>
        </div>
      </div>
    </article>
  );
}
