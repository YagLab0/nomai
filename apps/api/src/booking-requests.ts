// Booking requests (ADR-0010) — the Agent proposes, the Traveler disposes.
//
// A request starts as an IDEA (only the place is required) and becomes
// PENDING (ready to pay) once dates/guests complete and a fresh server-side
// quote freezes. Confirmation runs the normal paid POST /listings/:slug/book
// x402 flow in the app and marks the request converted. The Owner sees
// nothing until then.
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
import type { Json } from "./database.types.js";

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
  origin: string;
  checkin: string | null;
  checkout: string | null;
  guests: number | null;
  quote: Record<string, unknown>;
  total_minor: number | null;
  currency: string | null;
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
  origin: r.origin,
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

async function listingId(slug: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("listings")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error || !data) return null;
  return (data as unknown as { id: string }).id;
}

// POST /bookings/requests — body: { slug, checkin?, checkout?, guests?,
// origin?: 'mcp'|'app'|'agent' }. Only the place is required: without dates
// the row is an IDEA; with dates it quotes fresh server-side and is PENDING.
requests.post("/", async (c) => {
  const userId = await travelerIdFrom(c);
  if (!userId)
    return c.json({ error: "Iniciá sesión para pedir una reserva." }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    slug?: unknown;
    checkin?: unknown;
    checkout?: unknown;
    guests?: unknown;
    origin?: unknown;
  } | null;

  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  if (!slug) return c.json({ error: "slug is required" }, 400);
  const origin =
    body?.origin === "app" || body?.origin === "agent" ? body.origin : "mcp";

  const listing = await getListingBySlug(slug);
  if (!listing) return c.json({ error: "listing not found", code: "not_found" }, 404);
  const id = await listingId(listing.slug);
  if (!id) return c.json({ error: "listing not found", code: "not_found" }, 404);

  const checkin = typeof body?.checkin === "string" ? body.checkin : null;
  const checkout = typeof body?.checkout === "string" ? body.checkout : null;
  const guests =
    typeof body?.guests === "number" && Number.isInteger(body.guests)
      ? (body.guests as number)
      : null;
  const dated = checkin !== null || checkout !== null || guests !== null;
  if (dated && (!checkin || !checkout || guests === null)) {
    return c.json(
      { error: "checkin (YYYY-MM-DD), checkout (YYYY-MM-DD) and guests (int) are all required together" },
      400
    );
  }

  let quote: Record<string, unknown> | null = null;
  let totalMinor: number | null = null;
  let currency: string | null = null;
  if (dated) {
    // Fresh server-side quote — the quote authority is never the caller.
    const q = await quoteStay(slug, checkin!, checkout!, guests!);
    if (!q.ok) {
      return c.json(
        { error: q.error.message, code: q.error.code },
        domainStatus(q.error.code)
      );
    }
    quote = q.quote as unknown as Record<string, unknown>;
    totalMinor = q.quote.total_minor;
    currency = q.quote.currency;
  } else {
    // An idea carries no quote yet — but it must remember its own place,
    // because complete() reads the stay params off the draft, never off the
    // client. The listing_slug is the draft's anchor, not a price.
    quote = { listing_slug: slug };
  }

  const params: {
    p_traveler_id: string;
    p_listing_id: string;
    p_origin: string;
    p_checkin?: string;
    p_checkout?: string;
    p_guests?: number;
    p_quote: Json;
    p_total_minor?: number;
    p_currency?: string;
  } = {
    p_traveler_id: userId,
    p_listing_id: id,
    p_origin: origin,
    p_quote: quote as unknown as Json,
  };
  if (dated) {
    params.p_checkin = checkin!;
    params.p_checkout = checkout!;
    params.p_guests = guests!;
    params.p_total_minor = totalMinor!;
    params.p_currency = currency!;
  }

  const { data, error } = await supabaseAdmin().rpc("create_booking_request", params);
  if (error || !data) {
    return c.json({ error: "could not create the booking request" }, 500);
  }
  return c.json(shape(data as unknown as RequestRow), 201);
});

// POST /bookings/requests/:id/complete — body: { checkin, checkout, guests }.
// Freezes a fresh server-side quote on an IDEA and flips it to PENDING.
requests.post("/:id/complete", async (c) => {
  const userId = await travelerIdFrom(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    checkin?: unknown;
    checkout?: unknown;
    guests?: unknown;
  } | null;
  const checkin = typeof body?.checkin === "string" ? body.checkin : "";
  const checkout = typeof body?.checkout === "string" ? body.checkout : "";
  const guests = body?.guests;
  if (!checkin || !checkout || !Number.isInteger(guests)) {
    return c.json(
      { error: "checkin (YYYY-MM-DD), checkout (YYYY-MM-DD) and guests (int) are required" },
      400
    );
  }

  // The draft, read server-side — the stay params land on the idea's own
  // listing; the client never names it.
  const { data: rows, error: listErr } = await supabaseAdmin().rpc(
    "list_booking_requests",
    { p_traveler_id: userId }
  );
  if (listErr) return c.json({ error: "could not read booking requests" }, 500);
  const draft = ((rows ?? []) as unknown as RequestRow[]).find(
    (r) => r.id === c.req.param("id")
  );
  if (!draft)
    return c.json({ error: "booking request not found", code: "not_found" }, 404);
  if (draft.status !== "idea") {
    return c.json(
      {
        error:
          draft.status === "pending"
            ? "this request is already ready to pay"
            : "only ideas can be completed",
        code: "invalid_state",
      },
      409
    );
  }
  const slug =
    typeof (draft.quote as { listing_slug?: unknown }).listing_slug === "string"
      ? (draft.quote as { listing_slug: string }).listing_slug
      : null;
  if (!slug)
    return c.json({ error: "booking request has no listing" }, 500);

  const q = await quoteStay(slug, checkin, checkout, guests as number);
  if (!q.ok) {
    return c.json(
      { error: q.error.message, code: q.error.code },
      domainStatus(q.error.code)
    );
  }

  const { data, error } = await supabaseAdmin().rpc("complete_booking_request", {
    p_traveler_id: userId,
    p_request_id: draft.id,
    p_checkin: checkin,
    p_checkout: checkout,
    p_guests: guests as number,
    p_quote: q.quote as unknown as Record<string, never>,
    p_total_minor: q.quote.total_minor,
    p_currency: q.quote.currency,
  });
  if (error) {
    const msg: string = error.message ?? "";
    if (msg.includes("not found"))
      return c.json({ error: "booking request not found", code: "not_found" }, 404);
    return c.json({ error: "could not complete the booking request" }, 500);
  }
  return c.json(shape(data as unknown as RequestRow));
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

// POST /bookings/requests/:id/cancel — withdraw a draft (idea or pending).
// No money ever moved, so there is no refund — just a status flip.
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
    if (msg.includes("can be cancelled"))
      return c.json(
        { error: "only ideas and pending requests can be cancelled", code: "invalid_state" },
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
