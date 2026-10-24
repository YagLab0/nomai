import { LISTINGS, LISTING_UNITS } from "./inventory.js";
import type { AvailabilityNight, AvailStatus } from "./types.js";

// Nightly availability for every listing, generated deterministically from
// the listing id. The PATTERN is reproducible run to run; the date window is
// always the next `DAYS` days from "today" so the mock stays bookable.
const DAYS = 90;
const CLEAN_DAYS = 14; // keep the near-term window open for demos

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: Date, n: number): Date {
  const d = new Date(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Every YYYY-MM-DD in [checkin, checkout) — "noches", not "días". */
export function nightsBetween(checkin: string, checkout: string): string[] {
  const out: string[] = [];
  for (
    let d = new Date(`${checkin}T00:00:00Z`);
    d < new Date(`${checkout}T00:00:00Z`);
    d = addDays(d, 1)
  ) {
    out.push(isoDay(d));
  }
  return out;
}

export function buildAvailability(now: Date): AvailabilityNight[] {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const nights: AvailabilityNight[] = [];

  for (const listing of LISTINGS) {
    const activeUnits =
      LISTING_UNITS.filter(
        (u) => u.listing_id === listing.id && u.status === "active"
      ).length || 1;
    const rng = mulberry32(seedFromId(listing.id));
    const weekendPremium = seedFromId(listing.id) % 2 === 0;

    for (let i = 0; i < DAYS; i++) {
      const d = addDays(today, i);
      const roll = rng();

      let status: AvailStatus = "open";
      if (i >= CLEAN_DAYS) {
        if (roll < 0.12) status = "blocked";
        else if (roll < 0.2) status = "booked";
      }

      // ~half the listings charge a weekend premium as a price override;
      // rate_rules handle season-level pricing on top.
      const dow = d.getUTCDay();
      const price_minor =
        weekendPremium && (dow === 5 || dow === 6)
          ? Math.round(listing.base_price_minor * 1.2)
          : null;

      nights.push({
        listing_id: listing.id,
        night: isoDay(d),
        status,
        units_available: status === "open" ? activeUnits : 0,
        price_minor,
      });
    }
  }
  return nights;
}
