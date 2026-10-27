---
name: nomai
description: Query the nomai lodging marketplace and the signed-in Traveler's own data through the nomai read-only MCP server. Use for lodging search ("depas/alojamiento en X"), listing details, stay quotes, "mis reservas" / booking status and Escrow-Claim timelines, or the Traveler's agent wallet. Read-only — never invent listings, prices or booking ids.
---

# nomai MCP

nomai is a lodging marketplace (vocabulary: Traveler, Owner, Agent, Booking,
Service fee, Escrow, Claim, FX fee). The `nomai` MCP server exposes read-only
tools scoped to the authenticated Traveler: public marketplace search plus the
caller's own Bookings and agent wallet. No tool here writes, books, cancels or
pays — by design. For writes, send the user to the nomai app or its Agent.

## Tools

| Tool | Use for | Params |
|---|---|---|
| `search_listings` | "depas/alojamiento en X" — find slugs, nightly price, stay total | `city`, `country` (name or ISO code), `checkin`/`checkout` (`YYYY-MM-DD`), `guests`, `type` (`hotel`\|`posada`\|`apartamento`\|`cabana`\|`finca`, or kind `room`\|`entire_place`), `amenities` (ALL must be present), `max_price_minor` |
| `get_listing` | full detail of one listing: photos, amenities, policies, `occupied[]` dates, `units_available` | `slug` (from search results) |
| `quote_booking` | exact stay cost: night-by-night, cleaning fee, Service fee, `total_display`. Creates nothing | `slug`, `checkin`, `checkout`, `guests` |
| `list_bookings` | "mis reservas", newest first | optional `guest_ref` |
| `get_booking` | one Booking: `status`, `escrow_status`, dates, `total_display`, Escrow timeline (`cancel_deadline`, `first_release_at`, `final_release_at`), Claim fields | `booking_id`, optional `guest_ref` |
| `check_wallet` | the Traveler's agent wallet: Celo address, network, CELO balance | none |

## Rules

1. **Never invent listings, prices, availability or booking ids.** Search
   first; use `get_listing`/`quote_booking` for detail. If search returns
   nothing, say so — do not guess.
2. Typical flow: `search_listings` → `get_listing` (detail + occupied dates) →
   `quote_booking` (price for specific dates). For "mis reservas":
   `list_bookings` → `get_booking` (one Booking's timeline).
3. Dates are `YYYY-MM-DD`. Money fields (`*_minor`) are minor units
   (USD = 10^-6: US$120 → `120000000`).
4. `list_bookings` / `get_booking` / `check_wallet` are scoped to the
   authenticated Traveler. A Booking that isn't theirs answers
   `forbidden`/`not_found` — do not retry guessing other ids or owners.
   `guest_ref` is the possession-proof fallback for Bookings made outside the
   account.
5. Check `occupied[]` and `units_available` from `get_listing` before quoting
   dates.
6. All tools carry `readOnlyHint`. To book, cancel, pay or open a Claim, point
   the user to the nomai app/Agent — no MCP tool does it.

## Errors

- `401` / unauthorized → the Bearer token expired (~1h) or is missing. Re-mint:
  `POST <SUPABASE_URL>/auth/v1/token?grant_type=password` with
  `{email, password}` → `access_token`. Or use the dev shortcut below.
- `listing not found` → bad slug; re-run `search_listings`.
- `forbidden`/`not_found` on `get_booking` → not this Traveler's Booking; ask
  for the `guest_ref` it was created under.

## Wiring

- Server: Streamable HTTP, stateless, `POST /mcp` on the nomai API
  (`http://localhost:3001/mcp` locally — run `pnpm api:dev` with
  `LISTINGS_DATA_SOURCE=supabase` in `apps/api/.env`, otherwise it serves mock
  data).
- Auth: `Authorization: Bearer <Supabase access_token>` on every call; the
  verified user id IS the traveler scope — tools cannot name another Traveler.
- Devin CLI (local scope, not committed):
  `devin mcp add --transport http nomai http://localhost:3001/mcp --header "Authorization: Bearer <token>"`
- Dev-only shortcut: `NOMAI_MCP_DEV_TRAVELER_ID=<traveler uuid>` in
  `apps/api/.env` makes `/mcp` answer as that Traveler with no header
  (`NODE_ENV != production` only — never set it on a deployment).
- Full docs: `docs/mcp.md`.
