// E2E smoke for the listings + bookings API — run with `pnpm smoke:listings`
// while `pnpm api:dev` is up (NOMAI_API_URL overrides the base).
//
//   1. search city + dates          → at least one card with stay totals
//   2. detail                       → carries `occupied` (unavailable nights)
//   3. quote                        → nights + cleaning + Service fee = total
//   4. book, no payment             → 402 (x402-gated: the Agent must pay)
//   5. book, bad body               → 400 (precheck answers before the 402)
//   6. search again, same dates     → listing still there (a 402 holds nothing)
//   7. GET /bookings                → 400 without guest_ref; [] for a fresh one
//   8. GET /bookings/:id            → 404 for an unknown booking
//   9. cancel / claim unknown id    → 404; claim with a bad reason → 400
//
// A paid Booking needs a funded buyer wallet — exercise that with
// `pnpm api:buy`, not here. Everything above is read-only, so re-runs are safe.

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

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    headers: res.headers,
    body: await res.json().catch(() => null),
  };
};

async function main() {
  const checkin = iso(plusDays(3 + Math.floor(Math.random() * 7)));
  const coDate = new Date(`${checkin}T00:00:00Z`);
  coDate.setUTCDate(coDate.getUTCDate() + 3);
  const checkout = iso(coDate);
  const guestRef = `smoke-${Date.now().toString(36)}`;
  console.log(`smoke-listings → ${BASE}  [${checkin} → ${checkout}, 2 guests]`);

  // 1 ─ search
  step("search: Buenos Aires + dates");
  const searchPath = `/listings/search?city=buenos%20aires&checkin=${checkin}&checkout=${checkout}&guests=2`;
  const search = await get(searchPath);
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
  if (cards.length === 0) {
    fail("no listing available for these dates — nothing left to exercise");
    process.exit(1);
  }
  const slug = cards[0].slug;

  // 2 ─ detail
  step(`detail: ${slug}`);
  const detail = await get(`/listings/${slug}`);
  assert(detail.status === 200, `detail returned ${detail.status}`);
  const occupied = detail.body?.occupied;
  assert(
    Array.isArray(occupied) &&
      occupied.every((d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)),
    `occupied is an array of YYYY-MM-DD (${occupied?.length ?? "missing"})`
  );
  assert(
    !(occupied ?? []).some((d: string) => d >= checkin && d < checkout),
    "no occupied night inside the searched stay"
  );

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
    ) +
    (q?.cleaning_minor ?? 0) +
    (q?.service_fee_minor ?? 0);
  assert(
    sum === q?.total_minor,
    `nights + cleaning + service fee = total (${sum} = ${q?.total_minor})`
  );
  ok(`total: ${q?.total_display}`);

  // 4 ─ unpaid book → 402
  step(`book without payment: ${slug} → expect 402`);
  const book = await post(`/listings/${slug}/book`, {
    checkin,
    checkout,
    guests: 2,
    guest_ref: guestRef,
  });
  assert(book.status === 402, `book returned ${book.status}`);
  assert(
    book.headers.has("payment-required") || book.body != null,
    "402 carries the payment requirements"
  );

  // 5 ─ bad body → 400 before the paywall
  step("book with a bad body → expect 400");
  const bad = await post(`/listings/${slug}/book`, { checkin });
  assert(bad.status === 400, `bad book returned ${bad.status}`);

  // 6 ─ unpaid attempt must not hold inventory
  step("search again — listing must still be available");
  const search2 = await get(searchPath);
  const slugs2 = (search2.body?.results ?? []).map(
    (c: { slug: string }) => c.slug
  );
  assert(slugs2.includes(slug), `${slug} still appears for those dates`);

  // 7 ─ booking list
  step("GET /bookings");
  const noRef = await get("/bookings");
  assert(noRef.status === 400, `no guest_ref → ${noRef.status}`);
  const mine = await get(`/bookings?guest_ref=${guestRef}`);
  assert(mine.status === 200, `list returned ${mine.status}`);
  assert(
    Array.isArray(mine.body?.bookings) && mine.body.bookings.length === 0,
    `fresh guest_ref has no bookings (${mine.body?.bookings?.length})`
  );

  // 8 ─ booking detail
  step("GET /bookings/:id unknown → expect 404");
  const missing = await get("/bookings/bkg_smoke_missing");
  assert(missing.status === 404, `detail returned ${missing.status}`);

  // 9 ─ cancel + claim error paths
  step("cancel / claim error paths");
  const cancel = await post("/bookings/bkg_smoke_missing/cancel", {
    guest_ref: guestRef,
  });
  assert(cancel.status === 404, `cancel unknown → ${cancel.status}`);
  const claim = await post("/bookings/bkg_smoke_missing/claim", {
    guest_ref: guestRef,
    reason: "no_access",
  });
  assert(claim.status === 404, `claim unknown → ${claim.status}`);
  const badReason = await post("/bookings/bkg_smoke_missing/claim", {
    guest_ref: guestRef,
    reason: "bored",
  });
  assert(badReason.status === 400, `claim bad reason → ${badReason.status}`);

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
