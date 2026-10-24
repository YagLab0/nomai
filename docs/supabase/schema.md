# Schema

Two halves living in `public`, all behind Row Level Security:

1. **The publications model** — `businesses` → `properties` → `listings` plus
   the inventory satellites. Field-for-field mirror of
   `apps/api/src/data/types.ts` (the modelo-datos-publicaciones spec; see
   `docs/informe-mock-listings.md` §6). Text PKs equal the mock ids, so the
   seed is a straight row copy. Money is always `*_minor` bigint.
2. **The platform tables** — `travelers`, `agent_wallets`, `credit_ledger`:
   nomai concepts (`GLOSSARY.md`) that the publications model doesn't cover.

```
businesses ──1:N── properties ──1:N── listings ──1:N── availability_nights
    │                                     │          ├─ listing_amenities ──N── amenities
    └──1:N── cancellation_policies        │          ├─ listing_photos
          (business_id null = default)    │          ├─ listing_units
                                          │          └─ rate_rules
auth.users ──1:1── travelers              └─1:N── bookings ──1:N── payments
    │               │ 1:N                        ▲              (x402 receipt)
    │               ▼                            │
    └──1:1── agent_wallets            credit_ledger (booking_id, optional)
```

## Publications

### `businesses`

The Operator (the domain's **Owner**). `payout_address` is the x402 `payTo`
of every Booking — money settles straight to the Owner (ADR-0001).
Platform addition not in the model: `user_id` links to `auth.users` for the
owner dashboard. `status`: `pending`/`active`/`suspended`.

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
to agents and the public (enforced by RLS).

### Satellites

| Table | Purpose |
|---|---|
| `amenities` | Canonical catalog; `code` is the search filter key, `category` groups it |
| `listing_amenities` | N:M with optional `detail`; PK `(listing_id, amenity_id)` |
| `listing_photos` | `url`, `alt_text`, `position`, `is_cover` |
| `listing_units` | Rentable units of a listing (hotel rooms); `status` active/maintenance/inactive |
| `rate_rules` | Seasonal `nightly_price_minor` over a date range; `priority` breaks overlaps |
| `availability_nights` | PK `(listing_id, night)` — `open`/`blocked`/`booked`, `units_available`, `price_minor` override (null → rate_rule → base_price) |
| `cancellation_policies` | `full_refund_days`, `partial_refund_pct`, `partial_refund_days`; `business_id` null = platform default |

### `bookings`

Mock shape plus two platform columns: `traveler_id` (→ `travelers`, for RLS
and dashboards) and `currency` (snapshot of the listing's, so `total_minor`
stays interpretable). `guest_ref` is the caller-supplied reference the agent
passes. `status`: `pending_payment` → `confirmed` → `cancelled`/`completed`/
`refunded`.

### `payments`

The x402 settlement receipt — `payer` (the Traveler's Agent wallet),
`pay_to` (`businesses.payout_address`), `amount_minor`, `asset`, `network`,
`tx_hash`, `facilitator_ref` (the payment-identifier extension for
reconciling the ledger).

## Platform

### `travelers`

One row per `auth.users`. Verification tiers as timestamps (ADR-0002):
`phone_verified_at` → `funded_at`/`self_verified_at` → `gov_id_verified_at`
(government ID only at Booking time).

### `agent_wallets`

One per Traveler (unique `traveler_id`, ADR-0003): `address`, `network`,
`erc8004_agent_id`. No keys — custody is an open question.

### `credit_ledger`

Credits (*monedas Nomai*) as a signed ledger: `amount` +/−, `kind`
(`purchase`/`free_grant`/`spend`/`refund`/`adjustment`), `stage`
(`conversation`/`cached_inventory`/`live_query`), optional `booking_id`,
`reference`, `meta`. Balance = `sum(amount)`; grants are non-withdrawable —
no transfer kind exists.

## RLS

| Table | Read | Write |
|---|---|---|
| `businesses`, `properties`, `cancellation_policies`, `amenities`, `listing_amenities`, `listing_photos`, `listing_units`, `rate_rules`, `availability_nights` | Public | Owner via `owns_business(business_id)` on `businesses`/`properties`/`listings`; rest api-only |
| `listings` | `status='published'`, or the owner | Owner via property→business chain |
| `travelers`, `agent_wallets`, `credit_ledger` | Own rows | Own profile only (`travelers`); rest api-only |
| `bookings`, `payments` | Traveler's own; owner of the listing | api only |

Two `security definer` helpers — `owns_business(text)` and
`owns_listing(text)` — encapsulate the owner chain and keep policies
readable. Everything the platform writes (posting Credits, settling
Bookings, flipping nights to `booked`) goes through `apps/api` with the
secret key, which bypasses RLS — that's why most tables carry no
insert/update policies.
