import { defineTool } from "eve/tools";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { z } from "zod";

import { agentAccount, networkName, NETWORK_CAIP2, RPC_URL } from "../lib/celo";

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
    const network = networkName();
    const client = new x402Client();
    // The scheme needs chain READ access (permit nonce / allowance for permit2
    // assets), not just signing — pass an rpcUrl.
    client.register(
      "eip155:*",
      new ExactEvmScheme(agentAccount(), { rpcUrl: RPC_URL[network] }),
    );

    const payFetch = wrapFetchWithPayment(fetch, client);
    const res = await payFetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    // The settlement receipt rides back on this header — the tx hash is the
    // only proof that anything actually moved on chain.
    const receipt = res.headers.get("payment-response");
    const payment = receipt
      ? (JSON.parse(Buffer.from(receipt, "base64").toString("utf8")) as Record<string, unknown>)
      : null;

    const text = await res.text();
    return {
      status: res.status,
      network: NETWORK_CAIP2[network],
      payment,
      response: text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…` : text,
    };
  },
});
