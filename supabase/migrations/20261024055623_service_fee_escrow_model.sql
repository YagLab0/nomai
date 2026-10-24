-- New business model (ADR-0005, ADR-0006): Credits are retired — revenue is a
-- fixed Service fee per Booking + the FX fee — and Bookings settle through an
-- escrow contract on Celo, released to the Owner in stages.
--
--   * Service fee: fixed % of the rental, paid by the Traveler, kept by the
--     platform even on Cancellation (the Agent's work is done).
--   * Escrow: rental goes to the escrow contract at pay time; 50% releases at
--     the Cancellation deadline (5 days before check-in), the rest 24 h after
--     check-in if no Claim. Refunds come out of escrow — immediate.
--   * Claims: 24 h window after check-in, three reasons only; Nomai resolves.
--
-- The cancel_booking()/book_stay()/confirm|release functions from earlier
-- migrations predate escrow and will be reworked separately (the endpoints
-- keep compiling — the functions just need a new escrow step when the
-- contract lands).

drop table public.credit_ledger;

-- ---------------------------------------------------------------------------
-- Booking lifecycle gains "in progress" (en curso) and "claim open" states:
--   pending_payment → confirmed → in_progress → completed
--                                 ↘ claim_open ↗        cancelled
-- ---------------------------------------------------------------------------
alter type booking_status add value if not exists 'in_progress';
alter type booking_status add value if not exists 'claim_open';

create type escrow_status as enum
  ('unfunded','funded','partially_released','released','refunded','claimed');
create type claim_reason as enum
  ('no_access','not_as_described','owner_no_show');
create type claim_resolution as enum
  ('full_refund','partial_refund','full_release');

alter table public.bookings
  -- Service fee (ADR-0005): the platform's revenue line, shown separately at
  -- pay time and NOT refunded on Cancellation.
  add column service_fee_minor bigint not null default 0,
  add column service_fee_pct numeric(4,2),

  -- Escrow (ADR-0006): the contract instance holding the rental. pay_to stops
  -- being the Owner's wallet — it is the escrow now (payout_address on
  -- businesses stays the eventual destination of releases).
  add column escrow_address text check (escrow_address ~ '^0x[0-9a-fA-F]{40}$'),
  add column escrow_status escrow_status not null default 'unfunded',
  add column cancel_deadline date,
  add column first_release_at timestamptz,   -- 50% at cancel_deadline
  add column final_release_at timestamptz,   -- rest 24 h after check-in, no Claim

  -- Claims: Traveler only, 24 h after check-in.
  add column claim_reason claim_reason,
  add column claim_evidence jsonb,
  add column claim_resolution claim_resolution,
  add column claim_resolved_at timestamptz;

-- Deadline derives from check_in — set once at booking time, kept as a column
-- so the keeper job can index it directly.
alter table public.bookings
  alter column cancel_deadline set default (check_in - 5);

create index bookings_escrow_release_idx
  on public.bookings (escrow_status, cancel_deadline)
  where escrow_status in ('funded','partially_released');

-- ---------------------------------------------------------------------------
-- payments rows now describe every on-chain movement around a Booking's
-- escrow, not just the inbound charge.
-- ---------------------------------------------------------------------------
create type payment_kind as enum
  ('charge','service_fee','fx_fee','release','refund');

alter table public.payments
  add column kind payment_kind not null default 'charge';
