// nomai — an x402 seller.
//
// `GET /free` is open. The only paid route is the Booking endpoint
// `POST /listings/:slug/book` — the generic `POST /paid` probe is retired
// (D4); Booking payments are how the API earns.
//
// The flow, once:
//   1. An agent calls the Booking route with no payment header.
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
import { CAIP2, CONFIG, NETWORK, facilitator } from "./x402.js";
import listings from "./listings.js";
import mcp, { mcpWellKnown } from "./mcp.js";
import bookings from "./cancellations.js";
import usage from "./usage.js";
import wallet from "./wallet.js";
import keeper from "./keeper.js";
import owners from "./owners.js";
import chats from "./chats.js";
import {
  BOOKING_ROUTE_PATTERN,
  bookingPrecheck,
  bookingRouteConfig,
  registerBookingHooks,
} from "./book-payment.js";
import { LISTINGS_DATA_SOURCE } from "./data/index.js";
import type { RoutesConfig } from "@x402/core/server";

const app = new Hono();

/** Free route — no payment, useful for liveness checks. */
app.get("/free", (c) =>
  c.json({ ok: true, network: NETWORK, facilitator: CONFIG.facilitator })
);

// One resource server settles the only paid route — the Owner-priced
// Booking endpoint. The booking hooks (issue #14) live on this server —
// pending_payment → confirmed + the payments row post-settle, release on
// settle failure.
const server = new x402ResourceServer(facilitator);
server.register("eip155:*", new ExactEvmScheme());
registerBookingHooks(server);

const paidRoutes: RoutesConfig = {
  // price/payTo resolve per request — a fresh server-side quote and the
  // listing's own business.payout_address, never a stale quote.
  [BOOKING_ROUTE_PATTERN]: bookingRouteConfig,
};

// Read-only MCP server — Bearer-authed (Supabase access token), plus the
// RFC 9728 protected-resource metadata for OAuth clients. Mounted BEFORE the
// x402 gate so these routes never see the payment middleware.
app.route("/mcp", mcp);
app.route("/", mcpWellKnown);

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

// Agent usage metering — ADR-0002 free-tier daily budgets (D9). No
// balance: every route here is Bearer-scoped to the Traveler.
app.route("/usage", usage);

// Agent wallet provisioning and balance — issue #16 (ADR-0003). Bearer-scoped
// like /usage: the token's Traveler must match the requested traveler_id.
app.route("/wallet", wallet);

// Owner write surface — the Lodging CRUD, status flips and onboarding that
// used to run as Next.js route handlers with the secret key in apps/web.
// Bearer-scoped to the verified user id; the web /api/owners/* routes are
// now thin proxies that forward the session token.
app.route("/owners", owners);

// Chat threads — the Traveler's saved Nomito conversations. Bearer-scoped
// like /usage: RLS isolates rows per Traveler on the JWT-scoped client.
app.route("/chats", chats);

// Ops-only Escrow keeper (ADR-0006) — POST /internal/keeper, Bearer
// KEEPER_SECRET. Cron/manual trigger for process_escrow_releases().
app.route("/internal", keeper);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`nomai x402 seller listening on http://localhost:${port}`);
console.log(`  network:     ${NETWORK} (${CAIP2})`);
console.log(`  facilitator: ${CONFIG.facilitator}`);
console.log(`  data source: ${LISTINGS_DATA_SOURCE}`);
