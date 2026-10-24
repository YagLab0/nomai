import { defineTool } from "eve/tools";
import { z } from "zod";

import { networkName, NETWORK_CAIP2 } from "../lib/celo";
import { paymentFetch, readSettlementReceipt } from "../lib/x402";

// Pays an x402-gated HTTP endpoint from the agent wallet. This is the Booking
// primitive: the Owner's endpoint quotes a price, the Agent signs it, and the
// facilitator settles — funds land directly in the Owner's wallet (payTo), so
// the platform never holds booking money. The wallet needs only the quoted
// asset (USDC/USDT/USAT/wARS/wBRL/wCOP): the facilitator sponsors gas, and for
// permit2 assets it also sponsors the EIP-2612 permit.
//
// The wallet balance is the hard spend cap — the tool can only pay what the
// agent actually holds.

const MAX_BODY_CHARS = 4000;

export default defineTool({
  description:
    "Pay an x402-gated endpoint from the agent wallet and return the response. Use it to execute a Booking against an Owner's payment endpoint after the Traveler has confirmed — never for unrelated purchases.",
  inputSchema: z.object({
    url: z.string().url().describe("The x402-protected URL to call"),
    method: z.enum(["GET", "POST"]).default("POST"),
    body: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("JSON request body (e.g. the booking details the Owner expects)"),
  }),
  execute: async ({ url, method, body }) => {
    const res = await paymentFetch()(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    // The settlement receipt rides back on this header — the tx hash is the
    // only proof that anything actually moved on chain.
    const payment = readSettlementReceipt(res);

    const text = await res.text();
    return {
      status: res.status,
      network: NETWORK_CAIP2[networkName()],
      payment,
      response: text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…` : text,
    };
  },
});
