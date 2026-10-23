"use client";

import { Avatar, Card, Chip, Separator } from "@heroui/react";
import {
  BadgeCheck,
  Clock3,
  MapPin,
  ShieldAlert,
  Star,
  Wallet,
} from "lucide-react";

import type { Owner } from "@/lib/lodgings";

/**
 * HeroUI is client-only, so the storefront's profile header lives here while
 * the page itself stays a Server Component (static params + metadata).
 */
export function OwnerProfile({
  owner,
  lodgingCount,
  avgRating,
  totalReviews,
}: {
  owner: Owner;
  lodgingCount: number;
  avgRating: number;
  totalReviews: number;
}) {
  const walletShort = `${owner.wallet.slice(0, 6)}…${owner.wallet.slice(-4)}`;

  return (
    <Card className="mt-6 rounded-[2rem]">
      <Card.Content className="gap-6 p-6 md:flex-row md:items-start md:gap-8 md:p-8">
        <Avatar size="lg" className="h-20 w-20 text-xl">
          <Avatar.Fallback>{owner.initials}</Avatar.Fallback>
        </Avatar>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-medium tracking-tight md:text-3xl">
              {owner.name}
            </h1>
            {owner.verified ? (
              <Chip size="sm" variant="soft" color="accent">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                Dueño verificado
              </Chip>
            ) : (
              <Chip size="sm" variant="soft">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                Verificación en curso
              </Chip>
            )}
          </div>

          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="h-4 w-4" aria-hidden />
            {owner.city}, {owner.country}
          </p>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
            {owner.bio}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-foreground" aria-hidden />
              {avgRating.toFixed(1)} · {totalReviews} reseñas
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Clock3 className="h-4 w-4" aria-hidden />
              Responde en {owner.responseTime}
            </span>
            <span className="text-muted">
              {lodgingCount} {lodgingCount === 1 ? "alojamiento" : "alojamientos"}{" "}
              · en nomai desde {owner.since}
            </span>
          </div>
        </div>

        <Separator orientation="vertical" className="hidden md:block" />

        <div className="flex flex-col gap-2 md:w-64 md:pl-2">
          <Chip variant="soft" color="accent" className="w-fit font-mono">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            {walletShort}
          </Chip>
          <p className="text-xs leading-relaxed text-muted">
            Las reservas se pagan directo a esta wallet vía x402. nomai nunca
            toca los fondos del dueño.
          </p>
          <Chip variant="soft" color="success" className="w-fit">
            0% comisión · cobro instantáneo
          </Chip>
        </div>
      </Card.Content>
    </Card>
  );
}
