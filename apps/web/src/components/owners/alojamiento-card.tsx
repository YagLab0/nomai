'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@heroui/react';

import { StarIcon } from '@/components/icons';
import { LodgingArt } from '@/components/marketplace/lodging-art';
import { formatLocalPrice, KIND_LABEL, lodgingCover, type Lodging } from '@/lib/lodgings';

/** A Lodging the Owner manages; "Editar" opens the wizard (owner-views §9). */
export function AlojamientoCard({ lodging, onEdit }: { lodging: Lodging; onEdit: () => void }) {
  const photo = lodgingCover(lodging);

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card bg-white">
      <div className="relative h-40 overflow-hidden">
        {photo ? (
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
            unoptimized={photo.src.startsWith('data:')}
          />
        ) : (
          <LodgingArt lodging={lodging} className="h-full w-full" />
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="font-mono text-xs tracking-widest text-ink-muted">
          {lodging.code} · {lodging.city}
        </p>
        <h3 className="mt-0.5 font-brand text-xl font-medium leading-snug text-ink">
          {lodging.name}
        </h3>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
          {KIND_LABEL[lodging.kind]}
          {lodging.reviews === 0 ? (
            <span className="rounded-full bg-agua-soft px-2 py-0.5 text-xs font-medium text-agua">
              Nuevo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-ink">
              <StarIcon className="h-3.5 w-3.5 text-terra" />
              {lodging.rating.toFixed(1)}
            </span>
          )}
        </p>
        <p className="mt-2 text-sm leading-snug text-ink">{lodging.blurb}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Servicios">
          {lodging.amenities.map((a) => (
            <li key={a} className="rounded-full bg-sand/50 px-2.5 py-0.5 text-xs text-ink">
              {a}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <p className="font-mono text-base font-semibold text-ink">
            {formatLocalPrice(lodging)}
            <span className="font-sans text-sm font-normal text-ink-muted">
              {' '}
              {lodging.currency} / noche
            </span>
          </p>
          <div className="flex items-center gap-4">
            <Link
              href={`/lodgings/${lodging.id}`}
              className="text-xs font-medium text-ink-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
            >
              Ver en el catálogo
            </Link>
            <Button variant="secondary" size="sm" onPress={onEdit}>
              Editar
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
