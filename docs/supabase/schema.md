# Schema

> **ADR-0005/0006 pivot (migration `…_service_fee_escrow_model.sql`):** Credits
> are retired — the old `credit_ledger` survives only as `agent_usage`,
> internal metering (see below); revenue is a fixed **Service fee**
> per Booking (`bookings.service_fee_*`) plus the FX fee. Bookings now settle
> through an **escrow** contract (`bookings.escrow_*`), released 50% at the
> Cancellation deadline (`cancel_deadline`, default `check_in - 5`) and the
> rest 24 h after check-in unless a **Claim** (`claim_*`) is open.
> `payments.kind` distinguishes `charge`/`service_fee`/`fx_fee`/`release`/
> `refund`. Lifecycle: `pending_payment → confirmed → in_progress → completed`,
> `claim_open` may sit in between, `cancelled` before check-in. All RPCs are
> escrow-aware and locked down: EXECUTE is revoked from PUBLIC/anon/
> authenticated and granted to `service_role` only (migrations
> `…_escrow_rpcs_restore_and_lockdown.sql`, `…_agent_usage_currencies.sql`
> and `…_cancel_booking_lockdown.sql`), so every call goes through
> `apps/api`.

Two halves living in `public`, all behind Row Level Security:

1. **The publications model** — `businesses` → `properties` → `listings` plus
   the inventory satellites. Field-for-field mirror of
   `apps/api/src/data/types.ts` (the modelo-datos-publicaciones spec; see
   `docs/informe-mock-listings.md` §6). Text PKs equal the mock ids, so the
   seed is a straight row copy. Money is always `*_minor` bigint.
2. **The platform tables** — `travelers`, `agent_wallets`, `agent_usage`,
   `currencies`, `platform_settings`: nomai concepts (`GLOSSARY.md`) that
   the publications model doesn't cover.

```
businesses ──1:N── properties ──1:N── listings ──1:N── availability_nights
    │                                     │          ├─ listing_amenities ──N── amenities
    │                                     │          ├─ listing_photos
    │                                     │          ├─ listing_units
    │                                     │          └─ rate_rules
auth.users ──1:1── travelers              └─1:N── bookings ──1:N── payments
    │               │ 1:N                        │          │   (x402 receipt)
    │               ▼                            │          └─1:N── reviews
    └──1:1── agent_wallets            agent_usage (metering)  (≤1 per direction,
                                                              ADR-0008)

currencies ── referenced by listings.currency + bookings.currency
platform_settings — key/value config (service_fee_pct), service_role only
```

## Publications

### `businesses`

The Operator (the domain's **Owner**). `payout_address` is where escrow
releases land — the Booking's `pay_to` is the escrow contract, not this
wallet (ADR-0006; the platform still never holds funds, ADR-0001).
Platform addition not in the model: `user_id` links to `auth.users` for the
owner dashboard. `status`: `pending`/`active`/`suspended`. ADR-0008 adds
`rating` (`numeric(2,1)`, 0–5, nullable) and `reviews` (`int`, default 0) —
the Owner's recency-weighted storefront score across all its Lodgings,
maintained by `refresh_review_scores()`; `rating` is null while the Owner
has no Reviews.

### `properties`

The physical place — `property_type` (`hotel`…`posada`…`otro`), address,
lat/lng, `country_code`, and `timezone` which defines what a "night" is.
`checkin_time`/`checkout_time` live here.

### `listings`

The sellable publication — the unit the Agent searches, quotes and books.
`kind` is `entire_place`/`room` (the property type moved to `properties`).
`slug` (citext) is the public identifier agents quote. `base_price_minor`,
`cleaning_fee_minor`, `min_nights`/`max_nights`, `max_guests`, `rating`,
`reviews`, `instant_book`, house-rule flags, `status`
(`draft`/`published`/`paused`/`archived`) — **only `published` is visible**
to agents and the public (enforced by RLS). Since ADR-0008 `rating`/`reviews`
are no longer seed copy: `refresh_review_scores()` rewrites them as the
recency-weighted pair over the listing's `to_lodging` Reviews.

### Satellites

| Table | Purpose |
|---|---|
| `amenities` | Canonical catalog; `code` is the search filter key, `category` groups it |
| `listing_amenities` | N:M with optional `detail`; PK `(listing_id, amenity_id)` |
| `listing_photos` | `url`, `alt_text`, `position`, `is_cover` |
| `listing_units` | Rentable units of a listing (hotel rooms); `status` active/maintenance/inactive |
| `rate_rules` | Seasonal `nightly_price_minor` over a date range; `priority` breaks overlaps |
| `availability_nights` | PK `(listing_id, night)` — `open`/`blocked`/`booked`, `units_available`, `price_minor` override (null → rate_rule → base_price) |

### Owner Lodging writes (`…_owner_lodging_writes.sql`)

The Owner's wizard persists through three `security definer` RPCs, each one
transaction: `create_lodging` (property + `published` listing + photos +
amenities + 365 `open` nights — `book_stay` needs a row per night),
`update_lodging` (blocks relocating while there is an Upcoming Booking;
replaces photos/amenities, tops up missing nights) and `archive_lodging`
(soft delete to `archived`, refused with an Upcoming Booking). They take
`p_user_id` and resolve the Owner as `businesses.user_id = p_user_id`; the
api route (`POST /owners/lodgings` — the web `/api/owners/*` handlers are
thin proxies) verifies the Bearer session first and calls them with the
secret key. `ensure_amenity(label)` maps free-text amenity
lines to `amenities` (by code, then name, else a new `servicios` row).
Photos live in the public Storage bucket `listing-photos` under
`<business_id>/<listing_id>/`; `listing_photos.url` stores the public URL.

`set_lodging_status` (`…_owner_lodging_status.sql`) toggles a non-archived
listing between `published` and `paused` — the dashboard's pause/republish.
Same `p_user_id` ownership check; pausing is allowed with Upcoming Bookings
(existing Bookings stand) and the first publish stamps `published_at`.

### `bookings`

Mock shape plus platform columns: `traveler_id` (→ `travelers`, for RLS
and dashboards), `currency` (snapshot of the listing's — FK to
`currencies`), and `guest_ref` (the caller-supplied reference the agent
passes). `status` (`booking_status` enum): `pending_payment` → `confirmed`
→ `in_progress` → `completed`, with `claim_open` while a Claim is open and
`cancelled`/`refunded` as terminals before check-in.

ADR-0005/0006 columns:

- **Service fee** — `service_fee_minor` (bigint, set by the
  `apply_service_fee` trigger from `platform_settings.service_fee_pct`) and
  `service_fee_pct` (the snapshot used). Charged to the Traveler on top of
  the rental, never refunded.
- **Escrow** — `escrow_address` (the contract instance holding the rental),
  `escrow_status` (`unfunded`/`funded`/`partially_released`/`released`/
  `refunded`/`claimed`), `cancel_deadline` (`check_in - 5`, indexed for the
  keeper), `first_release_at`, `final_release_at`.
- **Claim** — `claim_reason` (`no_access`/`not_as_described`/
  `owner_no_show`), `claim_evidence` (jsonb), `claim_resolution`
  (`full_refund`/`partial_refund`/`full_release`), `claim_resolved_at`.

### `payments`

The x402 settlement receipt — one row per on-chain movement around a
Booking's escrow. `payer` (the Traveler's Agent wallet), `pay_to` (the
**escrow contract address** on the inbound charge — the Owner's
`payout_address` is only the destination of `release` rows), `amount_minor`,
`asset`, `network`, `tx_hash`, `facilitator_ref` (the payment-identifier
extension for reconciling the ledger). `kind` (`payment_kind` enum):
`charge`/`service_fee`/`fx_fee`/`release`/`refund`.

### `reviews`

Two-sided Reviews (issue #51, ADR-0008; migration `…_reviews.sql`). One row
per direction per Booking — `unique (booking_id, direction)` — and only a
`completed` Booking can be reviewed, inside a 14-day window after check-out;
publication is immediate. `direction` is the `review_direction` enum
(`to_lodging`/`to_traveler`).

Columns: `booking_id` (text → `bookings`), `author_id` (→ `auth.users`, `on
delete set null` — seeded history carries `author_id` null with
`author_name` as the display copy), `author_name` (first name only for
Travelers, the business name for Owners), and exactly one subject:
`subject_listing_id` (→ `listings`, cascade) on `to_lodging` rows or
`subject_traveler_id` (→ `travelers`, cascade) on `to_traveler` rows.
`rating` smallint 1–5 required; the seven category columns (`cleanliness`,
`accuracy`, `checkin`, `communication`, `location`, `value`, `house_rules`)
are optional 1–5. A check keeps each direction to its own set: `to_lodging`
carries Airbnb's six (no `house_rules`), `to_traveler` carries only
`cleanliness`/`communication`/`house_rules`. `body` is the public comment;
`reply_body`/`replied_at` hold the Owner's public reply (`to_lodging` only).
Indexed on `subject_listing_id`, `subject_traveler_id`, `author_id`.

Functions (all `security definer` unless noted; EXECUTE granted to
`service_role` only):

- `review_weight(timestamptz)` — plain sql: weight 1 today decaying linearly
  to 0 at 36 months (Booking's recency model).
- `refresh_review_scores(p_listing_id text, p_business_id text)` — recomputes
  the weighted `{rating, reviews}` pair on `listings` (over its `to_lodging`
  Reviews) and on `businesses` (over the `to_lodging` Reviews of every
  Listing under its `properties`); runs inside `submit_review`'s transaction.
- `traveler_score(p_traveler_id uuid)` → jsonb `{rating, reviews}` — the same
  weighting over `to_traveler` rows, computed on read (the guest score is
  never public, so nothing denormalizes).
- `submit_review(p_user_id, p_booking_id, p_direction, p_rating, p_body,
  …seven optional category ints)` → the usual `{ok:true,…}` /
  `{ok:false,error:{code,message}}` contract — the only way a Review lands. Re-checks in one
  transaction: rating 1–5 (`invalid_rating`), Booking exists (`not_found`),
  status `completed` (`not_reviewable`), window open
  (`current_date > checkout + 14` → `window_closed`), caller is the Booking's
  Traveler for `to_lodging` or owns the Lodging's business for `to_traveler`
  (`forbidden`; a `to_traveler` on a Booking with no `traveler_id` is
  `not_reviewable`), and `on conflict` → `already_reviewed`. Returns the new
  `listing` score pair or the `traveler` score.
- `reply_to_review(p_user_id, p_review_id, p_body)` — the Owner's public
  reply on a `to_lodging` Review they received; an empty body clears it
  (`replied_at` back to null).
- `is_owner_of_traveler(p_traveler_id uuid)` — `stable` RLS helper like
  `owns_listing`: does the current user own a business that hosted this
  Traveler?

RLS: `reviews_lodging_public_read` exposes every `to_lodging` row for
`select`; `reviews_traveler_scoped_read` exposes `to_traveler` rows only to
the rated Traveler, the author, and Owners who hosted them
(`is_owner_of_traveler`). No insert/update/delete policies — writes go
through the locked-down RPCs (EXECUTE revoked from public/anon/
authenticated, granted to `service_role`, same as the escrow RPCs).

## Platform

### `travelers`

One row per `auth.users`. Verification tiers as timestamps (ADR-0002):
`phone_verified_at` → `funded_at`/`self_verified_at` → `gov_id_verified_at`
(government ID only at Booking time).

### `agent_wallets`

One per Traveler (unique `traveler_id`, ADR-0003): `address`, `network`,
`erc8004_agent_id`. No keys — custody is an open question.

### `agent_usage`

Internal Agent-usage **metering** (ADR-0002 free-tier abuse controls), not a
product the Traveler sees — Credits (*monedas Nomai*) were retired by the
Service fee (ADR-0005), so there is **no balance**, no grants, nothing to
top up. Append-only rows: `cost_units` (numeric, positive) priced
server-side per `stage` (`conversation`/`cached_inventory`/`live_query`);
`kind` is only `spend`/`adjustment` (the old purchase/grant/refund kinds are
gone). `reference` is the caller's idempotency key (partial unique index on
`(traveler_id, reference)`). The daily ceilings live in `apps/api`
(`src/usage.ts`); the agent wallet's on-chain balance is the hard spend cap.

### `currencies`

Canonical list of fiat codes a Listing can be priced in — `code` (PK),
`name`, `decimals`, `wfiat_address` (`{network: address}` jsonb, empty until
the Ripio wFIAT tokens are mapped). `listings.currency` and
`bookings.currency` are real FKs into it. Public read; writes service_role.

### `platform_settings`

Key/value config the SQL layer can read (env vars don't reach the
database): `key` (PK), `value` (jsonb), `updated_at`. Currently just
`service_fee_pct` (`7.0`), consumed by the `apply_service_fee` trigger.
RLS `for all using (false)` — service_role only.

## RLS

| Table | Read | Write |
|---|---|---|
| `businesses` | Public | Owner — `auth.uid() = user_id` (insert + update) |
| `properties` | Public | Owner `insert` only — `owns_business(business_id)`; later writes via the lodging RPCs |
| `listings` | `status='published'`, or the owner | Owner `insert` only — `status='draft'` + the property→business chain; later writes via the lodging RPCs |
| `amenities`, `listing_amenities`, `listing_photos`, `listing_units`, `rate_rules`, `availability_nights`, `currencies` | Public | api only |
| `travelers`, `agent_wallets`, `agent_usage` | Own rows | Own profile only (`travelers`); rest api-only |
| `bookings`, `payments` | Traveler's own; owner of the listing | api only |
| `reviews` | `to_lodging` public; `to_traveler` only the rated Traveler, the author, and Owners who hosted them | api only (the `submit_review`/`reply_to_review` RPCs) |
| `platform_settings` | — (no policies grant access) | api only |

Two `security definer` helpers — `owns_business(text)` and
`owns_listing(text)` — encapsulate the owner chain and keep policies
readable (plus `is_owner_of_traveler(uuid)` for the `to_traveler` review
policy, ADR-0008). Everything the platform writes (recording usage, settling
Bookings, flipping nights to `booked`) goes through `apps/api` with the
secret key, which bypasses RLS — that's why most tables carry no
insert/update policies.

The same lockdown applies to the `security definer` RPCs: EXECUTE on
`book_stay`, `cancel_booking`, `confirm_booking_payment`, `release_booking`,
`open_claim`, `resolve_claim`, `process_escrow_releases`, `create_lodging`,
`update_lodging`, `archive_lodging`, `set_lodging_status`, `submit_review`,
`reply_to_review`, `refresh_review_scores` and `traveler_score` is revoked
from PUBLIC/anon/authenticated and granted to `service_role` only — PostgREST
can't reach them; `apps/api` calls them with the secret key.
Traveler-initiated cancellation (ADR-0004) goes through
`POST /bookings/:id/cancel`, where the Bearer token is verified and matched
to the Traveler before `cancel_booking` runs — the function's own
`p_guest_ref`/`p_traveler_id` check stays as a second layer inside the same
transaction.
