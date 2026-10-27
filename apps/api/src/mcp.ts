// Read-only MCP surface — Streamable HTTP, stateless, mounted at /mcp.
//
// External agents (Grok, ChatGPT, any MCP client) get the same read tools the
// eve Agent has — marketplace search plus the caller's own Traveler data —
// without going through the chat agent. Writes and payments are not exposed:
// no book/cancel/claim/pay tools exist here by design.
//
// Auth: every call needs `Authorization: Bearer <Supabase access_token>` —
// the same token the web chat forwards to the eve channel. It is verified
// through the Auth server (travelerIdFrom, same as /usage/*) and the
// verified user id IS the traveler_id; tool input can never name another
// Traveler. 401s carry the RFC 9728 `resource_metadata` pointer, and
// /.well-known/oauth-protected-resource[...] advertises Supabase Auth as the
// authorization server — the discovery pair OAuth-capable clients (the
// grok.com connector, ChatGPT, Claude) need to run the full OAuth dance.
//
// Local dev escape hatch: with NODE_ENV != "production" and no Bearer header,
// NOMAI_MCP_DEV_TRAVELER_ID impersonates that Traveler so a client can be
// wired up without minting a real token first.

import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { formatEther } from "viem";
import { z } from "zod";

import { travelerIdFrom } from "./auth.js";
import {
  getBookingDetail,
  getListingBySlug,
  listBookings,
  quoteStay,
  searchListings,
} from "./data/index.js";
import { provisionAgentWallet, publicClient } from "./wallet.js";

// Public origin of this API. Used for the OAuth protected-resource metadata
// and the WWW-Authenticate challenges — set NOMAI_PUBLIC_URL on deployments
// (it is the https URL clients reach, tunnel or real domain).
const publicBase = () =>
  (
    process.env.NOMAI_PUBLIC_URL ??
    `http://localhost:${process.env.PORT ?? 3001}`
  ).replace(/\/+$/, "");

const resourceUrl = () => `${publicBase()}/mcp`;

// Supabase Auth is the OAuth 2.1 authorization server: MCP clients discover
// its endpoints at <issuer>/.well-known/openid-configuration.
const issuerUrl = () =>
  `${(process.env.SUPABASE_URL ?? "").replace(/\/+$/, "")}/auth/v1`;

const challenge = () =>
  `Bearer realm="nomai", resource_metadata="${publicBase()}/.well-known/oauth-protected-resource/mcp"`;

// ---------------------------------------------------------------------------
// tools — same names and result shapes as the agent's read tools
// ---------------------------------------------------------------------------

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const ok = (data: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
  structuredContent: data,
});

const err = (error: string, extra?: Record<string, unknown>) => ({
  isError: true,
  content: [
    { type: "text" as const, text: JSON.stringify({ error, ...extra }) },
  ],
});

function nomaiMcpServer(travelerId: string): McpServer {
  const server = new McpServer(
    { name: "nomai", version: "0.1.0" },
    {
      instructions:
        "nomai lodging marketplace — read-only tools scoped to the authenticated Traveler: search/get/quote published listings anywhere, list and inspect the Traveler's own Bookings ('mis reservas'), and read the Traveler's agent wallet. Never invent listings, prices or booking ids — always fetch them here.",
    }
  );

  server.registerTool(
    "search_listings",
    {
      description:
        "Search published nomai listings. Filter by city/country, stay dates (checkin/checkout YYYY-MM-DD), guests, type (hotel|posada|apartamento|cabana|finca|room|entire_place), amenity codes (all must be present), and max_price_minor. Returns cards with slug, cover photo, nightly price and, when dates are given, total_minor/total_display for the whole stay. Always use this before recommending a place — never invent listings or prices.",
      inputSchema: {
        city: z.string().optional().describe("City name, e.g. 'Buenos Aires' or 'Cusco'"),
        country: z
          .string()
          .optional()
          .describe("Country name ('argentina', 'brasil') or ISO code ('AR', 'CO')"),
        checkin: z.string().optional().describe("Check-in date YYYY-MM-DD"),
        checkout: z.string().optional().describe("Check-out date YYYY-MM-DD"),
        guests: z.number().int().min(1).optional(),
        type: z
          .string()
          .optional()
          .describe("Property type (hotel, posada, apartamento, cabana, finca) or listing kind (room, entire_place)"),
        amenities: z
          .array(z.string())
          .optional()
          .describe("Amenity codes that must ALL be present, e.g. ['wifi','piscina']"),
        max_price_minor: z
          .number()
          .int()
          .optional()
          .describe("Max nightly price in minor units (USD minor = 10^-6, e.g. 120000000 = US$120)"),
      },
      annotations: READ_ONLY,
    },
    async (input) => {
      const results = await searchListings(input);
      return ok({ count: results.length, results });
    }
  );

  server.registerTool(
    "get_listing",
    {
      description:
        "Get one listing's full detail by slug — photos, amenities, rooms, policies, pricing fields and the property's location. Use search_listings first to find slugs.",
      inputSchema: {
        slug: z.string().describe("The listing slug, e.g. 'palermo-loft'"),
      },
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const listing = await getListingBySlug(slug);
      if (!listing) return err("listing not found", { code: "not_found" });
      return ok({ listing });
    }
  );

  server.registerTool(
    "quote_booking",
    {
      description:
        "Quote a stay — night-by-night pricing, cleaning fee, Service fee and total_display. Read-only: returns availability-confirmed pricing without creating or paying a Booking.",
      inputSchema: {
        slug: z.string().describe("The listing slug"),
        checkin: z.string().describe("Check-in date YYYY-MM-DD"),
        checkout: z.string().describe("Check-out date YYYY-MM-DD"),
        guests: z.number().int().min(1).describe("Number of guests"),
      },
      annotations: READ_ONLY,
    },
    async ({ slug, checkin, checkout, guests }) => {
      const r = await quoteStay(slug, checkin, checkout, guests);
      if (!r.ok) return err(r.error.message, { code: r.error.code });
      return ok({ quote: r.quote as unknown as Record<string, unknown> });
    }
  );

  server.registerTool(
    "list_bookings",
    {
      description:
        "List the authenticated Traveler's Bookings ('mis reservas'), newest first. Pass guest_ref to also look up Bookings made under that reference (e.g. booked through another channel); without it, only the signed-in Traveler's own Bookings come back. An empty list means none under that key. Use get_booking for one Booking's full Escrow/Claim timeline.",
      inputSchema: {
        guest_ref: z
          .string()
          .optional()
          .describe("Optional Traveler reference Bookings were created under"),
      },
      annotations: READ_ONLY,
    },
    async ({ guest_ref }) => {
      const ref = guest_ref?.trim();
      const bookings = await listBookings(
        ref ? { guest_ref: ref } : { traveler_id: travelerId }
      );
      return ok({ count: bookings.length, bookings });
    }
  );

  server.registerTool(
    "get_booking",
    {
      description:
        "Get one Booking by id — '¿cómo va mi reserva?'. Returns status (pending_payment|confirmed|in_progress|completed|claim_open|cancelled), escrow_status, stay dates, guests, nights_count, total_display, the Escrow timeline (cancel_deadline, first_release_at, final_release_at) and Claim fields. Only readable when it belongs to the authenticated Traveler or matches the given guest_ref — anything else answers not_found/forbidden.",
      inputSchema: {
        booking_id: z.string().describe("The booking id, e.g. 'bkg_1'"),
        guest_ref: z
          .string()
          .optional()
          .describe("The reference the Booking was created under, if it was not made by this Traveler account"),
      },
      annotations: READ_ONLY,
    },
    async ({ booking_id, guest_ref }) => {
      const r = await getBookingDetail(booking_id, {
        traveler_id: travelerId,
        guest_ref: guest_ref?.trim() || undefined,
      });
      if (!r.ok) return err(r.error.message, { code: r.error.code });
      return ok({ booking: r.booking as unknown as Record<string, unknown> });
    }
  );

  server.registerTool(
    "check_wallet",
    {
      description:
        "Read the authenticated Traveler's own agent wallet: its Celo address, network and native CELO balance. Provisions the wallet on first use, like the web app does at signup.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const wallet = await provisionAgentWallet(travelerId);
        const wei = await publicClient.getBalance({
          address: wallet.address as `0x${string}`,
        });
        return ok({
          address: wallet.address,
          network: wallet.network,
          balance_celo: formatEther(wei),
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : "wallet read failed");
      }
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// router — Bearer-auth'ed /mcp plus the OAuth discovery pair
// ---------------------------------------------------------------------------

type McpEnv = { Variables: { travelerId: string } };
const mcp = new Hono<McpEnv>();

// MCP clients (esp. browser-based connectors) preflight every call.
mcp.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "Last-Event-ID",
    ],
    exposeHeaders: ["Mcp-Session-Id", "MCP-Protocol-Version"],
  })
);

mcp.use("*", async (c, next) => {
  // catch(): without SUPABASE_* env (mock leg) verification itself throws —
  // that still answers 401, never a 500.
  const travelerId = await travelerIdFrom(c).catch(() => null);
  if (travelerId) {
    c.set("travelerId", travelerId);
    return next();
  }
  const devId = process.env.NOMAI_MCP_DEV_TRAVELER_ID;
  if (
    devId &&
    process.env.NODE_ENV !== "production" &&
    !c.req.header("authorization")
  ) {
    c.set("travelerId", devId);
    return next();
  }
  return c.json({ error: "unauthorized" }, 401, {
    "WWW-Authenticate": c.req.header("authorization")
      ? `${challenge()}, error="invalid_token"`
      : challenge(),
  });
});

// Stateless server: no standalone SSE stream (GET) and no sessions to end
// (DELETE) — both are optional per the spec and meaningless without state.
mcp.on(["GET", "DELETE"], "/", (c) =>
  c.json({ error: "method_not_allowed" }, 405, { Allow: "POST, OPTIONS" })
);

// One McpServer + transport per request: stateless mode, no session header —
// the spec's simplest Streamable HTTP profile. The transport owns the
// response stream (SSE-framed JSON-RPC); it closes it after writing, so the
// server must NOT be closed here — it is GC'd with the request.
mcp.all("/", async (c) => {
  const server = nomaiMcpServer(c.get("travelerId"));
  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  const res = await transport.handleRequest(c);
  return res ?? c.body(null, 202);
});

// RFC 9728 protected-resource metadata, served at the root well-known and at
// the resource path suffix — clients may fetch either.
export const mcpWellKnown = new Hono().basePath("/.well-known");

mcpWellKnown.get("/oauth-protected-resource", (c) =>
  c.json(protectedResourceMetadata())
);
mcpWellKnown.get("/oauth-protected-resource/mcp", (c) =>
  c.json(protectedResourceMetadata())
);

function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuerUrl()],
    bearer_methods_supported: ["header"],
    scopes_supported: [],
    resource_name: "nomai — Traveler data (read-only)",
  };
}

export default mcp;
