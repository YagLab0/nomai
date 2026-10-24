// nomai — an x402 seller.
//
// `GET /free` is open. `POST /paid` charges the caller USDC on Celo before it answers.
//
// The flow, once:
//   1. An agent calls POST /paid with no payment header.
//   2. This server answers 402 with what it will accept (asset, amount, payTo, network).
//   3. The agent signs an EIP-3009 authorization for exactly that and calls again.
//   4. The facilitator verifies the signature, submits the transfer, and pays the gas.
//   5. This handler runs and the response carries a settlement receipt.
//
// Step 5 is the part worth noticing: the BUYER needs no CELO. The authorization is
// signed off-chain and the facilitator sponsors the gas, so an agent holding nothing
// but a stablecoin can transact.

import { serve } from "@hono/node-server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono } from "hono";
import { getAddress, parseUnits } from "viem";
import {
  ACCEPTED_TOKENS,
  CAIP2,
  CONFIG,
  NEEDS_PERMIT2_SPONSORING,
  NETWORK,
  PAY_TO,
  PRICE,
  facilitator,
} from "./x402.js";
import listings from "./listings.js";

const app = new Hono();

/** Free route — no payment, useful for liveness checks. */
app.get("/free", (c) =>
  c.json({ ok: true, network: NETWORK, facilitator: CONFIG.facilitator })
);

// Listings API — the Agent's data surface. Mounted before the x402
// middleware so payment gating never touches these routes; the book
// endpoint is where the paid Booking middleware will plug in later.
app.route("/listings", listings);

if (PAY_TO) {
  const server = new x402ResourceServer(facilitator);
  server.register("eip155:*", new ExactEvmScheme());
  const payTo = getAddress(PAY_TO);

  app.use(
    "*",
    paymentMiddleware(
      {
        "POST /paid": {
          // One entry per accepted asset — the buyer pays in whichever it holds.
          // For permit2 assets (the Ripio wFIAT tokens) the EIP-712 domain rides
          // in `extra` and the route advertises eip2612GasSponsoring so the
          // client signs the sponsored permit instead of an EIP-3009 auth.
          accepts: ACCEPTED_TOKENS.map((token) => ({
            scheme: "exact",
            network: CAIP2,
            payTo,
            price: {
              amount: parseUnits(PRICE, token.decimals).toString(),
              asset: token.address,
              extra: {
                ...token.domain,
                ...(token.transferMethod === "permit2"
                  ? { assetTransferMethod: "permit2" }
                  : {}),
              },
            },
          })),
          // What the caller is buying. This is shown to the paying agent, so it
          // should describe the resource, not the project.
          description: `One call to the nomai paid API — ${PRICE} ${ACCEPTED_TOKENS.map((t) => t.symbol.toUpperCase()).join("/")} on ${NETWORK}`,
          ...(NEEDS_PERMIT2_SPONSORING
            ? {
                extensions: {
                  eip2612GasSponsoring: {
                    info: {
                      description:
                        "The facilitator sponsors the EIP-2612 permit to Permit2.",
                      version: "1",
                    },
                  },
                },
              }
            : {}),
        },
      },
      server
    )
  );
  // Fail loudly at boot rather than at settlement. Without a key the server still
  // starts and still returns a correct 402 — /supported and /verify do not need
  // one — and then /settle returns 401 after the buyer has signed.
  if (!process.env.X402_API_KEY) {
    console.warn(
      "⚠️  X402_API_KEY is not set. The 402 will look correct and settlement will fail with 401."
    );
  }
} else {
  console.warn(
    "⚠️  X402_PAY_TO is not set — /paid is running FREE. Set it in .env to charge."
  );
}

/** The paid route. Everything here runs only after a settled payment. */
app.post("/paid", (c) =>
  c.json({
    message: "You paid for this response.",
    network: NETWORK,
    servedAt: new Date().toISOString(),
  })
);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`nomai x402 seller listening on http://localhost:${port}`);
console.log(`  network:     ${NETWORK} (${CAIP2})`);
console.log(`  facilitator: ${CONFIG.facilitator}`);
console.log(
  `  price:       ${PRICE} in ${ACCEPTED_TOKENS.map((t) => t.symbol.toUpperCase()).join(", ")}`
);
