import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiPost } from "../lib/nomai-api";

// Creates the Booking (stub — no payment yet; the x402 middleware plugs in
// over this same endpoint later). The API re-validates availability, so a
// 409 means the stay just got taken — quote again or offer alternatives.

export default defineTool({
  description:
    "Book a listing for the Traveler. ONLY call this after (1) a fresh quote_booking for these exact dates/guests and (2) the Traveler's explicit confirmation of the total_display price. Returns booking_id, status and totals on success; fails 409 'unavailable' if the nights were taken since the quote.",
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
    const r = await apiPost<Record<string, unknown>>(`/listings/${slug}/book`, {
      checkin,
      checkout,
      guests,
      guest_ref,
    });
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
