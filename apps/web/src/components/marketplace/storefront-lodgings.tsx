'use client';

import { LodgingCard } from '@/components/marketplace/lodging-card';
import { useLodgings } from '@/lib/use-lodgings';

/**
 * The Owner's Lodgings on their storefront. The page stays statically
 * generated for the seed; Lodgings created in this browser merge in after
 * hydration (owner-views §9).
 */
export function StorefrontLodgings({ ownerSlug }: { ownerSlug: string }) {
  const lodgings = useLodgings().filter((l) => l.ownerSlug === ownerSlug);
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
