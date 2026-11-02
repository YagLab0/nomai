import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiPost, travelerAuthHeaders } from "../lib/nomai-api";
import { NO_TRAVELER_SESSION, travelerAuth } from "../lib/traveler-auth";

// POST /wallet/:traveler_id/funding-link — the Ripio ramp deep link that
// loads the Traveler's Agent wallet with a wFIAT of their choice. The
// Traveler is always the session's, never a model-supplied id: the API's
// authorize() rejects any path id that isn't the Bearer's.

export default defineTool({
  description:
    "Build a funding link for the signed-in Traveler: a Ripio ramp URL that loads their Agent wallet with the chosen wFIAT. Use it right after 'insufficient_balance'/'funding_required' from book_listing or whenever the Traveler asks to cargar saldo. amount+currency is the fiat they want to spend (ARS, BRL, MXN, COP, CLP, USD); `country` ONLY when the API answered 'country_required' — the stored country always wins once set. Returns { url } — hand it verbatim to the FundingCard's open_url action, never invent or shorten it. Errors are honest: 'invalid_amount', 'unsupported_currency', 'currency_unavailable' (no wFIAT on this network), 'country_required' (ask their country, then retry), 'wallet_unavailable'. Requires sign-in: fails 'no_traveler_session' otherwise.",
  inputSchema: z.object({
    amount: z.number().positive().describe("Fiat amount to load, e.g. 50000"),
    currency: z
      .string()
      .describe("Fiat ISO the Traveler spends — ARS, BRL, MXN, COP, CLP or USD"),
    country: z
      .string()
      .optional()
      .describe("Payer country — pass ONLY after a 'country_required' error"),
  }),
  execute: async ({ amount, currency, country }, ctx) => {
    const traveler = travelerAuth(ctx.session.auth.current);
    if (!traveler) return NO_TRAVELER_SESSION;
    const r = await apiPost<{ ok: boolean; url: string }>(
      `/wallet/${encodeURIComponent(traveler.travelerId)}/funding-link`,
      { amount, currency, country },
      travelerAuthHeaders(traveler)
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return { url: r.data.url };
  },
});
