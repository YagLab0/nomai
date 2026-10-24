import type { Metadata } from 'next';

import { LodgingDetail } from '@/components/marketplace/lodging-detail';
import { fetchListing } from '@/lib/api';
import { apiDetailToLodging } from '@/lib/api-mapping';
import { catalog } from '@/lib/catalog';
import { KIND_LABEL, LODGINGS } from '@/lib/lodgings';

export function generateStaticParams() {
  return LODGINGS.map((l) => ({ id: l.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await fetchListing(id).catch(() => null);
  const lodging = detail ? apiDetailToLodging(detail) : catalog.byId(id);
  return {
    title: lodging ? `${lodging.name} · nomai` : 'Alojamiento · nomai',
    description: lodging
      ? `${KIND_LABEL[lodging.kind]} en ${lodging.city}, ${lodging.region}. ${lodging.blurb}`
      : undefined,
  };
}

/**
 * The public ficha (traveler-views §16). Seeded ids prerender here; ids only
 * known to this browser's catalog resolve client-side inside LodgingDetail.
 */
export default async function LodgingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LodgingDetail id={id} />;
}
