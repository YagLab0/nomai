'use client';

import { LodgingCard } from '@/components/marketplace/lodging-card';
import type { Lodging } from '@/lib/lodgings';
import { useLodgingOverlay } from '@/lib/use-lodgings';

/**
 * The Owner's Lodgings on their storefront. `baseLodgings` comes from the
 * listings API (or the seed fallback) on the server; Lodgings created,
 * edited or deleted in this browser merge in after hydration (owner-views §9).
 */
export function StorefrontLodgings({
  ownerSlug,
  baseLodgings,
}: {
  ownerSlug: string;
  baseLodgings: Lodging[];
}) {
  const lodgings = (useLodgingOverlay(baseLodgings) ?? baseLodgings).filter(
    (l) => l.ownerSlug === ownerSlug,
  );
  return (
    <ul className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {lodgings.map((lodging) => (
        <li key={lodging.id}>
          <LodgingCard lodging={lodging} askHref="/signup" />
        </li>
      ))}
    </ul>
  );
}
