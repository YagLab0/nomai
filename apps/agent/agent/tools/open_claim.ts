import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiPost, travelerAuthHeaders } from "../lib/nomai-api";
import { NO_TRAVELER_SESSION, travelerAuth } from "../lib/traveler-auth";

// Opens a Claim on a Booking (ADR-0006): the Traveler has 24 h after
// check-in to report a problem with the stay. An open Claim freezes the
// second Escrow release (the remaining 50%) until nomai resolves it — and
// nomai can only route those funds to this Booking's Traveler or Owner.
// Ownership proof, same as cancel_booking: guest_ref when the Traveler gives
// one, otherwise the signed-in Traveler from the forwarded session token.

const CLAIM_REASONS = ["no_access", "not_as_described", "owner_no_show"] as const;

interface OpenClaimResult {
  ok: boolean;
  booking_id: string;
  status: "claim_open";
}

export default defineTool({
  description:
    "Open a Claim on the Traveler's Booking when the stay has a problem. Per policy a Claim can only be opened within 24 h after check-in; it freezes the final Escrow release (the remaining 50%) until nomai resolves it, and funds can only go back to this Booking's Traveler or its Owner. ONLY call after the Traveler described the problem and confirmed they want to open the Claim. reason: no_access (could not get in), not_as_described (the place differs from the listing), owner_no_show (the Owner never showed up). Returns {ok, booking_id, status: 'claim_open'}. Ownership: omit guest_ref for a signed-in Traveler — the chat session proves it is theirs; pass guest_ref only if the Traveler gives you that reference. Fails 401 'no_traveler_session' without guest_ref and without a signed-in Traveler, 403 'forbidden' when the Booking is not theirs, 404 for an unknown booking, 409 when the Claim window is closed or the Booking is not claimable — explain it, do not retry.",
  inputSchema: z.object({
    booking_id: z.string().describe("The booking id, e.g. 'bkg_1'"),
    guest_ref: z
      .string()
      .optional()
      .describe(
        "Only if the Traveler gives it: the reference used when the Booking was created. Omit for a signed-in Traveler"
      ),
    reason: z.enum(CLAIM_REASONS).describe("What went wrong with the stay"),
    evidence: z
      .string()
      .optional()
      .describe("The Traveler's own description of the problem (and any evidence they cite)"),
  }),
  execute: async ({ booking_id, guest_ref, reason, evidence }, ctx) => {
    const ref = guest_ref?.trim();
    const traveler = ref ? null : travelerAuth(ctx.session.auth.current);
    if (!ref && !traveler) return NO_TRAVELER_SESSION;
    const r = await apiPost<OpenClaimResult>(
      `/bookings/${encodeURIComponent(booking_id)}/claim`,
      ref
        ? { guest_ref: ref, reason, evidence }
        : { traveler_id: traveler!.travelerId, reason, evidence },
      traveler ? travelerAuthHeaders(traveler) : undefined
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
