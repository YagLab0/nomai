// The paid Booking endpoint — POST /listings/:slug/book behind x402 (issue #14).
//
// Ordering in this SDK (verified in @x402/hono's middleware): verify → handler
// → settle. So a booking can never be written "after payment" inside the
// handler — instead the pieces split across the flow:
//
//   1. bookingPrecheck (mounted before the payment middleware): validates the
//      body and re-quotes the stay, so bad input still gets the domain
//      400/404/409 even when the request carries no payment.
//   2. Dynamic `payTo`/`price` on the route re-resolve per request — the 402
//      and the verify step always see a FRESH server-side quote and the
//      shared Escrow vault (ESCROW_ADDRESS), never a stale quote.
//   3. The handler runs bookListing → book_stay lands the row as
//      'pending_payment' and holds the nights (the payment signature is
//      verified by then; holding inventory here is what prevents double-sells).
//   4. onAfterSettle → confirm_booking_payment: pending_payment → confirmed +
//      the settlement receipt into `payments` (facilitator_ref = booking_id,
//      the reference the payment-identifier extension round-trips).
//   5. onSettleFailure / onVerifiedPaymentCanceled → release_booking:
//      cancelled + every held unit handed back to its night.
//
// A settle that succeeded while the confirm hook failed would leave the row
// 'pending_payment' — logged loudly below for manual reconciliation; the hook
// is idempotent so a replay of the same payment fixes the state.
//
// Note on the response: the SDK buffers the handler body BEFORE settling, so
// tx_hash physically cannot go in the JSON body — it travels in the
// PAYMENT-RESPONSE header ({transaction, payer, network}). explorer_url is
// CONFIG.explorer + '/tx/' + that hash, assembled client-side.

import type { MiddlewareHandler } from "hono";
import { getAddress } from "viem";
import type {
  HTTPRequestContext,
  HTTPTransportContext,
  RouteConfig,
  SettleContext,
  SettleResultContext,
} from "@x402/core/server";
import {
  ACCEPTED_TOKENS,
  CAIP2,
  FIAT_WFIAT,
  NEEDS_PERMIT2_SPONSORING,
} from "./x402.js";
import type { x402ResourceServer } from "@x402/hono";
import { optionalTravelerId } from "./auth.js";
import { createSupabaseAdmin } from "./supabase.js";
import {
  LISTINGS_DATA_SOURCE,
  quoteStay,
  releaseMockBooking,
  settleMockBooking,
  type DomainErrorCode,
} from "./data/index.js";

export const BOOKING_ROUTE_PATTERN = "POST /listings/:slug/book";

// ---------------------------------------------------------------------------
// request → booking input
// ---------------------------------------------------------------------------

const BOOK_PATH_RE = /^\/listings\/([^/]+)\/book\/?$/;

interface BookingRequest {
  slug: string;
  checkin: string;
  checkout: string;
  guests: number;
  guest_ref?: string;
}

function parseBookingBody(body: unknown): Omit<BookingRequest, "slug"> | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b.checkin !== "string" ||
    typeof b.checkout !== "string" ||
    typeof b.guests !== "number"
  )
    return null;
  return {
    checkin: b.checkin,
    checkout: b.checkout,
    guests: b.guests,
    guest_ref: typeof b.guest_ref === "string" ? b.guest_ref : undefined,
  };
}

/** slug + stay fields out of the raw request — used by the dynamic fns. */
async function bookingInput(
  context: HTTPRequestContext
): Promise<BookingRequest | null> {
  const m = BOOK_PATH_RE.exec(context.path);
  let rawBody: unknown = null;
  try {
    rawBody = await context.adapter.getBody?.();
  } catch {
    rawBody = null;
  }
  const body = parseBookingBody(rawBody);
  if (!m || !body) return null;
  return { slug: m[1], ...body };
}

// ---------------------------------------------------------------------------
// settlement asset — the Booking charges in the Lodging's own currency as
// its wFIAT (issue #58): an ARS-priced Lodging settles in wARS, which is
// what the Traveler actually Funds through the ramp. USD is the only
// USDC-denominated case — its minor units carry 1:1 into the token.
// ACCEPTED_TOKENS (X402_ASSETS) is the hard cap — a currency whose token
// isn't configured fails explicitly, never silently in another asset.
// Cross-wFIAT stays a documented gap (the FIAT_WFIAT note in x402.ts): a
// Traveler holding wARS who books a BRL Lodging must Fund wBRL first, and
// a Lodging priced in a fiat with no wFIAT (UYU) cannot be charged at
// all — falling back to USDC would bill the wrong amount, not just the
// wrong token.
// ---------------------------------------------------------------------------

function tokenForCurrency(currency: string) {
  const fiat = currency.trim().toUpperCase();
  const symbol = FIAT_WFIAT[fiat] ?? (fiat === "USD" ? "usdc" : null);
  if (symbol == null)
    throw new Error(
      `book: currency ${currency} has no settlement asset — no wFIAT exists for it`
    );
  const token = ACCEPTED_TOKENS.find((t) => t.symbol === symbol);
  if (!token)
    throw new Error(
      `book: ${currency} settles in ${symbol}, which is not in X402_ASSETS`
    );
  return token;
}

/** Domain minor units (10^-6 display) → the token's atomic units. */
function toAtomic(totalMinor: number, decimals: number): string {
  return (BigInt(totalMinor) * 10n ** BigInt(decimals - 6)).toString();
}

/** Atomic → domain minor units, for the payments row (must not go fractional). */
function toMinor(atomic: string, decimals: number): string {
  const scale = 10n ** BigInt(decimals - 6);
  return (BigInt(atomic) / scale).toString();
}

// ---------------------------------------------------------------------------
// dynamic price / payTo — re-resolved on every 402 AND on every verify.
// A throw here surfaces as a 500 from the middleware: bookingPrecheck maps the
// domain errors first, so reaching the price fn means the stay is quotable.
// ---------------------------------------------------------------------------

async function resolvePayTo(): Promise<string> {
  // The shared Escrow vault (ADR-0006, issue #61) — every Booking's payment
  // settles into it, and the Owner is paid by releases from the vault,
  // never at settle time. The vault is REQUIRED: a Booking must never fall
  // back to paying the Owner's payout_address or the platform wallet
  // directly. The throw surfaces as an explicit failure from the
  // middleware; bookingPrecheck gates the same condition with a clean 503.
  const vault = process.env.ESCROW_ADDRESS;
  if (!vault)
    throw new Error(
      "book: ESCROW_ADDRESS is not set — no Escrow vault to pay into"
    );
  return getAddress(vault);
}

async function resolvePrice(context: HTTPRequestContext) {
  const input = await bookingInput(context);
  if (!input) throw new Error("book: missing slug or stay fields");
  const r = await quoteStay(input.slug, input.checkin, input.checkout, input.guests);
  if (!r.ok) throw new Error(`book: not quotable (${r.error.code})`);
  const token = tokenForCurrency(r.quote.currency);
  return {
    amount: toAtomic(r.quote.total_minor, token.decimals),
    asset: token.address,
    extra: {
      ...token.domain,
      ...(token.transferMethod === "permit2"
        ? { assetTransferMethod: "permit2" }
        : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// route config
// ---------------------------------------------------------------------------

export const bookingRouteConfig: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: CAIP2,
    payTo: resolvePayTo,
    price: resolvePrice,
  },
  description:
    "Booking payment — funds settle into the shared Escrow vault (ADR-0006); the Owner is paid by releases, in the Lodging's own wFIAT.",
  extensions: {
    // Advertised so a paying Agent can tag the payment; we record booking_id
    // as facilitator_ref on the payments row — the same correlation.
    "payment-identifier": { info: { required: false } },
    ...(NEEDS_PERMIT2_SPONSORING
      ? {
          eip2612GasSponsoring: {
            info: {
              description:
                "The facilitator sponsors the EIP-2612 permit to Permit2.",
              version: "1",
            },
          },
        }
      : {}),
  },
};

// ---------------------------------------------------------------------------
// precheck — runs BEFORE the payment middleware so unpaid requests still get
// the domain errors (400/404/409) instead of a 402 they could never pay.
// ---------------------------------------------------------------------------

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

export const bookingPrecheck: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== "POST") return next();
  const body = parseBookingBody(await c.req.json().catch(() => null));
  if (!body)
    return c.json(
      { error: "body must include checkin, checkout and guests" },
      400
    );
  if (!Number.isInteger(body.guests) || body.guests < 1)
    return c.json({ error: "guests must be a positive integer" }, 400);

  // No Escrow vault configured → explicit failure, never a 402 that would
  // pay someone else. resolvePayTo throws the same way; this gate turns it
  // into a clean 503 before the payment middleware runs.
  if (!process.env.ESCROW_ADDRESS)
    return c.json(
      {
        error: "escrow_unconfigured",
        message:
          "ESCROW_ADDRESS is not set — the Booking cannot be charged without an Escrow vault",
      },
      503
    );

  // A Traveler token that doesn't verify fails here — before any 402 — so the
  // Booking can't silently miss its p_traveler_id link (the handler re-verifies
  // the same header post-payment).
  const who = await optionalTravelerId(c);
  if (who !== null && typeof who !== "string") return who;

  const slug = BOOK_PATH_RE.exec(new URL(c.req.url).pathname)?.[1] ?? "";
  const r = await quoteStay(slug, body.checkin, body.checkout, body.guests);
  if (!r.ok)
    return c.json(
      { error: r.error.message, code: r.error.code },
      errorStatus(r.error.code)
    );

  // The Lodging's currency must resolve to a configured settlement asset —
  // a fiat with no wFIAT (UYU) or a token missing from X402_ASSETS can't be
  // charged. Catch it here so the failure is a clean 503, not the bare 500
  // the middleware turns a resolvePrice throw into.
  try {
    tokenForCurrency(r.quote.currency);
  } catch (err) {
    return c.json(
      {
        error: err instanceof Error ? err.message : "unsupported_currency",
        currency: r.quote.currency,
      },
      503
    );
  }
  return next();
};

// ---------------------------------------------------------------------------
// settle hooks — pending_payment → confirmed + payments row, or release.
// The supabase leg goes through the RPCs; the mock leg flips its in-memory
// row the same way (no payments table — state only, see repo.ts).
// ---------------------------------------------------------------------------

function isBookingSettle(context: SettleContext): boolean {
  const request = (context.transportContext as HTTPTransportContext | undefined)
    ?.request;
  return (
    request?.method === "POST" && BOOK_PATH_RE.test(request.path ?? "")
  );
}

function bookingIdFromResponse(context: SettleContext): string | null {
  const body = (context.transportContext as HTTPTransportContext | undefined)
    ?.responseBody;
  if (!body) return null;
  try {
    const parsed = JSON.parse(body.toString("utf8")) as { booking_id?: string };
    return typeof parsed.booking_id === "string" ? parsed.booking_id : null;
  } catch {
    return null;
  }
}

async function onAfterSettle(context: SettleResultContext): Promise<void> {
  if (!isBookingSettle(context)) return;
  const bookingId = bookingIdFromResponse(context);
  if (!bookingId) {
    console.error("book settle: no booking_id in handler response — cannot confirm");
    return;
  }
  if (LISTINGS_DATA_SOURCE !== "supabase") {
    settleMockBooking(bookingId);
    return;
  }
  try {
    const amountAtomic = context.result.amount ?? context.requirements.amount;
    const token = ACCEPTED_TOKENS.find(
      (t) => t.address.toLowerCase() === context.requirements.asset.toLowerCase()
    );
    const { error } = await createSupabaseAdmin().rpc("confirm_booking_payment", {
      p_booking_id: bookingId,
      p_payer: context.result.payer ?? undefined,
      p_pay_to: context.requirements.payTo,
      p_amount_minor: Number(
        toMinor(amountAtomic, token?.decimals ?? 6)
      ),
      p_asset: context.requirements.asset,
      p_network: context.requirements.network,
      p_tx_hash: context.result.transaction,
    });
    if (error) throw error;
  } catch (error) {
    // Payment settled but the confirm failed — the booking stays
    // pending_payment with held nights. Reconcile by replaying
    // confirm_booking_payment with this booking_id.
    console.error(`book settle: confirm_booking_payment(${bookingId}) failed`, error);
  }
}

async function releasePending(context: SettleContext): Promise<void> {
  if (!isBookingSettle(context)) return;
  const bookingId = bookingIdFromResponse(context);
  if (!bookingId) return; // book_stay failed atomically — nothing was held
  if (LISTINGS_DATA_SOURCE !== "supabase") {
    releaseMockBooking(bookingId);
    return;
  }
  try {
    const { error } = await createSupabaseAdmin().rpc("release_booking", {
      p_booking_id: bookingId,
    });
    if (error) throw error;
  } catch (error) {
    console.error(`book settle: release_booking(${bookingId}) failed`, error);
  }
}

/** Wire the booking settle lifecycle onto the shared resource server. */
export function registerBookingHooks(server: x402ResourceServer): void {
  server.onAfterSettle(onAfterSettle);
  server.onSettleFailure(async (c) => {
    await releasePending(c);
    return undefined;
  });
  server.onVerifiedPaymentCanceled(releasePending);
}
