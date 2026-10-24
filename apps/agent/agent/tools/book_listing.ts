import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiPaidPost } from "../lib/nomai-api";

// Creates the Booking through the x402-gated book endpoint: the API answers
// 402 with the payment requirement (rental + Service fee), the Agent pays it
// from its wallet, and the paid retry returns 201 with the booking plus a
// PAYMENT-RESPONSE settlement receipt (tx hash, payer, network). The Booking
// is only real once that receipt is there. The API re-validates
// availability, so a 409 means the stay just got taken — quote again or
// offer alternatives.

export default defineTool({
  description:
    "Book AND PAY a listing for the Traveler: this is a real x402 payment charged to the agent wallet. ONLY call this after (1) a fresh quote_booking for these exact dates/guests and (2) the Traveler's explicit confirmation of the total_display price (Service fee included). On success returns the booking (booking_id, status, totals) plus `payment` — the settlement receipt {transaction, payer, network}; the Booking is confirmed only when payment.transaction is present. Fails with code 'payment_failed' when the wallet cannot pay (unfunded, no key, settlement rejected) — tell the Traveler honestly, never claim a confirmation — and 409 'unavailable' if the nights were taken since the quote.",
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
  execute: async ({ slug, checkin, checkout, guests, guest_ref }) => {
    const r = await apiPaidPost<Record<string, unknown>>(`/listings/${slug}/book`, {
      checkin,
      checkout,
      guests,
      guest_ref,
    });
    if (!r.ok) return { error: r.error, code: r.code, status: r.status, payment: r.payment };
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
