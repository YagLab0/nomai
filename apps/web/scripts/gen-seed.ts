/**
 * Generates supabase/seed.sql from the marketplace mock inventory — the same
 * OWNERS/LODGINGS the UI renders today, so the DB and the mock stay in sync.
 *
 *   pnpm --filter api exec tsx ../../apps/web/scripts/gen-seed.ts > supabase/seed.sql
 *   (run from the repo root with the workspace tsx)
 */
import { LODGINGS, OWNERS } from "../src/lib/lodgings";

const q = (v: string | null | undefined) =>
  v == null ? "null" : `'${v.replace(/'/g, "''")}'`;
const n = (v: number | null | undefined) => (v == null ? "null" : String(v));
const arr = (xs: string[]) => `ARRAY[${xs.map(q).join(", ")}]::text[]`;

const lines: string[] = [
  "-- nomai seed — marketplace inventory ported from apps/web/src/lib/lodgings.ts.",
  "-- Regenerate: tsx apps/web/scripts/gen-seed.ts > supabase/seed.sql",
  "-- Idempotent: skips rows whose slug already exists.",
  "",
];

for (const o of OWNERS) {
  lines.push(
    `insert into public.owners (slug, name, city, country, country_code, since, wallet, verified, response_time, bio)` +
      ` values (${q(o.slug)}, ${q(o.name)}, ${q(o.city)}, ${q(o.country)}, ${q(o.countryCode)}, ${n(o.since)}, ${q(o.wallet)}, ${o.verified}, ${q(o.responseTime)}, ${q(o.bio)})` +
      ` on conflict (slug) do nothing;`
  );
}

lines.push("");

for (const l of LODGINGS) {
  lines.push(
    `insert into public.lodgings (owner_id, slug, name, kind, city, region, country_code, code, price_per_night, currency, blurb, rating, reviews, guests, bedrooms, baths, amenities, featured, photo_key, tone)` +
      ` values ((select id from public.owners where slug = ${q(l.ownerSlug)}),` +
      ` ${q(l.id)}, ${q(l.name)}, ${q(l.kind)}, ${q(l.city)}, ${q(l.region)}, ${q(l.countryCode)}, ${q(l.code)},` +
      ` ${n(l.pricePerNight)}, ${q(l.currency)}, ${q(l.blurb)}, ${n(l.rating)}, ${n(l.reviews)},` +
      ` ${n(l.guests)}, ${n(l.bedrooms)}, ${n(l.baths)}, ${arr(l.amenities)}, ${l.featured ?? false}, ${q(l.photo)}, ${q(l.tone)})` +
      ` on conflict (slug) do nothing;`
  );
}

console.log(lines.join("\n"));
