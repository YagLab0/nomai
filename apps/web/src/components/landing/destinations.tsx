'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';

import { ArrowUpRightIcon, MapPinIcon, StarIcon } from '@/components/icons';
import { NomitoArt } from '@/components/nomito-avatar';
import { Reveal } from '@/components/reveal';
import { formatLocalPrice, KIND_LABEL, LODGINGS, type Lodging } from '@/lib/lodgings';
import { buildDestinations, type Destination } from '@/lib/mock/destinations';
import { PHOTOS } from '@/lib/photos';

const GRID_SIZES = '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw';

function TownCard({ town }: { town: Destination }) {
  const photo = PHOTOS[town.photo];
  return (
    <article className="relative flex min-h-[22rem] flex-col justify-end overflow-hidden rounded-card bg-ink sm:min-h-[26rem] p-6 text-paper">
      <Image src={photo.src} alt={photo.alt} fill sizes={GRID_SIZES} className="object-cover" />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
      <div className="relative">
        <p className="text-sm text-paper/80">{town.country}</p>
        <h3 className="brand-display text-[2.6rem] font-medium leading-[0.95]">{town.name}</h3>
        <p className="mt-3 text-[15px] leading-snug text-paper/85">{town.tagline}</p>
        {town.from && (
          <p className="mt-4 text-sm text-paper/80">
            <span className="font-mono font-semibold text-paper">{town.from}</span> la noche
          </p>
        )}
      </div>
    </article>
  );
}

function LodgingPhotoCard({ lodging }: { lodging: Lodging }) {
  const photo = lodging.photo ? PHOTOS[lodging.photo] : undefined;
  return (
    <Link
      href={`/owners/${lodging.ownerSlug}`}
      className="group flex h-full flex-col overflow-hidden rounded-card bg-white p-2 transition-shadow hover:shadow-[0_24px_48px_-28px_rgba(143,63,32,0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-[1.35rem] bg-sand">
        {photo ? (
          <Image src={photo.src} alt={photo.alt} fill sizes={GRID_SIZES} className="object-cover" />
        ) : lodging.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lodging.photoUrl} alt={lodging.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {lodging.featured && (
          <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-3 py-1 text-xs font-medium text-terra-deep">
            Favorito de viajeros
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-4">
        <p className="text-xs text-ink-muted">{KIND_LABEL[lodging.kind]}</p>
        <h4 className="font-brand text-xl font-medium leading-snug text-ink">{lodging.name}</h4>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-muted">
          <MapPinIcon className="h-3.5 w-3.5 text-terra" />
          {lodging.city}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="flex items-center gap-1 text-sm text-ink">
            <StarIcon className="h-4 w-4 text-terra" />
            {lodging.rating.toFixed(1)}
            <span className="text-ink-muted">({lodging.reviews})</span>
          </p>
          <p className="text-right leading-none">
            <span className="font-brand text-2xl font-semibold text-ink">{formatLocalPrice(lodging)}</span>
            <span className="block pt-1 text-xs text-ink-muted">{lodging.currency} por noche</span>
          </p>
        </div>
      </div>
    </Link>
  );
}

function AccentCard({ town }: { town: Destination }) {
  return (
    <Link
      href="/signup"
      className="group relative flex min-h-[17rem] flex-col overflow-hidden rounded-card bg-terra sm:min-h-[26rem] p-6 text-paper transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
    >
      <h3 className="brand-display text-4xl font-medium leading-[1.02]">Hablá con Nomito</h3>
      <p className="mt-3 max-w-[16rem] text-[15px] leading-snug text-paper/85">
        Contale qué buscás en {town.name} y te arma una lista corta con el precio final en tu moneda.
      </p>
      <NomitoArt className="pointer-events-none absolute -bottom-6 -left-6 h-44 w-44 opacity-95" />
      <span className="absolute bottom-5 right-5 flex h-12 w-12 items-center justify-center rounded-full bg-paper text-terra-deep transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
        <ArrowUpRightIcon className="h-5 w-5" />
      </span>
    </Link>
  );
}

/**
 * Pill segmented tabs over one destination per Ripio country; each shows the
 * place, two Lodgings and Nomito. `lodgings` comes from the listings API via
 * the landing page; absent or empty falls back to the static catalog.
 */
export function Destinations({ lodgings }: { lodgings?: Lodging[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const destinations = useMemo(
    () => buildDestinations(lodgings?.length ? lodgings : LODGINGS),
    [lodgings],
  );
  const town = destinations[active];

  function onKeyDown(e: React.KeyboardEvent) {
    const last = destinations.length - 1;
    const next =
      e.key === 'ArrowRight' ? (active === last ? 0 : active + 1)
      : e.key === 'ArrowLeft' ? (active === 0 ? last : active - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <section id="destinos" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-5 lg:py-28">
      <div className="flex flex-col items-center text-center">
        <Reveal>
          <h2 className="brand-display text-5xl font-medium leading-[0.95] text-ink sm:text-6xl">De la Quebrada al Caribe</h2>
          <p className="mt-4 max-w-xl text-lg text-ink-muted">
            Alojamientos de dueños en los siete países donde funciona Ripio. El precio es el del dueño, en su moneda, y
            el cobro se libera a su cuenta por etapas.
          </p>
        </Reveal>

        <div
          role="tablist"
          aria-label="Destinos"
          onKeyDown={onKeyDown}
          className="mt-10 flex max-w-full gap-1 overflow-x-auto rounded-full bg-sand/70 p-1.5"
        >
          {destinations.map((d, i) => (
            <button
              key={d.code}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={`tab-${d.code}`}
              role="tab"
              type="button"
              aria-selected={i === active}
              aria-controls="destinos-panel"
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra sm:px-6 ${
                i === active ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id="destinos-panel"
        role="tabpanel"
        aria-labelledby={`tab-${town.code}`}
        className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {/* Keyed by town so a tab switch replays the staggered entrance. */}
        <Reveal key={`${town.code}-town`} className="h-full">
          <TownCard town={town} />
        </Reveal>
        {town.lodgings.slice(0, 2).map((l, i) => (
          <Reveal key={`${town.code}-${l.id}`} delay={(i + 1) * 80} className="h-full">
            <LodgingPhotoCard lodging={l} />
          </Reveal>
        ))}
        <Reveal key={`${town.code}-cta`} delay={240} className="h-full">
          <AccentCard town={town} />
        </Reveal>
      </div>

      <p className="mt-8 text-center">
        <Link
          href="/lodgings"
          className="rounded-md font-medium text-terra-deep underline decoration-terra/40 underline-offset-[6px] hover:decoration-terra focus-visible:outline-2 focus-visible:outline-terra"
        >
          Ver todos los alojamientos
        </Link>
      </p>
    </section>
  );
}
