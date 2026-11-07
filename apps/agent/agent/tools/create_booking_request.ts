import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiPost, travelerAuthHeaders } from "../lib/nomai-api";
import { NO_TRAVELER_SESSION, travelerAuth } from "../lib/traveler-auth";
import type { AgentBookingRequest } from "./list_booking_requests";

// Save a Booking request draft for the signed-in Traveler ("agendame este
// lugar"). Only the listing slug is required: without dates it saves an IDEA
// the Traveler completes later in the app; with checkin/checkout/guests it
// quotes fresh server-side and saves it PENDING (ready to pay). Creates NO
// Booking, holds NO nights, moves NO money — the Traveler confirms and pays
// in the app. Returns {request_id, status, totals when priced, expires_at}.

export default defineTool({
  description:
    "Save a Booking request draft for the signed-in Traveler ('agendame este lugar'). Only the listing slug is required: without dates it saves an IDEA the Traveler completes later in the app; with checkin/checkout/guests it quotes fresh server-side and saves it PENDING (ready to pay). Creates NO Booking, holds NO nights, moves NO money — the Traveler confirms and pays in the app. Returns {request_id, status, totals when priced, expires_at}.",
  inputSchema: z.object({
    slug: z.string().describe("The listing slug, e.g. 'palermo-loft'"),
    checkin: z
      .string()
      .optional()
      .describe("Check-in date YYYY-MM-DD (optional — without it the draft is an idea)"),
    checkout: z
      .string()
      .optional()
      .describe("Check-out date YYYY-MM-DD (optional — without it the draft is an idea)"),
    guests: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Number of guests (optional — without it the draft is an idea)"),
  }),
  execute: async ({ slug, checkin, checkout, guests }, ctx) => {
    const traveler = travelerAuth(ctx.session.auth.current);
    if (!traveler) return NO_TRAVELER_SESSION;
    const r = await apiPost<AgentBookingRequest>(
      "/bookings/requests",
      { slug, checkin, checkout, guests, origin: "agent" },
      travelerAuthHeaders(traveler)
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
