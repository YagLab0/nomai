# Schema

Tables in `public`, all behind Row Level Security. Domain terms follow
`GLOSSARY.md`; shaping decisions are in `docs/adr/0001–0004`.

```
auth.users
   │ 1:1                    ┌──────────────┐
   ▼                        │    owners    │◄──────────────┐
┌────────────┐   1:1        └──────┬───────┘               │ owner_id
│ travelers  │──────────┐          │ 1:N                   │
└─────┬──────┘          │          ▼                       │
      │ 1:N             │   ┌────────────┐                 │
      ▼                 │   │  lodgings  │─────────────────┘
┌───────────────┐       │   └─────┬──────┘
│ agent_wallets │       │         │ 1:N
└───────────────┘       │         ▼
      │ 1:N             │   ┌──────────┐        ┌───────────────┐
      └─────────────────┴──►│ bookings │◄───────│ credit_ledger │ (booking_id, optional)
                            └──────────┘  1:N   └───────────────┘
```

## `travelers`

The Traveler — one row per `auth.users`, created by the app at signup.

| Column | Notes |
|---|---|
| `id` | PK → `auth.users(id)`, cascade |
| `full_name`, `phone`, `country_code` | Profile basics |
| `phone_verified_at` | Tier 1 of verification (ADR-0002): small free grant |
| `funded_at` | Tier 2a: first Ripio funding — reuses Ripio's KYC |
| `self_verified_at` | Tier 2b alternative: Self proof-of-human |
| `gov_id_verified_at` | Tier 3: government ID, only at Booking time |

## `agent_wallets`

One per Traveler (unique on `traveler_id`, ADR-0003). The address the
Traveler's Agent pays Bookings from; the Traveler never operates it.

| Column | Notes |
|---|---|
| `address` | `0x…` check, unique |
| `network` | Default `celo-sepolia` |
| `erc8004_agent_id` | Verifiable Agent identity, when registered |

Signing-key custody is an open question (ADR-0003) — **no keys are stored
here, ever.**

## `owners`

The lodging host. `user_id` links to `auth.users` for the owner dashboard
(`/app/owner`); nullable while the Owner hasn't claimed an account.

| Column | Notes |
|---|---|
| `slug` | Public URL part (`/owners/[slug]`), unique |
| `wallet` | Settlement address — every Booking's x402 `pay_to` (ADR-0001) |
| `verified`, `response_time`, `bio`, `since` | Card/dashboard fields |

## `lodgings`

Marketplace inventory. Mirrors `apps/web/src/lib/lodgings.ts`; `photo_key`
and `tone` feed the existing PhotoKey/ArtTone artwork system.

| Column | Notes |
|---|---|
| `kind` | `posada` `cabana` `departamento` `casa` `hostal` `hotel-boutique` |
| `currency` | Ripio fiats only: `ARS BRL CLP COP MXN UYU` |
| `price_per_night` | In `currency`; the Traveler never sees USD (ADR-0001) |
| `rating`, `reviews` | Denormalized aggregates (added in migration 2) |
| `amenities` | `text[]` |

## `bookings`

A paid reservation settled by x402 in wFIAT, direct to the Owner's wallet.

| Column | Notes |
|---|---|
| `status` | `pending → settled`, or `cancelled → refunded` |
| `subtotal`, `fx_fee`, `total`, `currency` | Captured at quote time; `fx_fee` is the platform's conversion fee, shown as its own line (ADR-0001), null for same-currency Bookings |
| `quote` | `jsonb` — the `BookingQuote` lines shown at confirmation |
| `pay_to` | The Owner's wallet, snapshotted at Booking time |
| `agent_wallet_id`, `tx_hash`, `network` | Settlement trail on Celo |
| `cancelled_at`, `refund_amount` | Traveler-initiated only; full refund until 7 days before check-in, 50% after (ADR-0004) — enforced in app code |

## `credit_ledger`

Credits (*monedas Nomai*) — a signed ledger, not a balance.

| Column | Notes |
|---|---|
| `amount` | `+` purchase/grant, `−` spend; balance = `sum(amount)` per Traveler |
| `kind` | `purchase` `free_grant` `spend` `refund` `adjustment` |
| `stage` | Which search stage spent: `conversation` `cached_inventory` `live_query` (ADR-0002 staged costs) |
| `reference`, `meta` | External refs (Ripio transfer, LLM run id) |

Grants are non-transferable and non-withdrawable — there is intentionally
no "withdraw" or "transfer" kind.

## RLS policies

| Table | Read | Write |
|---|---|---|
| `owners`, `lodgings` | Public (marketplace) | Owner on their own rows (`owners.user_id = auth.uid()`) |
| `travelers`, `agent_wallets`, `credit_ledger` | Own rows only | Own profile only (`travelers`); rest via api |
| `bookings` | Traveler's own; Owner sees bookings of their lodgings | api only |

Anything the platform writes — posting Credits, settling Bookings, minting
Agent wallets — goes through `apps/api` with the secret key, which bypasses
RLS. That is why most tables have no insert/update policies: if the browser
should never do it, there is no policy for it.
