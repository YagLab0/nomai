// E2E smoke for the listings API — run with `pnpm smoke:listings` while
// `pnpm api:dev` is up (NOMAI_API_URL overrides the base).
//
//   1. search city + dates          → at least one card with stay totals
//   2. detail of a single-unit listing
//   3. quote                        → night breakdown must sum to total
//   4. book                         → 201 + booking_id
//   5. re-book same stay            → 409 (the only unit is gone)
//   6. search again, same dates     → booked listing no longer appears
//
// Single-unit listings make 4–6 deterministic. Re-runs pick different dates
// inside the clean availability window; if the store is exhausted, restart
// the api (availability is in-memory).

const BASE = (process.env.NOMAI_API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  ""
);

let failures = 0;
const step = (name: string) => console.log(`\n▸ ${name}`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};

const assert = (cond: boolean, msg: string) =>
  cond ? ok(msg) : fail(msg);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

const get = async (path: string) => {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
};

async function main() {
  const checkin = iso(plusDays(3 + Math.floor(Math.random() * 7)));
  const coDate = new Date(`${checkin}T00:00:00Z`);
  coDate.setUTCDate(coDate.getUTCDate() + 3);
  const checkout = iso(coDate);
  console.log(`smoke-listings → ${BASE}  [${checkin} → ${checkout}, 2 guests]`);

  // 1 ─ search
  step("search: Buenos Aires + dates");
  const search = await get(
    `/listings/search?city=buenos%20aires&checkin=${checkin}&checkout=${checkout}&guests=2`
  );
  assert(search.status === 200, `search returned ${search.status}`);
  const cards = (search.body?.results ?? []) as {
    slug: string;
    total_minor?: number;
    total_display?: string;
  }[];
  assert(cards.length >= 1, `${cards.length} results with availability`);
  assert(
    cards.every((c) => c.total_minor != null && c.total_display != null),
    "every card carries total_minor + total_display"
  );

  // 2 ─ detail of a single-unit listing (re-book → 409 needs exactly 1 unit)
  step("detail: find a single-unit listing");
  let slug: string | null = null;
  for (const card of cards) {
    const d = await get(`/listings/${card.slug}`);
    if (d.status === 200 && d.body?.units_available === 1) {
      slug = card.slug;
      ok(`picked ${slug} (${d.body.title})`);
      break;
    }
  }
  if (!slug) {
    fail("no single-unit listing found for these dates — restart the api to reset availability");
    process.exit(1);
  }

  // 3 ─ quote
  step(`quote: ${slug}`);
  const quote = await get(
    `/listings/${slug}/quote?checkin=${checkin}&checkout=${checkout}&guests=2`
  );
  assert(quote.status === 200, `quote returned ${quote.status}`);
  const q = quote.body;
  assert(q?.nights?.length === 3, `3 nights quoted (got ${q?.nights?.length})`);
  const sum =
    (q?.nights ?? []).reduce(
      (s: number, n: { price_minor: number }) => s + n.price_minor,
      0
    ) + (q?.cleaning_minor ?? 0);
  assert(
    sum === q?.total_minor,
    `breakdown sums to total (${sum} = ${q?.total_minor})`
  );
  ok(`total: ${q?.total_display}`);

  // 4 ─ book
  step(`book: ${slug}`);
  const book = await fetch(`${BASE}/listings/${slug}/book`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkin, checkout, guests: 2, guest_ref: "smoke" }),
  });
  const bookBody = await book.json().catch(() => null);
  assert(book.status === 201, `book returned ${book.status}`);
  assert(!!bookBody?.booking_id, `booking_id: ${bookBody?.booking_id}`);

  // 5 ─ re-book → 409
  step("re-book same stay → expect 409");
  const rebook = await fetch(`${BASE}/listings/${slug}/book`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ checkin, checkout, guests: 2 }),
  });
  assert(rebook.status === 409, `rebook returned ${rebook.status}`);

  // 6 ─ search again → booked listing gone
  step("search again — booked listing must be absent");
  const search2 = await get(
    `/listings/search?city=buenos%20aires&checkin=${checkin}&checkout=${checkout}&guests=2`
  );
  const slugs2 = (search2.body?.results ?? []).map(
    (c: { slug: string }) => c.slug
  );
  assert(!slugs2.includes(slug), `${slug} no longer appears for those dates`);

  console.log(
    failures === 0
      ? "\n✅ smoke-listings passed"
      : `\n❌ ${failures} check(s) failed`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n❌ smoke-listings crashed: ${err.message}`);
  process.exit(1);
});
