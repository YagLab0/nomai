import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiPaidPost } from "../lib/nomai-api";
import { NO_TRAVELER_SESSION, travelerAuth } from "../lib/traveler-auth";

// Creates the Booking through the x402-gated book endpoint, paid from the
// TRAVELER'S Agent wallet (Traveler-pays Bookings, #56): the API answers 402
// with the payment requirement (rental + Service fee, in the Lodging's
// wFIAT), the Agent asks the API to sign it with the Traveler's custodial
// key (payment-auth), and the paid retry settles on-chain with payer = the
// Traveler — into the shared Escrow vault, never straight to the Owner. The
// Booking is only real once the PAYMENT-RESPONSE receipt is there (tx hash,
// payer, network). The API re-validates availability, so a 409 'unavailable'
// means the stay just got taken — quote again or offer alternatives.
//
// A signed-in Traveler is REQUIRED — they are the payer. Without a session
// there is no one to charge: the tool answers no_traveler_session rather
// than ever falling back to the project wallet.

export default defineTool({
  description:
    "Book AND PAY a listing for the Traveler: a real x402 payment charged to THE TRAVELER'S Agent wallet (the wFIAT they funded), settling into the Escrow vault — not the project wallet and not straight to the Owner. Requires the Traveler to be signed in: without a session it fails with code 'no_traveler_session' (tell them 'iniciá sesión' — never pay for them). ONLY call this after (1) a fresh quote_booking for these exact dates/guests and (2) the Traveler's explicit confirmation of the total_display price (Service fee included). On success returns the booking (booking_id, status, totals) plus `payment` — the settlement receipt {transaction, payer, network}; the Booking is confirmed only when payment.transaction is present, and payer is the Traveler's Agent wallet. Errors are honest, never a confirmation: 'insufficient_balance' (409 — `details` names token/currency/required/available/missing; tell the Traveler 'te faltan X wARS' and to cargar from Tu saldo), 'funding_required' (403 — they must cargar their saldo first), 'payment_failed' (the payment could not be authorized or settlement was rejected — say so plainly, no retry), and 409 'unavailable' if the nights were taken since the quote.",
  inputSchema: z.object({
    slug: z.string().describe("The listing slug"),
    checkin: z.string().describe("Check-in date YYYY-MM-DD"),
    checkout: z.string().describe("Check-out date YYYY-MM-DD"),
    guests: z.number().int().min(1).describe("Number of guests"),
    guest_ref: z
      .string()
      .optional()
      .describe("Traveler reference for the booking (name or internal ref)"),
  }),
  execute: async ({ slug, checkin, checkout, guests, guest_ref }, ctx) => {
    // The session's Traveler is the payer: their Bearer verifies on the book
    // route (p_traveler_id links the Booking to their account, so "mis
    // reservas" finds it later) and authorizes payment-auth to sign from
    // their Agent wallet. No session → no one to charge.
    const traveler = travelerAuth(ctx.session.auth.current);
    if (!traveler) return NO_TRAVELER_SESSION;
    const r = await apiPaidPost<Record<string, unknown>>(
      `/listings/${slug}/book`,
      {
        checkin,
        checkout,
        guests,
        guest_ref,
      },
      traveler
    );
    if (!r.ok) {
      return {
        error: r.error,
        code: r.code,
        status: r.status,
        payment: r.payment,
        ...(r.details ? { details: r.details } : {}),
      };
    }
    if (!r.payment?.transaction) {
      return {
        ...r.data,
        payment: r.payment,
        warning:
          "The API answered 201 but returned no settlement receipt (no tx hash in PAYMENT-RESPONSE) — do not present this Booking as paid/confirmed; tell the Traveler the payment could not be verified.",
      };
    }
    return { ...r.data, payment: r.payment };
  },
});
