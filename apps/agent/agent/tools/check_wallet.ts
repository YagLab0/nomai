import { defineTool } from "eve/tools";
import { z } from "zod";

import { apiGet, travelerAuthHeaders } from "../lib/nomai-api";
import { NO_TRAVELER_SESSION, travelerAuth } from "../lib/traveler-auth";

// The signed-in Traveler's own agent wallet (ADR-0003): GET /wallet/:traveler_id.
// traveler_id comes from the forwarded session token, never from the model, so
// the Agent can only ever ask for the Traveler it is talking to.

interface WalletStatus {
  ok: true;
  address: string;
  network: string;
  /** Native CELO balance, decimal string. */
  balance: string;
}

export default defineTool({
  description:
    "Check the signed-in Traveler's own agent wallet: {address, network, balance_celo} where balance_celo is the native CELO balance as a decimal string. Use it when the Traveler asks about their wallet, its address or whether it has funds. Takes no input — the Traveler comes from the chat session. Outcomes: no signed-in Traveler → {error: 'unauthorized', status: 401, code: 'no_traveler_session'}; another 401 from the API means the session expired; {error: 'wallet_unavailable', status: 503, code: 'wallet_unavailable'} means the Traveler's account could not be prepared — explain it in plain words (no crypto vocabulary) and offer to retry; {error: 'rpc_unreachable', status: 502} means the network could not be read — suggest trying later. Never guess a balance when this fails.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const traveler = travelerAuth(ctx.session.auth.current);
    if (!traveler) return NO_TRAVELER_SESSION;
    const r = await apiGet<WalletStatus>(
      `/wallet/${encodeURIComponent(traveler.travelerId)}`,
      undefined,
      travelerAuthHeaders(traveler),
    );
    if (!r.ok) {
      // The API signals wallet failures as {error: "<code>"} (#33): re-emit
      // wallet_unavailable with `code` + hint so it reads as clearly as
      // no_traveler_session (401) and rpc_unreachable (502).
      if (r.error === "wallet_unavailable" || r.code === "wallet_unavailable") {
        return {
          error: "wallet_unavailable",
          status: r.status,
          code: "wallet_unavailable",
          hint: "The Traveler's account could not be prepared — offer to retry the check, never guess a balance.",
        };
      }
      return { error: r.error, code: r.code, status: r.status };
    }
    return { address: r.data.address, network: r.data.network, balance_celo: r.data.balance };
  },
});
