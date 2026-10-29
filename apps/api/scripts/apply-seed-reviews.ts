// Applies the review fixtures (src/data/review-fixtures.ts) to the linked
// project: completed Bookings + their to_lodging Reviews, then recomputes
// the cached aggregates via refresh_review_scores. Idempotent
// (on-conflict ignore). The rest of the catalog seed already lives on the
// remote — this is the slice db query can't run as one prepared statement.
//
//   cd apps/api && ./node_modules/.bin/tsx scripts/apply-seed-reviews.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { REVIEW_BUSINESS, REVIEW_FIXTURES } from "../src/data/review-fixtures.js";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "")])
);

const db = createClient(env.SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const bookings = REVIEW_FIXTURES.map((r) => ({
  id: r.booking,
  listing_id: r.listing,
  checkin: r.checkin,
  checkout: r.checkout,
  guests: r.guests,
  total_minor: r.total_minor,
  currency: r.currency,
  status: "completed",
  escrow_status: "released",
  // cancel_deadline = checkin − 5d (ADR-0006); the escrow already released.
  cancel_deadline: new Date(Date.parse(r.checkin + "T00:00:00Z") - 5 * 86400_000)
    .toISOString().slice(0, 10),
  first_release_at: `${r.checkin}T13:00:00Z`,
  final_release_at: `${r.checkin}T13:00:00Z`,
  created_at: new Date(Date.parse(r.checkin + "T00:00:00Z") - 20 * 86400_000).toISOString(),
}));

const reviews = REVIEW_FIXTURES.map((r) => ({
  booking_id: r.booking,
  direction: "to_lodging",
  author_name: r.author,
  subject_listing_id: r.listing,
  rating: r.rating,
  cleanliness: r.scores.cleanliness ?? null,
  accuracy: r.scores.accuracy ?? null,
  checkin: r.scores.checkin ?? null,
  communication: r.scores.communication ?? null,
  location: r.scores.location ?? null,
  value: r.scores.value ?? null,
  body: r.body,
  reply_body: r.reply ?? null,
  replied_at: r.reply ? r.created : null,
  created_at: r.created,
}));

const { error: bErr } = await db.from("bookings").upsert(bookings, { ignoreDuplicates: true });
if (bErr) { console.error("bookings:", bErr.message); process.exit(1); }
console.log(`bookings: ${bookings.length} rows`);

const { error: rErr } = await db.from("reviews").upsert(reviews, { ignoreDuplicates: true });
if (rErr) { console.error("reviews:", rErr.message); process.exit(1); }
console.log(`reviews: ${reviews.length} rows`);

for (const listing of [...new Set(REVIEW_FIXTURES.map((r) => r.listing))]) {
  const { error } = await db.rpc("refresh_review_scores", {
    p_listing_id: listing,
    p_business_id: REVIEW_BUSINESS[listing],
  });
  if (error) { console.error(`refresh ${listing}:`, error.message); process.exit(1); }
  const { data } = await db.from("listings").select("rating,reviews").eq("id", listing).single();
  console.log(`  ${listing}: ★${data?.rating} (${data?.reviews} reseñas)`);
}
console.log("done");
