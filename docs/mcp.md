# nomai MCP — tools for external agents

`apps/api` serves an **MCP server** (Streamable HTTP, stateless) at
`POST /mcp`, so external agents (Grok, ChatGPT, Claude, any MCP client) can
query the marketplace and the caller's own Traveler data — the same surface
the eve Agent's tools wrap — plus two narrow write scopes: booking REQUESTS
(drafts the Traveler confirms and pays in the app) and the Traveler's side
of Booking threads. Real payments are not exposed: there is no `book`,
`cancel`, `claim` or `pay` tool here by design.

## Tools

| Tool | Scope |
|---|---|
| `search_listings` | published listings: city/country/dates/guests/type/amenities/price |
| `get_listing` | one listing's full detail by slug |
| `quote_booking` | stay quote (nights, fees, total) — no booking is created |
| `list_bookings` | the caller's Bookings ("mis reservas"); optional `guest_ref` fallback |
| `get_booking` | one Booking's status + Escrow/Claim timeline (ownership enforced) |
| `check_wallet` | the caller's agent wallet: address, network, CELO balance |
| `create_booking_request` | draft a Booking request (ADR-0010): frozen quote, no hold, no payment |
| `list_booking_requests` | the caller's drafts with status + expiry |
| `get_thread` | read the caller's side of one Booking's Traveler↔Owner thread |
| `send_message` | write to that thread as the Traveler (final — no edit/delete) |

Read tools carry `readOnlyHint`/`idempotentHint` annotations; the four
write tools are marked `readOnlyHint: false`. All tools are scoped to the
verified Bearer identity — see Auth model below.

## Booking requests — the agent proposes, the Traveler disposes (ADR-0010)

"Reservame X para tal fecha" over MCP runs in two phases:

1. The agent calls `create_booking_request` (or the Traveler does it in
   the app): the API quotes fresh server-side and saves a `pending` draft
   with a frozen quote snapshot and a 48 h expiry. No Booking is created,
   no nights are held, no money moves, the Owner sees nothing.
2. The Traveler opens **Por confirmar** in `/app`, reviews the draft and
   presses **Confirmar y pagar**: the web runs the normal paid
   `POST /listings/:slug/book` x402 flow server-side (payment-auth signs
   with the custodial key, paid retry settles into the Escrow vault), then
   marks the draft `converted` with the resulting `booking_id`.

The frozen quote is a reference ("te había cotizado $ X"), never the
charge: confirmation re-quotes server-side, so a moved total shows in the
app before anything is signed. Drafts never block inventory — whoever pays
first wins; the loser's confirmation fails with the normal availability
error.

## Auth model

Every `/mcp` call requires `Authorization: Bearer <Supabase access_token>` —
the same token the web chat forwards to the eve channel. The API verifies it
through the Auth server (`auth.getUser`); the **verified `user.id` IS the
`traveler_id`** and is injected server-side into `list_bookings`,
`get_booking` and `check_wallet`, so a client can never read another
Traveler's rows (`403 forbidden`). `guest_ref` stays the possession-proof
fallback for Bookings created before traveler linking existed.

- `GET`/`DELETE` → `405` (stateless server: no standalone SSE, no sessions).
- `401` responses carry `WWW-Authenticate` with an RFC 9728
  `resource_metadata` pointer.
- `GET /.well-known/oauth-protected-resource[/mcp]` advertises the resource
  and **Supabase Auth (`<SUPABASE_URL>/auth/v1`) as the authorization
  server** — the discovery pair OAuth-capable clients fetch before starting
  the flow.
- CORS is open on `/mcp` (browser connectors preflight every call).

Env: `NOMAI_PUBLIC_URL` (public https origin of this API — feeds the
resource metadata + challenges; default `http://localhost:3001`),
`NOMAI_MCP_DEV_TRAVELER_ID` (dev only: with no Bearer header and
`NODE_ENV != production`, `/mcp` answers as that Traveler — never set on a
deployed instance).

## Connecting a client to the WEB origin (the `/api/mcp` passthrough)

MCP clients can also connect against the **web app's** public URL, when the
API host is not the URL you want to hand out:

- URL de conector: `https://<web-host>/api/mcp` — `apps/web/src/app/api/mcp/
  route.ts` forwards every method to `{NOMAI_API_URL}/mcp`, answers CORS
  preflights itself, and rewrites the 401 `WWW-Authenticate` so
  `resource_metadata` names the **web** origin (`apps/api` would name its
  own host, stranding a client that never talks to it).
- Discovery pair served by the web: `GET /.well-known/oauth-protected-resource
  [/mcp]` (`apps/web/src/app/api/well-known/[...path]`, reachable via a
  `next.config.mjs` rewrite) — same JSON the API would serve, with
  `resource = <web origin>/api/mcp` and Supabase Auth as authorization
  server.

`NOMAI_API_URL` (the web's existing env) is all this needs. Local test with
`pnpm api:dev` + `pnpm --filter web dev`:

```sh
curl -s http://localhost:3000/.well-known/oauth-protected-resource/mcp
curl -s -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

## Connecting Grok

### xAI API (remote MCP tool) — works today

The xAI API's remote MCP tools accept an `authorization` field that lands as
the Bearer header:

```jsonc
tools: [{
  "type": "mcp",
  "server_url": "https://<api-host>/mcp",
  "server_label": "nomai",
  "authorization": "<the user's Supabase access_token>"
}]
```

Get a token for testing: the signed-in web session's
`session.access_token`, or `POST {SUPABASE_URL}/auth/v1/token?grant_type=password`
with `{email, password}`. Expires in ~1h (fine for demos; OAuth below is the
durable path).

### Grok CLI / Agent SDK — works today

```bash
grok mcp add nomai --transport http --url https://<api-host>/mcp \
  --header "Authorization: Bearer <access_token>"
```

### grok.com Custom connector — full OAuth (no pasted tokens)

The connector UI only does interactive OAuth, which needs the **Supabase
OAuth 2.1 server** enabled on project `tspsaemylnzvdgwtjcrz`:

1. Dashboard → **Authentication → OAuth Server** → enable; turn on
   **dynamic client registration** (MCP clients register themselves).
2. Set **Authorization Path** = `/oauth/consent` and **Site URL** = the web
   app's public origin — the consent screen lives at
   `apps/web/src/app/(auth)/oauth/consent` (already implemented: it asks for
   sign-in, shows client + scopes, posts to `/api/oauth/decision`).
3. The API must be publicly reachable (`NOMAI_PUBLIC_URL` = its https URL;
   for local testing use a tunnel).
4. In grok.com → Connectors → New → Custom → URL `https://<api-host>/mcp`.
   Grok discovers the resource metadata, registers via DCR, and the user
   signs in + consents on the nomai consent page.

## Booking ↔ Traveler linking

`POST /listings/:slug/book` accepts an optional
`Authorization: Bearer <token>` — the verified id goes to `book_stay` as
`p_traveler_id` (a token that doesn't verify is a 401, never a
silently-unlinked Booking). The agent's `book_listing` tool forwards the
chat Traveler's token, so bookings made by the Agent appear in
`list_bookings` — here and in the app — under that Traveler.
