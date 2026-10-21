import {
  BedDouble,
  Building2,
  Home,
  Hotel,
  Sparkles,
  Trees,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ArtTone, Lodging, LodgingKind } from "@/lib/lodgings";

/**
 * CSS-only placeholder artwork for a Lodging — a warm gradient keyed by
 * `tone`, a watermark icon keyed by `kind`, and a location stamp.
 * Server-safe: no client hooks, so cards can render inside server pages.
 */

const TONES: Record<ArtTone, string> = {
  sunset: "from-[#f0a35e] via-[#d97e3f] to-[#8f3f20]",
  terracota: "from-[#d98a63] via-[#b4552d] to-[#6e2f14]",
  gold: "from-[#f6d38b] via-[#e0a43b] to-[#9c6a1e]",
  forest: "from-[#8fa873] via-[#5c7a4a] to-[#33472a]",
  laguna: "from-[#7fc4b5] via-[#3f9e8f] to-[#1f5f55]",
  dusk: "from-[#9b8ec4] via-[#6a5a9e] to-[#33200f]",
};

const KIND_ICON: Record<LodgingKind, LucideIcon> = {
  posada: BedDouble,
  cabana: Trees,
  departamento: Building2,
  casa: Home,
  hostal: Hotel,
  "hotel-boutique": Sparkles,
};

export function LodgingArt({
  lodging,
  className,
}: {
  lodging: Lodging;
  className?: string;
}) {
  const Icon = KIND_ICON[lodging.kind];
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden bg-gradient-to-br",
        TONES[lodging.tone],
        className,
      )}
    >
      <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <div className="absolute -bottom-12 -left-6 h-44 w-44 rounded-full bg-black/10 blur-2xl" />
      <Icon
        className="absolute -bottom-5 -right-4 h-28 w-28 text-white/25"
        strokeWidth={1.25}
      />
      <span className="absolute bottom-3.5 left-4 font-mono text-[10px] uppercase tracking-widest text-white/75">
        {lodging.city} · {lodging.countryCode}
      </span>
    </div>
  );
}
