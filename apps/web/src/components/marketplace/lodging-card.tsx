"use client";

import { useState } from "react";
import NextLink from "next/link";
import { Avatar, Button, Card, Chip } from "@heroui/react";
import { BadgeCheck, Heart, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatNightPrice,
  ownerOf,
  KIND_LABEL,
  type Fiat,
  type FxRates,
  type Lodging,
} from "@/lib/lodgings";
import { LodgingArt } from "./lodging-art";

/**
 * Airbnb-style listing card, Material You flavour: a large-radius photo
 * container, a favourite heart, a tonal "featured" chip, and the Owner
 * attribution line that links to their storefront.
 * Prices render in the lodging's local fiat — or the Traveler's preferred
 * currency when `fiat` is set; the wFIAT settlement rail stays invisible.
 */
export function LodgingCard({
  lodging,
  fiat,
  rates,
}: {
  lodging: Lodging;
  fiat?: Fiat;
  /** Live rates from /api/fx; falls back to the static table when absent. */
  rates?: FxRates;
}) {
  const owner = ownerOf(lodging);
  const [favorite, setFavorite] = useState(false);

  return (
    <Card
      variant="transparent"
      className="group gap-0 p-0 transition-transform duration-300 hover:-translate-y-1"
    >
      <div className="relative">
        <LodgingArt
          lodging={lodging}
          className="aspect-[4/3] w-full rounded-[1.75rem] transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-terra/20"
        />
        {lodging.featured && (
          <Chip
            size="sm"
            variant="primary"
            color="accent"
            className="absolute left-3 top-3"
          >
            Favorito del viajero
          </Chip>
        )}
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={favorite ? "Quitar de favoritos" : "Guardar en favoritos"}
          aria-pressed={favorite}
          onPress={() => setFavorite((f) => !f)}
          className="absolute right-3 top-3 h-9 w-9 min-w-0 rounded-full bg-surface/85 text-foreground shadow-sm backdrop-blur-sm hover:bg-surface"
        >
          <Heart
            className={cn(
              "h-4 w-4 transition-colors",
              favorite && "fill-burn text-burn",
            )}
          />
        </Button>
      </div>

      <Card.Content className="gap-0 px-1 pt-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-snug">{lodging.name}</h3>
          <span className="flex shrink-0 items-center gap-1 pt-0.5 text-sm">
            <Star className="h-3.5 w-3.5 fill-foreground" aria-hidden />
            {lodging.rating.toFixed(1)}
            <span className="text-muted">({lodging.reviews})</span>
          </span>
        </div>
        <p className="text-sm text-muted">
          {KIND_LABEL[lodging.kind]} · {lodging.region}
        </p>
        <p className="text-sm text-muted">
          Hasta {lodging.guests} huéspedes · {lodging.bedrooms} dorm. ·{" "}
          {lodging.baths} baños
        </p>

        <NextLink
          href={`/propietarios/${owner.slug}`}
          className="group/owner mt-2 flex w-fit items-center gap-2"
        >
          <Avatar size="sm">
            <Avatar.Fallback>{owner.initials}</Avatar.Fallback>
          </Avatar>
          <span className="text-xs text-muted transition-colors group-hover/owner:text-foreground">
            por {owner.name}
          </span>
          {owner.verified && (
            <BadgeCheck
              className="h-3.5 w-3.5 text-burn"
              aria-label="Dueño verificado"
            />
          )}
        </NextLink>

        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className="font-mono text-[15px] font-semibold">
            {formatNightPrice(lodging, fiat, rates)}
          </span>
          <span className="text-sm text-muted">/ noche</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          Pago directo · 0% comisión · x402
        </p>
      </Card.Content>
    </Card>
  );
}
