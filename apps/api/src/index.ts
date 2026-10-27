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
import bookings from "./cancellations.js";
import credits from "./credits.js";
import wallet from "./wallet.js";
import keeper from "./keeper.js";
import {
  BOOKING_ROUTE_PATTERN,
  bookingPrecheck,
  bookingRouteConfig,
  registerBookingHooks,
} from "./book-payment.js";
import type { RoutesConfig } from "@x402/core/server";

const app = new Hono();

/** Free route — no payment, useful for liveness checks. */
app.get("/free", (c) =>
  c.json({ ok: true, network: NETWORK, facilitator: CONFIG.facilitator })
);

// One resource server settles both paid routes: the flat-fee /paid probe and
// the Owner-priced Booking endpoint. The booking hooks (issue #14) live on
// this server — pending_payment → confirmed + the payments row post-settle,
// release on settle failure.
const server = new x402ResourceServer(facilitator);
server.register("eip155:*", new ExactEvmScheme());
registerBookingHooks(server);

const paidRoutes: RoutesConfig = {
  // price/payTo resolve per request — a fresh server-side quote and the
  // listing's own business.payout_address, never a stale quote.
  [BOOKING_ROUTE_PATTERN]: bookingRouteConfig,
};

if (PAY_TO) {
  const payTo = getAddress(PAY_TO);
  paidRoutes["POST /paid"] = {
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
  };
} else {
  console.warn(
    "⚠️  X402_PAY_TO is not set — /paid is running FREE. Set it in .env to charge."
  );
}

// Hono runs handlers in registration order, so the gate MUST be registered
// before the routers it protects — a book handler mounted earlier would
// answer without ever producing a 402. The precheck goes first: unpaid bad
// input still gets the domain 400/404/409 instead of an unpayable 402.
app.use("/listings/:slug/book", bookingPrecheck);
app.use("*", paymentMiddleware(paidRoutes, server));

// Fail loudly at boot rather than at settlement. Without a key the server still
// starts and still returns a correct 402 — /supported and /verify do not need
// one — and then /settle returns 401 after the buyer has signed.
if (!process.env.X402_API_KEY) {
  console.warn(
    "⚠️  X402_API_KEY is not set. The 402s will look correct and settlement will fail with 401."
  );
}
if (!process.env.AGENT_WALLET_MASTER_SECRET) {
  console.warn(
    "⚠️  AGENT_WALLET_MASTER_SECRET is not set — Agent wallet creation will fail with wallet_unavailable."
  );
}

// Listings API — the Agent's data surface. Read routes stay open (the gate
// only claims its own patterns); POST /listings/:slug/book is the paid
// Booking endpoint.
app.route("/listings", listings);

// Booking cancellations — POST /bookings/:id/cancel (issue #18): a
// cancellation carries no new payment, it releases one (the refund flows
// back from the Owner's wallet).
app.route("/bookings", bookings);

// Credits (monedas Nomai) — issue #17. The ledger is the only source of
// truth for balances; every route here is Bearer-scoped to the Traveler.
app.route("/credits", credits);

// Agent wallet provisioning and balance — issue #16 (ADR-0003). Bearer-scoped
// like /credits: the token's Traveler must match the requested traveler_id.
app.route("/wallet", wallet);

// Ops-only Escrow keeper (ADR-0006) — POST /internal/keeper, Bearer
// KEEPER_SECRET. Cron/manual trigger for process_escrow_releases().
app.route("/internal", keeper);

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
