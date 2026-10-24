import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet, travelerAuthHeaders } from "../lib/nomai-api";

// The Traveler's Credit balance (monedas Nomai) — GET /credits/balance, the
// read side of the ledger that is the only source of truth (ADR-0001). The
// Agent checks this before stages that spend Credits (a live_query burns the
// Traveler's balance against the ADR-0002 daily ceilings); check_balance is
// the other hard cap, on the wallet side.
//
// Auth limitation: the endpoint is user-scoped — it verifies the Bearer token
// with the Auth server and the verified user id IS the traveler id. Nothing
// forwards the Traveler's Supabase access token to the Agent yet (the eve
// channel authenticates the Agent's own caller, and the web adapter never
// passes a session token), so until the real-auth ticket lands the tool only
// works with NOMAI_TRAVELER_TOKEN set — a dev escape hatch. With no token the
// API answers 401 'unauthorized': surface that to the Traveler instead of
// retrying.

export default defineTool({
  description:
    "Check the Traveler's Credit balance (monedas Nomai) on the nomai API. Use before stages that spend Credits (live_query) — alongside check_balance, the wallet's hard spend cap, it is the second limit. Scoped to the Traveler's Bearer token; returns 401 'unauthorized' until Traveler auth reaches the Agent (NOMAI_TRAVELER_TOKEN is the dev stand-in).",
  inputSchema: z.object({}),
  execute: async () => {
    const headers = travelerAuthHeaders();
    const r = await apiGet<{ traveler_id: string; balance: number }>(
      "/credits/balance",
      undefined,
      headers ?? undefined
    );
    if (!r.ok) {
      return {
        error: r.error,
        code: r.code,
        status: r.status,
        ...(r.status === 401 && !headers
          ? {
              note: "no NOMAI_TRAVELER_TOKEN configured — Traveler auth is not forwarded to the Agent yet",
            }
          : {}),
      };
    }
    return r.data;
  },
});
