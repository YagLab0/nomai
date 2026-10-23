import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  lodgingsByOwner,
  ownerBySlug,
  OWNERS,
} from "@/lib/lodgings";
import { LodgingCard } from "@/components/marketplace/lodging-card";
import { OwnerProfile } from "@/components/marketplace/owner-profile";

export function generateStaticParams() {
  return OWNERS.map((owner) => ({ slug: owner.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const owner = ownerBySlug(slug);
  return {
    title: owner
      ? `nomai — alojamientos de ${owner.name}`
      : "nomai — alojamientos",
    description: owner
      ? `${owner.name} ofrece alojamientos en ${owner.city}, ${owner.country}. Las reservas se pagan directo a su wallet vía x402 — 0% comisión.`
      : undefined,
  };
}

/** Storefront: every Lodging a single Owner offers through nomai. */
export default async function OwnerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const owner = ownerBySlug(slug);
  if (!owner) notFound();

  const lodgings = lodgingsByOwner(owner.slug);
  const avgRating =
    lodgings.reduce((sum, l) => sum + l.rating, 0) / lodgings.length;
  const totalReviews = lodgings.reduce((sum, l) => sum + l.reviews, 0);

  return (
    <div className="container mx-auto max-w-6xl px-4 pb-24 pt-8 font-readex">
      <NextLink
        href="/alojamientos"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Todos los alojamientos
      </NextLink>

      <OwnerProfile
        owner={owner}
        lodgingCount={lodgings.length}
        avgRating={avgRating}
        totalReviews={totalReviews}
      />

      <h2 className="mt-12 text-xl font-medium tracking-tight">
        Alojamientos de {owner.name.split(" ")[0]}
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {lodgings.map((lodging) => (
          <LodgingCard key={lodging.id} lodging={lodging} />
        ))}
      </div>
    </div>
  );
}
