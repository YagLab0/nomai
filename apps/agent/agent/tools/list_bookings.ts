import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet, travelerAuthHeaders } from "../lib/nomai-api";
import { NO_TRAVELER_SESSION, travelerAuth } from "../lib/traveler-auth";

// The Traveler's Bookings — "mis reservas". Two lookup keys: the guest_ref set
// at book_listing time, or — when guest_ref is omitted — the signed-in
// Traveler from the forwarded session token (traveler_id = its sub). The model
// never supplies traveler_id, so it cannot list another Traveler's Bookings.

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
    "List the Traveler's Bookings ('mis reservas'). Pass guest_ref (the reference used when booking) to look up by it; omit it to list the signed-in Traveler's own Bookings from the chat session. Returns {bookings: [{booking_id, listing_slug, status, escrow_status, checkin, checkout, guests, nights_count, total_display, currency, created_at}]} — an empty list means no Bookings under that key. Without guest_ref and without a signed-in Traveler it returns {error: 'unauthorized', status: 401, code: 'no_traveler_session'}. Use get_booking for one Booking's full Escrow/Claim timeline.",
  inputSchema: z.object({
    guest_ref: z
      .string()
      .optional()
      .describe(
        "The Traveler reference used when the Bookings were created; omit to use the signed-in Traveler"
      ),
  }),
  execute: async ({ guest_ref }, ctx) => {
    const ref = guest_ref?.trim();
    const traveler = ref ? null : travelerAuth(ctx.session.auth.current);
    if (!ref && !traveler) return NO_TRAVELER_SESSION;
    const r = await apiGet<{ bookings: BookingSummary[] }>(
      "/bookings",
      ref ? { guest_ref: ref } : { traveler_id: traveler!.travelerId },
      traveler ? travelerAuthHeaders(traveler) : undefined
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
