import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeftIcon } from '@/components/icons';
import { LodgingCard } from '@/components/marketplace/lodging-card';
import { OwnerProfile } from '@/components/marketplace/owner-profile';
import { lodgingsByOwner, ownerBySlug, OWNERS } from '@/lib/lodgings';
import { PHOTOS } from '@/lib/photos';

export function generateStaticParams() {
  return OWNERS.map((owner) => ({ slug: owner.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const owner = ownerBySlug(slug);
  return {
    title: owner ? `Alojamientos de ${owner.name} · nomai` : 'Alojamientos · nomai',
    description: owner
      ? `${owner.name} ofrece alojamientos en ${owner.city}, ${owner.country}. Pagás en tu moneda, directo al dueño y sin comisión.`
      : undefined,
  };
}

/** Storefront: every Lodging a single Owner offers through nomai. */
export default async function OwnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const owner = ownerBySlug(slug);
  if (!owner) notFound();

  const lodgings = lodgingsByOwner(owner.slug);
  const avgRating = lodgings.reduce((sum, l) => sum + l.rating, 0) / lodgings.length;
  const totalReviews = lodgings.reduce((sum, l) => sum + l.reviews, 0);
  const coverKey = lodgings.find((l) => l.photo)?.photo;
  const cover = coverKey ? PHOTOS[coverKey] : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-5">
      <Link
        href="/lodgings"
        className="mb-6 inline-flex items-center gap-1.5 rounded-md text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Todos los alojamientos
      </Link>

      {cover && (
        <div className="relative -mb-16 h-56 overflow-hidden rounded-panel sm:h-72">
          <Image src={cover.src} alt="" fill priority sizes="(min-width: 1152px) 1120px, 100vw" className="object-cover" />
        </div>
      )}

      <div className={cover ? 'relative mx-3 sm:mx-6' : undefined}>
        <OwnerProfile owner={owner} lodgingCount={lodgings.length} avgRating={avgRating} totalReviews={totalReviews} />
      </div>

      <h2 className="brand-display mt-14 text-2xl font-medium text-ink">Alojamientos de {owner.name.split(' ')[0]}</h2>
      <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {lodgings.map((lodging) => (
          <li key={lodging.id}>
            <LodgingCard lodging={lodging} askHref="/signup" />
          </li>
        ))}
      </ul>
    </div>
  );
}
