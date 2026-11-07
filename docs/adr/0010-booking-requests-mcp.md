# Booking requests: the Agent proposes over MCP, the Traveler disposes in the app

External agents (MCP clients) can create a **Booking request** — "reservame
X para tal fecha" — but money never moves over MCP. A request is a draft:
it holds a frozen quote snapshot and no inventory, and it only becomes a
Booking when the Traveler presses **Confirmar y pagar** in their own app,
which runs the normal paid `POST /listings/:slug/book` x402 flow
(ADR-0006). The Owner is notified only at confirmation. Messaging stays on
the Booking thread (ADR-0009); the MCP exposes the Traveler's side of it
so an external agent can read the thread and write to it on the Traveler's
behalf, still never touching payments.

## Rules

- A Booking request starts as an **idea** (only the place is required —
  "agendame X") and becomes **pending** (ready to pay) once dates/guests
  complete and a fresh server-side quote freezes. `origin` (`mcp`/`app`/
  `agent`) tracks where the draft was born so the UI can badge it
  ("Agendado por tu asistente" vs "por Nomito" vs "por vos"). Expiry (48 h)
  only runs on `pending` rows.
- A request is a draft: it never touches `bookings`, escrow, nights
  inventory or the keeper. It carries the requester's `traveler_id` (from
  the verified Bearer — never from the body), the listing, the origin, and —
  once completed — dates, guests, a frozen `quote` snapshot (totals,
  currency) and an `expires_at`.
- **No inventory hold (v1).** A request does not retain nights. Two
  Travelers can request overlapping dates; whoever pays first wins, the
  other's confirmation fails with the normal availability error and their
  request is marked `stale`. Holding inventory for drafts would let any MCP
  client block an Owner's calendar for free.
- The quote is frozen at request time and **re-quoted at confirmation**:
  `quoteStay` runs fresh in the paid flow (server-side price authority,
  ADR-0006). If the total moved, the app shows the new total before the
  paid retry is signed — the frozen snapshot is the reference ("te había
  cotizado $ X"), never the charge.
- Requests are Traveler-scoped end to end: `traveler_id = auth.uid()`.
  RLS allows select/insert/update only on own rows; the only write path is
  `apps/api` with the service_role client, same posture as Bookings and
  Reviews.
- Lifecycle: `idea → pending → confirmed | cancelled | expired | stale`. Only `idea` rows can complete; only `idea`/`pending` rows can cancel.
  `expired` is computed on read (`expires_at < now()` still answering
  `pending` is a lie the API never tells — the list endpoint marks them).
  `confirmed` carries the resulting `booking_id`.
- The Owner sees nothing until confirmation: no inbox row, no notification.
  Owner noise from unpaid drafts is a product failure, not a feature.
- `create_booking_request` is the **only** write tool the MCP gains that
  creates commercial state, and it creates no obligation: no charge, no
  hold, no escrow. `send_message` writes only to threads of the caller's
  own confirmed Bookings (`requireParty`, traveler side). Payments,
  cancels, claims and reviews stay exclusive to Nomito/app surfaces.

## Considered options

- **Reusing `bookings` with status `pending_payment` for drafts**: rejected —
  `book_stay()` retains nights and the keeper reconciles those rows as
  payments-in-flight; a draft would either block inventory for free or need
  a parallel lifecycle inside a table designed for money. A separate table
  keeps money and intentions apart.
- **Holding inventory with a TTL sweeper**: deferred to v2 — real value
  (the Traveler gets certainty) but real cost (a sweeper releasing nights,
  abuse surface for calendar-blocking, keeper interplay). Revisit when
  requests show sustained conversion.
- **Confirming from inside the MCP tool call** (the agent pays on the
  Traveler's behalf): rejected — the MCP client holds the Traveler's
  Bearer but never the Traveler's informed consent for a specific amount.
  The paid retry is signed only after the Traveler sees the fresh total in
  the app. This is the guardrail the hackathon's "agent autonomy with
  sensible guardrails" criterion rewards.
- **Owner-side MCP tools** (`as: owner` message reads): deferred — today's
  MCP is traveler-scoped by design (the `travelerId` closure); Owner
  access needs a business lookup per caller and doubles the party-check
  surface. Owners already have `/owners/inbox` in the app.

## Consequences

- New table `booking_requests` + locked-down RPCs (`create`, `list`,
  `cancel`, `convert`) following the escrow/review RPC pattern
  (`security definer`, EXECUTE to `service_role` only).
- New API router `booking-requests.ts` mounted on `/bookings/requests`
  (Bearer-required, before/after the x402 gate is irrelevant — none of its
  routes match a paid pattern): `POST /` (quote + insert), `GET /` (mine,
  with expiry marking), `POST /:id/cancel`, `POST /:id/converted`
  (called by the web after its paid booking succeeds).
- MCP gains `create_booking_request`, `list_booking_requests`,
  `get_thread`, `send_message` (traveler side only). The web `/api/mcp`
  passthrough needs no changes (opaque POST body).
- Web: a "pending confirmation" module in the Traveler app (`/app`) listing
  own requests with **Confirmar y pagar** (runs the existing paid booking
  flow with the request's params, then marks it converted) and thread
  links into the Booking chat once confirmed.
- `docs/mcp.md` documents the two-phase flow; the MCP `resource_name`
  stays "read-only" only if we keep it honest — it now reads "(read-only +
  requests & messages)"; update the string in both well-knowns.
