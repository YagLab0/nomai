import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiPost, travelerAuthHeaders } from "../lib/nomai-api";
import { NO_TRAVELER_SESSION, travelerAuth } from "../lib/traveler-auth";

// Traveler-initiated Booking cancellation (ADR-0004): only the Traveler can
// cancel — the Owner never does. Ownership proof, same as list_bookings: the
// guest_ref set at book_listing time when the Traveler gives one, otherwise
// the signed-in Traveler from the forwarded session token (traveler_id = its
// sub, verified by the API against the Bearer). The model never supplies
// traveler_id. A mismatch comes back as 403 forbidden. Refund math is the global nomai-global-5d
// rule (ADR-0006), not a per-listing policy: 100% of the rental refunded
// before the Cancellation deadline (check-in − 5 days), 50% after. The
// Service fee is never refunded.

export default defineTool({
  description:
    "Cancel a confirmed Booking on the Traveler's request (ADR-0004 — Traveler-initiated only). ONLY call after (1) showing the Traveler the cancellation policy — the global nomai-global-5d rule: 100% of the rental refunded before the Cancellation deadline (check-in − 5 days), 50% after; the Service fee is never refunded — and (2) their explicit confirmation. Ownership: omit guest_ref for a signed-in Traveler — the chat session proves it is theirs; pass guest_ref only if the Traveler gives you that reference. Never ask the Traveler for a guest_ref, name or email when they are signed in. Returns the cancellation outcome: status, policy_name, days_until_checkin, refund_pct and refund_display — show refund_display to the Traveler. Fails 401 'no_traveler_session' without guest_ref and without a signed-in Traveler, 403 'forbidden' when the Booking is not theirs, and 409 'not_cancellable' when the booking is no longer confirmed — explain the reason instead of retrying.",
  inputSchema: z.object({
    booking_id: z.string().describe("The booking id, e.g. 'bkg_1'"),
    guest_ref: z
      .string()
      .optional()
      .describe(
        "Only if the Traveler gives it: the reference used when the Booking was created. Omit for a signed-in Traveler"
      ),
  }),
  execute: async ({ booking_id, guest_ref }, ctx) => {
    const ref = guest_ref?.trim();
    const traveler = ref ? null : travelerAuth(ctx.session.auth.current);
    if (!ref && !traveler) return NO_TRAVELER_SESSION;
    const r = await apiPost<Record<string, unknown>>(
      `/bookings/${encodeURIComponent(booking_id)}/cancel`,
      ref ? { guest_ref: ref } : { traveler_id: traveler!.travelerId },
      traveler ? travelerAuthHeaders(traveler) : undefined
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
