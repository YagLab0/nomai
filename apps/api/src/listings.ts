// Public listings API — read endpoints plus the Booking stub.
//
// The Agent reaches these through its tools over HTTP; the mock store lives
// behind src/data/repo.ts so swapping it for Supabase changes nothing here.
// POST /:slug/book is where the x402 middleware will plug in later — the
// shape of request/response already matches what the paid flow needs.

import { Hono } from "hono";
import {
  bookListing,
  getListingBySlug,
  quoteStay,
  searchListings,
  type DomainErrorCode,
} from "./data/index.js";

const listings = new Hono();

function errorStatus(code: DomainErrorCode): 400 | 404 | 409 {
  switch (code) {
    case "not_found":
      return 404;
    case "unavailable":
      return 409;
    default:
      return 400;
  }
}

// GET /listings/search?city=&country=&checkin=&checkout=&guests=&type=
//                      &amenities=wifi,piscina&max_price_minor=
listings.get("/search", async (c) => {
  const q = c.req.query();
  const amenities = c.req
    .queries("amenities")
    ?.flatMap((v) => v.split(","))
    .map((s) => s.trim())
    .filter(Boolean);

  const guests = q.guests != null ? Number(q.guests) : undefined;
  const maxPrice =
    q.max_price_minor != null ? Number(q.max_price_minor) : undefined;
  if (guests != null && (!Number.isInteger(guests) || guests < 1))
    return c.json({ error: "guests must be a positive integer" }, 400);
  if (maxPrice != null && !Number.isFinite(maxPrice))
    return c.json({ error: "max_price_minor must be a number" }, 400);

  const checkin = q.checkin;
  const checkout = q.checkout;
  if ((checkin && !checkout) || (!checkin && checkout))
    return c.json({ error: "checkin and checkout must be provided together" }, 400);

  // The backend may be the in-memory mock (sync) or Supabase (async) — the
  // data-source switch lives in src/data/index.ts, issue #12.
  return c.json({
    results: await searchListings({
      city: q.city,
      country: q.country,
      checkin,
      checkout,
      guests,
      type: q.type,
      amenities,
      max_price_minor: maxPrice,
    }),
  });
});

// GET /listings/:slug — full detail.
listings.get("/:slug", async (c) => {
  const detail = await getListingBySlug(c.req.param("slug"));
  if (!detail) return c.json({ error: "listing not found" }, 404);
  return c.json(detail);
});

// GET /listings/:slug/quote?checkin=&checkout=&guests= — night-by-night price.
listings.get("/:slug/quote", async (c) => {
  const { checkin, checkout, guests } = c.req.query();
  if (!checkin || !checkout)
    return c.json({ error: "checkin and checkout are required" }, 400);
  const g = guests != null ? Number(guests) : 1;
  if (!Number.isInteger(g) || g < 1)
    return c.json({ error: "guests must be a positive integer" }, 400);

  const r = await quoteStay(c.req.param("slug"), checkin, checkout, g);
  if (!r.ok)
    return c.json(
      { error: r.error.message, code: r.error.code },
      errorStatus(r.error.code)
    );
  return c.json(r.quote);
});

// POST /listings/:slug/book — Booking stub, no payment yet.
// Body: { checkin, checkout, guests, guest_ref? }
listings.post("/:slug/book", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    checkin?: string;
    checkout?: string;
    guests?: number;
    guest_ref?: string;
  } | null;
  if (!body?.checkin || !body.checkout || body.guests == null)
    return c.json(
      { error: "body must include checkin, checkout and guests" },
      400
    );
  if (!Number.isInteger(body.guests) || body.guests < 1)
    return c.json({ error: "guests must be a positive integer" }, 400);

  const r = await bookListing(c.req.param("slug"), {
    checkin: body.checkin,
    checkout: body.checkout,
    guests: body.guests,
    guest_ref: body.guest_ref,
  });
  if (!r.ok)
    return c.json(
      { error: r.error.message, code: r.error.code },
      errorStatus(r.error.code)
    );

  return c.json(
    {
      booking_id: r.booking.id,
      listing_slug: c.req.param("slug"),
      status: r.booking.status,
      checkin: r.booking.checkin,
      checkout: r.booking.checkout,
      guests: r.booking.guests,
      nights_count: r.quote.nights_count,
      total_minor: r.booking.total_minor,
      total_display: r.quote.total_display,
      currency: r.quote.currency,
    },
    201
  );
});

export default listings;
