import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet, travelerAuthHeaders } from "../lib/nomai-api";
import { NO_TRAVELER_SESSION, travelerAuth } from "../lib/traveler-auth";

// The Traveler's Booking requests (ADR-0010) — drafts born in the app, over
// MCP, or here in the chat ("agendame este lugar"). An IDEA carries only the
// place; a PENDING request carries dates + frozen totals and is ready to pay
// in the app. Nomito lists them so it can say "tenés 2 listos para pagar".

export interface AgentBookingRequest {
  request_id: string;
  listing_slug?: string;
  origin: string;
  checkin: string | null;
  checkout: string | null;
  guests: number | null;
  total_minor: number | null;
  total_display?: string;
  currency: string | null;
  status: string;
  booking_id: string | null;
  expires_at: string;
  created_at: string;
}

export default defineTool({
  description:
    "List the signed-in Traveler's Booking requests ('mis pedidos'): drafts saved from the app, external assistants (MCP) or this chat. Each carries status ('idea' = only the place, needs dates; 'pending' = ready to pay in the app with frozen totals; 'confirmed' = paid, with booking_id; 'cancelled'/'expired'/'stale' = archived) and origin ('app'/'mcp'/'agent'). Takes no input — the Traveler comes from the chat session. Use it when the Traveler asks what is pending, ready to pay, or what an external assistant saved for them.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const traveler = travelerAuth(ctx.session.auth.current);
    if (!traveler) return NO_TRAVELER_SESSION;
    const r = await apiGet<{ requests: AgentBookingRequest[] }>(
      "/bookings/requests",
      undefined,
      travelerAuthHeaders(traveler)
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return r.data;
  },
});
