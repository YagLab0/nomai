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
    "Check the signed-in Traveler's own agent wallet: {address, network, balance} where balance is the native CELO balance as a decimal string. Use it when the Traveler asks about their wallet, its address or whether it has funds. Takes no input — the Traveler comes from the chat session. Without a signed-in Traveler it returns {error: 'unauthorized', status: 401, code: 'no_traveler_session'}; a 401 from the API means the session expired. Never guess a balance when this fails.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const traveler = travelerAuth(ctx.session.auth.current);
    if (!traveler) return NO_TRAVELER_SESSION;
    const r = await apiGet<WalletStatus>(
      `/wallet/${encodeURIComponent(traveler.travelerId)}`,
      undefined,
      travelerAuthHeaders(traveler),
    );
    if (!r.ok) return { error: r.error, code: r.code, status: r.status };
    return { address: r.data.address, network: r.data.network, balance_celo: r.data.balance };
  },
});
