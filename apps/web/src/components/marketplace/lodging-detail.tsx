'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  ArrowLeftIcon,
  BathIcon,
  BedIcon,
  CheckBadgeIcon,
  MapPinIcon,
  StarIcon,
  UsersIcon,
} from '@/components/icons';
import { AvailabilityCalendar } from '@/components/marketplace/availability-calendar';
import { CurrencySelect } from '@/components/marketplace/currency-select';
import { LodgingArt } from '@/components/marketplace/lodging-art';
import { catalog } from '@/lib/catalog';
import { nightsOf } from '@/lib/dates';
import { formatShortDate } from '@/lib/format';
import {
  formatNightPrice,
  formatStayEstimate,
  KIND_LABEL,
  ownerOf,
  type Fiat,
  type FxRates,
  type Lodging,
} from '@/lib/lodgings';
import { MOCK_TODAY } from '@/lib/mock/owner';
import { askHrefPublic } from '@/lib/nomito/ask';
import { PHOTOS } from '@/lib/photos';
import { useFxRates } from '@/lib/use-fx-rates';
import { useLodgings } from '@/lib/use-lodgings';

const LodgingMap = dynamic(() => import('@/components/marketplace/lodging-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-sand/60" />,
});

function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Gallery: the Lodging's photos (first is the cover), its seed photo, or LodgingArt. */
function Gallery({ lodging }: { lodging: Lodging }) {
  const images = lodging.photos?.length
    ? lodging.photos.map((src, i) => ({ src, alt: `${lodging.name}, foto ${i + 1}` }))
    : lodging.photo
      ? [{ src: PHOTOS[lodging.photo].src, alt: PHOTOS[lodging.photo].alt }]
      : [];
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="h-64 overflow-hidden rounded-panel sm:h-96">
        <LodgingArt lodging={lodging} className="h-full w-full" />
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];
  return (
    <div>
      <div className="relative h-64 overflow-hidden rounded-panel bg-sand sm:h-[26rem]">
        <Image
          src={current.src}
          alt={current.alt}
          fill
          priority
          sizes="(min-width: 1152px) 1120px, 100vw"
          className="object-cover"
          unoptimized={current.src.startsWith('data:')}
        />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 flex gap-3 overflow-x-auto pb-1" aria-label="Fotos">
          {images.map((img, i) => (
            <li key={i} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-current={i === active}
                aria-label={`Ver foto ${i + 1}`}
                className={`overflow-hidden rounded-xl ring-terra transition-shadow focus-visible:outline-2 focus-visible:outline-terra ${
                  i === active ? 'ring-2' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Image
                  src={img.src}
                  alt=""
                  width={96}
                  height={64}
                  className="h-16 w-24 object-cover"
                  unoptimized={img.src.startsWith('data:')}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnerBlock({ lodging }: { lodging: Lodging }) {
  const owner = ownerOf(lodging);
  return (
    <div className="rounded-card bg-white p-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-terra-soft font-brand text-lg font-medium text-terra-deep"
        >
          {owner.initials}
        </span>
        <div>
          <p className="font-medium text-ink">{owner.name}</p>
          {owner.verified ? (
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-agua-soft px-2 py-0.5 text-xs font-medium text-agua">
              <CheckBadgeIcon className="h-3 w-3" />
              Dueño verificado
            </span>
          ) : (
            <span className="mt-0.5 inline-flex rounded-full bg-sand px-2 py-0.5 text-xs font-medium text-ink-muted">
              Verificación en curso
            </span>
          )}
        </div>
      </div>
      <p className="mt-4 font-brand text-lg font-medium leading-snug text-ink">
        Cobra directo, sin comisión, al instante en su moneda
      </p>
      <p className="mt-1 text-sm text-ink-muted">Tu reserva se paga a {owner.name.split(' ')[0]}, no a nosotros.</p>
      <Link
        href={`/owners/${owner.slug}`}
        className="mt-4 inline-flex rounded-md text-sm font-medium text-terra-deep underline decoration-terra/40 underline-offset-[5px] hover:decoration-terra focus-visible:outline-2 focus-visible:outline-terra"
      >
        Ver su escaparate
      </Link>
    </div>
  );
}

/**
 * Availability plus the single action (traveler-views §16): pick a stay, see
 * an estimate in the Traveler's currency, hand it to Nomito. No checkout here.
 */
function BookingSection({ lodging, fiat, rates }: { lodging: Lodging; fiat?: Fiat; rates: FxRates }) {
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const stay = checkIn && checkOut ? { checkIn, checkOut } : undefined;
  const nights = stay ? nightsOf(stay.checkIn, stay.checkOut).length : 0;

  return (
    <section aria-labelledby="disponibilidad-heading" className="mt-8">
      <h2 id="disponibilidad-heading" className="font-brand text-xl font-medium text-ink">
        Disponibilidad
      </h2>
      <div className="mt-4 grid gap-6 rounded-card bg-white p-4 sm:p-6 md:grid-cols-[minmax(0,20rem)_1fr]">
        <AvailabilityCalendar
          occupied={catalog.occupiedNights(lodging.id)}
          today={MOCK_TODAY}
          checkIn={checkIn}
          checkOut={checkOut}
          onChange={(i, o) => {
            setCheckIn(i);
            setCheckOut(o);
          }}
        />
        <div className="flex flex-col gap-3">
          <p data-testid="stay-status" aria-live="polite" className="font-medium text-ink">
            {stay
              ? `${nights} ${nights === 1 ? 'noche' : 'noches'} · del ${formatShortDate(stay.checkIn)} al ${formatShortDate(stay.checkOut)}`
              : checkIn
                ? 'Elegí la fecha de salida'
                : 'Elegí la fecha de llegada'}
          </p>
          {stay && (
            <div>
              <p className="text-sm text-ink-muted">Total estimado</p>
              <p data-testid="stay-total" className="font-mono text-2xl font-semibold text-ink">
                {formatStayEstimate(lodging, nights, fiat, rates)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">Es una estimación: Nomito te da el precio final al reservar.</p>
            </div>
          )}
          {checkIn && (
            <button
              type="button"
              onClick={() => {
                setCheckIn(null);
                setCheckOut(null);
              }}
              className="w-fit rounded-md text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
            >
              Borrar fechas
            </button>
          )}
          <Link
            href={askHrefPublic(lodging, stay)}
            className="mt-auto inline-flex justify-center rounded-full bg-terra px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
          >
            Reservar con Nomito
          </Link>
          <p className="text-xs text-ink-muted">
            {stay ? 'Nomito arma la reserva con estas fechas.' : 'Sin fechas, Nomito te sugiere algunas.'} Pagás en tu
            moneda, directo al dueño.
          </p>
        </div>
      </div>
    </section>
  );
}

function LodgingNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-28 text-center">
      <p className="font-mono text-xs tracking-widest text-ink-muted">404</p>
      <h1 className="brand-display mt-3 text-4xl font-medium text-ink sm:text-5xl">
        No encontramos este alojamiento
      </h1>
      <p className="mt-4 text-ink-muted">
        Puede que ya no esté publicado o que el enlace esté mal.
      </p>
      <Link
        href="/lodgings"
        className="mt-8 inline-flex rounded-full bg-terra px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
      >
        Ver todos los alojamientos
      </Link>
    </div>
  );
}

/**
 * The public Lodging ficha (traveler-views §16). Reads the catalog through
 * `useLodgings`: seeded ids render statically, Lodgings created in this
 * browser resolve after hydration, unknown or deleted ids show not-found.
 */
export function LodgingDetail({ id }: { id: string }) {
  const lodgings = useLodgings();
  // Created ids only exist in this browser: wait for hydration before
  // deciding an id is unknown.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  /** Traveler's preferred currency, as in the explorer. undefined = the Lodging's own. */
  const [fiat, setFiat] = useState<Fiat | undefined>(undefined);
  const { rates } = useFxRates();

  const lodging = lodgings.find((l) => l.id === id);
  if (!lodging) {
    return hydrated ? (
      <LodgingNotFound />
    ) : (
      <p className="px-4 py-32 text-center text-ink-muted">Cargando…</p>
    );
  }

  const hasCoords = lodging.lat !== undefined && lodging.lng !== undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-5 md:pt-12">
      <Link
        href="/lodgings"
        className="mb-6 inline-flex items-center gap-1.5 rounded-md text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Todos los alojamientos
      </Link>

      <Gallery lodging={lodging} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div>
          <p className="font-mono text-xs tracking-widest text-ink-muted">
            {lodging.code} · {lodging.city}
          </p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <h1 className="brand-display text-4xl font-medium leading-tight text-ink sm:text-5xl">
              {lodging.name}
            </h1>
            {lodging.reviews === 0 ? (
              <span className="mt-2 shrink-0 rounded-full bg-agua-soft px-3 py-1 text-xs font-medium text-agua">
                Nuevo
              </span>
            ) : (
              <span className="mt-3 flex shrink-0 items-center gap-1 text-ink">
                <StarIcon className="h-4 w-4 text-terra" />
                {lodging.rating.toFixed(1)}
                <span className="text-sm text-ink-muted">({lodging.reviews} reseñas)</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-ink-muted">
            {KIND_LABEL[lodging.kind]} · {lodging.region}
          </p>

          <ul className="mt-5 flex flex-wrap gap-2.5 text-sm text-ink" aria-label="Capacidad">
            <li className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5">
              <UsersIcon className="h-4 w-4 text-terra" />
              hasta {lodging.guests} {lodging.guests === 1 ? 'persona' : 'personas'}
            </li>
            <li className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5">
              <BedIcon className="h-4 w-4 text-terra" />
              {pluralize(lodging.bedrooms, 'dormitorio', 'dormitorios')}
            </li>
            <li className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5">
              <BathIcon className="h-4 w-4 text-terra" />
              {pluralize(lodging.baths, 'baño', 'baños')}
            </li>
          </ul>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink">{lodging.blurb}</p>

          {lodging.amenities.length > 0 && (
            <section aria-labelledby="amenities-heading" className="mt-8">
              <h2 id="amenities-heading" className="font-brand text-xl font-medium text-ink">
                Servicios
              </h2>
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Servicios">
                {lodging.amenities.map((a) => (
                  <li key={a} className="rounded-full bg-sand/50 px-3 py-1 text-sm text-ink">
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="ubicacion-heading" className="mt-8">
            <h2 id="ubicacion-heading" className="font-brand text-xl font-medium text-ink">
              Ubicación
            </h2>
            <p className="mt-3 flex items-center gap-2 text-ink">
              <MapPinIcon className="h-4 w-4 shrink-0 text-terra" />
              {hasCoords ? `${lodging.address}, ${lodging.city}` : `${lodging.city}, ${lodging.region}`}
            </p>
            {hasCoords && (
              <div className="mt-4 h-64 overflow-hidden rounded-card border border-sand sm:h-80">
                <LodgingMap lodging={lodging} />
              </div>
            )}
          </section>

          <BookingSection key={lodging.id} lodging={lodging} fiat={fiat} rates={rates} />
        </div>

        <aside className="flex flex-col gap-5 lg:pt-2">
          <div className="rounded-card bg-white p-6">
            <p className="font-mono text-2xl font-semibold text-ink">
              {formatNightPrice(lodging, fiat, rates)}
              <span className="font-sans text-sm font-normal text-ink-muted">
                {fiat && fiat !== lodging.currency ? ' / noche' : ` ${lodging.currency} / noche`}
              </span>
            </p>
            <p className="mt-2 inline-flex rounded-full bg-agua-soft px-2.5 py-1 text-xs font-medium text-agua">
              directo con el dueño
            </p>
            <CurrencySelect value={fiat} onChange={setFiat} className="mt-4 w-full" />
          </div>
          <OwnerBlock lodging={lodging} />
        </aside>
      </div>
    </div>
  );
}
