import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet } from "../lib/nomai-api";

// The Traveler's Bookings — "mis reservas". Until real Traveler auth lands,
// guest_ref (the reference set at book_listing time) is the lookup key.

interface BookingSummary {
  booking_id: string;
  listing_slug: string;
  status: string;
  escrow_status: string;
  checkin: string;
  checkout: string;
  guests: number;
  nights_count: number;
  total_minor: number;
  total_display: string;
  currency: string;
  created_at: string;
}

export default defineTool({
  description:
    "List the Traveler's Bookings ('mis reservas') by the guest_ref used when booking. Returns {bookings: [{booking_id, listing_slug, status, escrow_status, checkin, checkout, guests, nights_count, total_display, currency, created_at}]} — an empty list means no Bookings under that reference. Use get_booking for one Booking's full Escrow/Claim timeline.",
  inputSchema: z.object({
    guest_ref: z
      .string()
      .describe("The Traveler reference used when the Bookings were created"),
  }),
  execute: async ({ guest_ref }) => {
    const r = await apiGet<{ bookings: BookingSummary[] }>("/bookings", { guest_ref });
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
