import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet } from "../lib/nomai-api";

// Night-by-night price for a concrete stay. Quotes are what the Traveler
// confirms before a Booking — call this right before showing the final price
// and again right before book_listing, since availability moves.

export default defineTool({
  description:
    "Quote a stay at a listing: night-by-night price (base / rate_rule / availability override), cleaning fee, and total. Returns total_minor (canonical, for payment) and total_display (human-readable). Fails with a code (unavailable|min_nights|max_guests|…) when the stay cannot be booked — explain the reason to the Traveler instead of retrying blindly.",
  inputSchema: z.object({
    slug: z.string().describe("The listing slug"),
    checkin: z.string().describe("Check-in date YYYY-MM-DD"),
    checkout: z.string().describe("Check-out date YYYY-MM-DD"),
    guests: z.number().int().min(1).describe("Number of guests"),
  }),
  execute: async ({ slug, checkin, checkout, guests }) => {
    const r = await apiGet<Record<string, unknown>>(`/listings/${slug}/quote`, {
      checkin,
      checkout,
      guests,
    });
    if (!r.ok) return { error: r.error, code: r.code };
    return r.data;
  },
});
