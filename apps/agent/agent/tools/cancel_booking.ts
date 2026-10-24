import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiPost } from "../lib/nomai-api";

// Traveler-initiated Booking cancellation (ADR-0004): only the Traveler can
// cancel — the Owner never does, because the money sits in THEIR wallet and
// the refund flows back from them. Until real Traveler auth lands, the
// ownership proof is the guest_ref set at book_listing time — a mismatch
// comes back as 403 forbidden. Refund math is the listing's policy: full
// inside full_refund_days, partial_refund_pct inside partial_refund_days, 0
// after that.

export default defineTool({
  description:
    "Cancel a confirmed Booking on the Traveler's request (ADR-0004 — Traveler-initiated only). ONLY call after (1) showing the Traveler the listing's cancellation policy — full vs partial refund, from get_listing's cancellation_policy — and (2) their explicit confirmation. Pass the same guest_ref used at book_listing time; it is the ownership proof until real auth lands. Returns the cancellation outcome: status, policy_name, days_until_checkin, refund_pct and refund_display — show refund_display to the Traveler. Fails 403 'forbidden' on a guest_ref mismatch and 409 'not_cancellable' when the booking is no longer confirmed — explain the reason instead of retrying.",
  inputSchema: z.object({
    booking_id: z.string().describe("The booking id, e.g. 'bkg_1'"),
    guest_ref: z
      .string()
      .describe(
        "The Traveler reference used when the Booking was created — the ownership proof"
      ),
    traveler_id: z
      .string()
      .optional()
      .describe(
        "Supabase Traveler id — supabase backend only; the mock matches on guest_ref"
      ),
  }),
  execute: async ({ booking_id, guest_ref, traveler_id }) => {
    const r = await apiPost<Record<string, unknown>>(
      `/bookings/${booking_id}/cancel`,
      { guest_ref, traveler_id }
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
