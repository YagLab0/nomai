import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiPost, travelerAuthHeaders } from "../lib/nomai-api";
import { NO_TRAVELER_SESSION, travelerAuth } from "../lib/traveler-auth";

// POST /bookings/:id/review — the Traveler's Review of a completed stay
// (ADR-0008). Bearer-required: the API re-checks inside one transaction that
// the Booking completed, the 14-day window is open and the caller IS that
// Booking's Traveler — the tool never trusts a model-supplied Traveler id.

export default defineTool({
  description:
    "Submit the signed-in Traveler's Review of a completed Booking: rating 1-5, optional written `body`, optional per-`categories` scores (cleanliness, accuracy, checkin, communication, location, value — 1-5 each). ONLY call it after the Traveler submitted the ReviewForm (or explicitly confirmed rating+text): it is a real, public write. The API enforces the rules — fails 'not_reviewable' (Booking not completed / outside the 14-day window), 'already_reviewed' (one per Booking), 'not_found'. Success returns { ok, review_id, score } — `score` is the Lodging's updated weighted rating.",
  inputSchema: z.object({
    booking_id: z.string().describe("The booking id, e.g. 'bkg_12'"),
    rating: z.number().int().min(1).max(5).describe("Overall rating 1-5"),
    body: z
      .string()
      .optional()
      .describe("Written review text — verbatim what the Traveler wrote"),
    categories: z
      .object({
        cleanliness: z.number().int().min(1).max(5).optional(),
        accuracy: z.number().int().min(1).max(5).optional(),
        checkin: z.number().int().min(1).max(5).optional(),
        communication: z.number().int().min(1).max(5).optional(),
        location: z.number().int().min(1).max(5).optional(),
        value: z.number().int().min(1).max(5).optional(),
      })
      .optional()
      .describe("Per-category 1-5 scores — only ones the Traveler actually gave"),
  }),
  execute: async ({ booking_id, rating, body, categories }, ctx) => {
    const traveler = travelerAuth(ctx.session.auth.current);
    if (!traveler) return NO_TRAVELER_SESSION;
    const r = await apiPost<{ ok: boolean; review_id: string; score: number }>(
      `/bookings/${encodeURIComponent(booking_id)}/review`,
      { rating, body, categories },
      travelerAuthHeaders(traveler)
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
