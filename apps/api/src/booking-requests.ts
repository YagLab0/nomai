// Booking requests (ADR-0010) — the Agent proposes, the Traveler disposes.
//
// POST /bookings/requests creates a draft from a fresh server-side quote:
// no payment, no inventory hold, no escrow. The Traveler confirms it in the
// app, which runs the normal paid POST /listings/:slug/book x402 flow and
// then marks the request converted. The Owner sees nothing until then.
//
// All routes are Bearer-required; the verified user id IS the traveler_id.
// None of these routes match a paid pattern, so the x402 gate ignores them.

import { Hono } from "hono";
import {
  getListingBySlug,
  quoteStay,
  type DomainErrorCode,
} from "./data/index.js";
import { supabaseAdmin, travelerIdFrom } from "./auth.js";

const requests = new Hono();

function domainStatus(code: DomainErrorCode): 400 | 404 | 409 {
  switch (code) {
    case "not_found":
      return 404;
    case "unavailable":
      return 409;
    default:
      return 400;
  }
}

interface RequestRow {
  id: string;
  traveler_id: string;
  listing_id: string;
  checkin: string;
  checkout: string;
  guests: number;
  quote: Record<string, unknown>;
  total_minor: number;
  currency: string;
  status: string;
  booking_id: string | null;
  expires_at: string;
  created_at: string;
}

const shape = (r: RequestRow) => ({
  request_id: r.id,
  listing_id: r.listing_id,
  listing_slug:
    typeof (r.quote as { listing_slug?: unknown }).listing_slug === "string"
      ? (r.quote as { listing_slug: string }).listing_slug
      : undefined,
  checkin: r.checkin,
  checkout: r.checkout,
  guests: r.guests,
  quote: r.quote,
  total_minor: r.total_minor,
  total_display:
    typeof (r.quote as { total_display?: unknown }).total_display === "string"
      ? (r.quote as { total_display: string }).total_display
      : undefined,
  currency: r.currency,
  status: r.status,
  booking_id: r.booking_id,
  expires_at: r.expires_at,
  created_at: r.created_at,
});

// POST /bookings/requests — body:
//   { slug, checkin: YYYY-MM-DD, checkout: YYYY-MM-DD, guests: int }
// Quotes fresh server-side (the quote authority is never the caller), then
// inserts the draft. 201 { request_id, ..., status: "pending", expires_at }.
requests.post("/", async (c) => {
  const userId = await travelerIdFrom(c);
  if (!userId)
    return c.json({ error: "Iniciá sesión para pedir una reserva." }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    slug?: unknown;
    checkin?: unknown;
    checkout?: unknown;
    guests?: unknown;
  } | null;

  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const checkin = typeof body?.checkin === "string" ? body.checkin : "";
  const checkout = typeof body?.checkout === "string" ? body.checkout : "";
  const guests = body?.guests;
  if (!slug || !checkin || !checkout || !Number.isInteger(guests)) {
    return c.json(
      { error: "slug, checkin (YYYY-MM-DD), checkout (YYYY-MM-DD) and guests (int) are required" },
      400
    );
  }

  // Fresh server-side quote — validates dates, availability and price.
  const q = await quoteStay(slug, checkin, checkout, guests as number);
  if (!q.ok) {
    return c.json(
      { error: q.error.message, code: q.error.code },
      domainStatus(q.error.code)
    );
  }

  const listing = await getListingBySlug(slug);
  if (!listing) return c.json({ error: "listing not found", code: "not_found" }, 404);

  const { data: listingRow, error: listingErr } = await supabaseAdmin()
    .from("listings")
    .select("id")
    .eq("slug", listing.slug)
    .single();
  if (listingErr || !listingRow)
    return c.json({ error: "listing not found", code: "not_found" }, 404);

  const { data, error } = await supabaseAdmin().rpc("create_booking_request", {
    p_traveler_id: userId,
    p_listing_id: (listingRow as unknown as { id: string }).id,
    p_checkin: checkin,
    p_checkout: checkout,
    p_guests: guests as number,
    p_quote: q.quote as unknown as Record<string, never>,
    p_total_minor: q.quote.total_minor,
    p_currency: q.quote.currency,
  });
  if (error || !data) {
    return c.json({ error: "could not create the booking request" }, 500);
  }
  return c.json(shape(data as unknown as RequestRow), 201);
});

// GET /bookings/requests — the caller's drafts, newest first. The RPC marks
// past-due rows expired on read, so pending is never a lie.
requests.get("/", async (c) => {
  const userId = await travelerIdFrom(c);
  if (!userId)
    return c.json({ error: "Iniciá sesión para ver tus reservas." }, 401);

  const { data, error } = await supabaseAdmin().rpc("list_booking_requests", {
    p_traveler_id: userId,
  });
  if (error) return c.json({ error: "could not list booking requests" }, 500);
  return c.json({
    requests: ((data ?? []) as unknown as RequestRow[]).map(shape),
  });
});

// POST /bookings/requests/:id/cancel — withdraw a pending draft. No money
// ever moved, so there is no refund — just a status flip.
requests.post("/:id/cancel", async (c) => {
  const userId = await travelerIdFrom(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const { data, error } = await supabaseAdmin().rpc("cancel_booking_request", {
    p_traveler_id: userId,
    p_request_id: c.req.param("id"),
  });
  if (error) {
    const msg: string = error.message ?? "";
    if (msg.includes("not found"))
      return c.json({ error: "booking request not found", code: "not_found" }, 404);
    if (msg.includes("not pending"))
      return c.json(
        { error: "only pending requests can be cancelled", code: "invalid_state" },
        409
      );
    return c.json({ error: "could not cancel the booking request" }, 500);
  }
  return c.json(shape(data as unknown as RequestRow));
});

// POST /bookings/requests/:id/converted — called by the web after its paid
// booking succeeds: { booking_id }. Links the draft to the real Booking so
// the app stops offering to confirm it.
requests.post("/:id/converted", async (c) => {
  const userId = await travelerIdFrom(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    booking_id?: unknown;
  } | null;
  const bookingId =
    typeof body?.booking_id === "string" ? body.booking_id.trim() : "";
  if (!bookingId)
    return c.json({ error: "booking_id is required" }, 400);

  const { data, error } = await supabaseAdmin().rpc("convert_booking_request", {
    p_traveler_id: userId,
    p_request_id: c.req.param("id"),
    p_booking_id: bookingId,
  });
  if (error) {
    const msg: string = error.message ?? "";
    if (msg.includes("not found"))
      return c.json({ error: "booking request not found", code: "not_found" }, 404);
    if (msg.includes("not pending"))
      return c.json(
        { error: "only pending requests can be converted", code: "invalid_state" },
        409
      );
    return c.json({ error: "could not convert the booking request" }, 500);
  }
  return c.json(shape(data as unknown as RequestRow));
});

export default requests;
