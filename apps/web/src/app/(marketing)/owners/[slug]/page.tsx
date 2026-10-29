import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeftIcon } from '@/components/icons';
import { OwnerProfile } from '@/components/marketplace/owner-profile';
import { StorefrontLodgings } from '@/components/marketplace/storefront-lodgings';
import { fetchListings } from '@/lib/api';
import { apiCardToLodging, apiOwner } from '@/lib/api-mapping';
import { LODGINGS, ownerBySlug } from '@/lib/lodgings';
import { PHOTOS } from '@/lib/photos';

export async function generateStaticParams() {
  const cards = await fetchListings().catch(() => []);
  const slugs = Array.from(new Set(cards.map((c) => c.owner_slug).filter(Boolean)));
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cards = await fetchListings().catch(() => []);
  const owner = apiOwner(slug, cards);
  return {
    title: owner ? `Alojamientos de ${owner.name} · nomai` : 'Alojamientos · nomai',
    description: owner
      ? `${owner.name} ofrece alojamientos en ${owner.city}, ${owner.country}. Pagás en tu moneda; el pago queda en garantía hasta tu estadía.`
      : undefined,
  };
}

/** Storefront: every Lodging a single Owner offers through nomai. */
export default async function OwnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const cards = await fetchListings().catch(() => null);
  // The seed catalog stands in when the listings API is unreachable.
  const owner = cards ? apiOwner(slug, cards) : ownerBySlug(slug);
  if (!owner) notFound();

  const lodgings = cards
    ? cards.filter((c) => c.owner_slug === slug).map(apiCardToLodging)
    : LODGINGS.filter((l) => l.ownerSlug === slug);

  // The storefront score is the api's recency-weighted business aggregate
  // (ADR-0008); the catalog fallback averages its seeded listing ratings.
  const apiAggregate = cards?.find((c) => c.owner_slug === slug);
  const avgRating =
    apiAggregate?.owner_rating ??
    (lodgings.length ? lodgings.reduce((sum, l) => sum + l.rating, 0) / lodgings.length : 0);
  const totalReviews =
    apiAggregate?.owner_reviews ?? lodgings.reduce((sum, l) => sum + l.reviews, 0);
  const featured = lodgings.find((l) => l.photo || l.photoUrl);
  const cover = featured?.photo ? PHOTOS[featured.photo] : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-5">
      <Link
        href="/lodgings"
        className="mb-6 inline-flex items-center gap-1.5 rounded-md text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Todos los alojamientos
      </Link>

      {cover ? (
        <div className="relative -mb-16 h-56 overflow-hidden rounded-panel sm:h-72">
          <Image src={cover.src} alt="" fill priority sizes="(min-width: 1152px) 1120px, 100vw" className="object-cover" />
        </div>
      ) : featured?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={featured.photoUrl}
          alt=""
          className="-mb-16 h-56 w-full rounded-panel object-cover sm:h-72"
        />
      ) : null}

      <div className={cover || featured?.photoUrl ? 'relative mx-3 sm:mx-6' : undefined}>
        <OwnerProfile owner={owner} lodgingCount={lodgings.length} avgRating={avgRating} totalReviews={totalReviews} />
      </div>

      <h2 className="brand-display mt-14 text-2xl font-medium text-ink">Alojamientos de {owner.name.split(' ')[0]}</h2>
      <StorefrontLodgings ownerSlug={owner.slug} baseLodgings={lodgings} />
    </div>
  );
}
