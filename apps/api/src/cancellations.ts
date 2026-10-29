// Booking cancellation — POST /bookings/:id/cancel (issue #18, ADR-0004).
//
// Only the Traveler (or their Agent quoting the booking's refs) can cancel;
// the Owner never initiates one — the money sits in THEIR wallet, so the
// refund flows back from them. cancel_booking() enforces that and the
// confirmed-only rule inside the same transaction that releases the nights
// and records the refund intent in payments.
//
// Kept out of listings.ts on purpose: the x402 Booking middleware is being
// wired onto POST /listings/:slug/book in parallel — this router owns only
// the cancel surface.
//
// It also owns the Agent's read + Claim surface (ADR-0006):
//   GET  /bookings?guest_ref=|traveler_id=  → { bookings: BookingSummary[] }
//   GET  /bookings/:id[?guest_ref=]         → { booking: BookingDetail }
//   POST /bookings/:id/claim                → { ok, booking_id, status }
// Same ownership proof as cancel: guest_ref (or traveler_id) must match.

import { Hono, type Context } from "hono";
import {
  CLAIM_REASONS,
  cancelBooking,
  getBookingDetail,
  listBookings,
  openClaim,
  submitReview,
  type CancelErrorCode,
  type ClaimErrorCode,
  type ClaimReason,
  type ReviewCategories,
  type ReviewErrorCode,
} from "./data/index.js";
import { travelerIdFrom } from "./auth.js";

const bookings = new Hono();

function errorStatus(
  code: CancelErrorCode | ClaimErrorCode | ReviewErrorCode
): 400 | 403 | 404 | 409 | 500 {
  switch (code) {
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    case "invalid_rating":
    case "invalid":
      return 400;
    case "not_cancellable":
    case "invalid_state":
    case "claim_window_closed":
    case "not_reviewable":
    case "window_closed":
    case "already_reviewed":
      return 409;
    default:
      // no_policy — broken data, not the caller's fault.
      return 500;
  }
}

const owner = (q: { guest_ref?: string; traveler_id?: string }) => ({
  guest_ref: q.guest_ref?.trim() || undefined,
  traveler_id: q.traveler_id?.trim() || undefined,
});

// traveler_id is only honored as an ownership proof when the Bearer token
// verifies it — otherwise anyone could enumerate/cancel a Booking by UUID.
// guest_ref stays an open possession proof. Returns an error Response or null.
async function checkTravelerId(c: Context, who: { traveler_id?: string }) {
  if (!who.traveler_id) return null;
  const authId = await travelerIdFrom(c);
  if (!authId) return c.json({ error: "unauthorized" }, 401);
  if (authId !== who.traveler_id) return c.json({ error: "forbidden" }, 403);
  return null;
}

// GET /bookings?guest_ref=&traveler_id= — the caller's Bookings, newest first.
bookings.get("/", async (c) => {
  const who = owner(c.req.query());
  if (!who.guest_ref && !who.traveler_id)
    return c.json({ error: "guest_ref or traveler_id is required" }, 400);
  const denied = await checkTravelerId(c, who);
  if (denied) return denied;
  return c.json({ bookings: await listBookings(who) });
});

// GET /bookings/:id — full row incl. Escrow dates and Claim state. guest_ref /
// traveler_id are optional here; when given they must match (403 otherwise).
bookings.get("/:id", async (c) => {
  const who = owner(c.req.query());
  const denied = await checkTravelerId(c, who);
  if (denied) return denied;
  const r = await getBookingDetail(c.req.param("id"), who);
  if (!r.ok)
    return c.json(
      { error: r.error.message, code: r.error.code },
      errorStatus(r.error.code)
    );
  return c.json({ booking: r.booking });
});

// POST /bookings/:id/claim — body:
//   { guest_ref: string, reason: 'no_access'|'not_as_described'|'owner_no_show',
//     evidence?: object | string }
// Traveler-only, open until 24 h after check-in (ADR-0006). traveler_id is
// accepted in place of guest_ref, same as cancel.
bookings.post("/:id/claim", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    guest_ref?: string;
    traveler_id?: string;
    reason?: string;
    evidence?: unknown;
  } | null;
  const who = owner({
    guest_ref: typeof body?.guest_ref === "string" ? body.guest_ref : undefined,
    traveler_id:
      typeof body?.traveler_id === "string" ? body.traveler_id : undefined,
  });
  if (!who.guest_ref && !who.traveler_id)
    return c.json({ error: "guest_ref is required" }, 400);
  const denied = await checkTravelerId(c, who);
  if (denied) return denied;
  if (!CLAIM_REASONS.includes(body?.reason as ClaimReason))
    return c.json(
      { error: `reason must be one of ${CLAIM_REASONS.join(", ")}` },
      400
    );

  const ev = body?.evidence;
  if (ev != null && typeof ev !== "object" && typeof ev !== "string")
    return c.json({ error: "evidence must be an object or a string" }, 400);
  const evidence =
    typeof ev === "string"
      ? { note: ev }
      : (ev as Record<string, unknown> | unknown[] | undefined);

  const r = await openClaim(c.req.param("id"), {
    ...who,
    reason: body!.reason as ClaimReason,
    evidence: evidence ?? undefined,
  });
  if (!r.ok)
    return c.json(
      { error: r.error.message, code: r.error.code },
      errorStatus(r.error.code)
    );
  return c.json({ ok: true, ...r.claim });
});

// POST /bookings/:id/cancel — body (optional until auth lands):
//   { guest_ref?: string, traveler_id?: string }
// The caller must match the booking's guest_ref or traveler_id — today that
// match is the proof; the real-auth ticket swaps these params for the
// verified Traveler id without touching this route's contract.
bookings.post("/:id/cancel", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    guest_ref?: string;
    traveler_id?: string;
  } | null;

  const denied = await checkTravelerId(c, {
    traveler_id: body?.traveler_id,
  });
  if (denied) return denied;

  const r = await cancelBooking(c.req.param("id"), {
    guest_ref: body?.guest_ref,
    traveler_id: body?.traveler_id,
  });
  if (!r.ok)
    return c.json(
      { error: r.error.message, code: r.error.code },
      errorStatus(r.error.code)
    );

  const x = r.cancellation;
  return c.json({
    booking_id: x.booking_id,
    status: x.status,
    checkin: x.checkin,
    checkout: x.checkout,
    policy_name: x.policy_name,
    days_until_checkin: x.days_until_checkin,
    refund_pct: x.refund_pct,
    refund_minor: x.refund_minor,
    refund_display: x.refund_display,
    currency: x.currency,
  });
});

// POST /bookings/:id/review — the Traveler's Review of the stay (issue #51,
// ADR-0008). Bearer-required: submit_review() re-checks inside one
// transaction that the Booking completed, the 14-day window is open and the
// caller IS that Booking's Traveler — the route never trusts body fields.
// Body: { rating: 1..5, body?: string, categories?: {cleanliness, accuracy,
//          checkin, communication, location, value} }.
bookings.post("/:id/review", async (c) => {
  const userId = await travelerIdFrom(c);
  if (!userId)
    return c.json({ error: "Iniciá sesión para dejar tu reseña." }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    rating?: unknown;
    body?: unknown;
    categories?: unknown;
  } | null;
  if (!Number.isInteger(body?.rating))
    return c.json({ error: "rating must be an integer between 1 and 5", code: "invalid_rating" }, 400);

  const cats = (body?.categories ?? {}) as ReviewCategories;
  const r = await submitReview({
    userId,
    bookingId: c.req.param("id"),
    direction: "to_lodging",
    rating: body!.rating as number,
    body: typeof body?.body === "string" ? body.body : null,
    categories: cats,
  });
  if (!r.ok)
    return c.json(
      { error: r.error.message, code: r.error.code },
      errorStatus(r.error.code)
    );
  return c.json({ ok: true, review_id: r.review_id, score: r.score }, 201);
});

export default bookings;
