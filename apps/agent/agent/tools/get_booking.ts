import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet } from "../lib/nomai-api";

// One Booking's current state — "¿cómo va mi reserva?". Besides the stay
// fields it carries the Escrow timeline (cancel_deadline, first_release_at,
// final_release_at) and the Claim fields, which is what the Agent maps onto
// the status Stepper.

interface BookingDetail {
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
  cancel_deadline?: string | null;
  first_release_at?: string | null;
  final_release_at?: string | null;
  [claimField: string]: unknown;
}

export default defineTool({
  description:
    "Get one Booking by id — use it for status questions ('¿cómo va mi reserva?'). Returns status (pending_payment|confirmed|in_progress|completed|claim_open|cancelled), escrow_status, stay dates, guests, nights_count, total_display, the Escrow timeline (cancel_deadline, first_release_at, final_release_at) and Claim fields. Fails 404 'not_found' for an unknown id.",
  inputSchema: z.object({
    booking_id: z.string().describe("The booking id, e.g. 'bkg_1'"),
  }),
  execute: async ({ booking_id }) => {
    const r = await apiGet<{ booking: BookingDetail }>(
      `/bookings/${encodeURIComponent(booking_id)}`
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data.booking;
  },
});
