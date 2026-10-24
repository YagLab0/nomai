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

import { Hono } from "hono";
import { cancelBooking, type CancelErrorCode } from "./data/index.js";

const bookings = new Hono();

function errorStatus(code: CancelErrorCode): 403 | 404 | 409 | 500 {
  switch (code) {
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    case "not_cancellable":
      return 409;
    default:
      // no_policy — broken data, not the caller's fault.
      return 500;
  }
}

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

export default bookings;
