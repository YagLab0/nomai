-- credit_ledger → agent_usage, currencies table, book_stay lockdown.
-- Decisions D1/D2/D3 (.context/work/pendientes-db/decisions.md).
--
--   D1  The ledger is internal Agent-usage metering (ADR-0002 free-tier
--       abuse controls), not a product the Traveler sees — Credits were
--       retired by the Service fee (ADR-0005). amount → cost_units,
--       booking_id goes away, kind narrows to spend/adjustment, stage and
--       the (traveler_id, reference) unique index stay for idempotent
--       /usage/record writes.
--   D2  currencies is the canonical list of fiat codes a Listing can be
--       priced in; wfiat_address ({network: address}) stays empty until the
--       Ripio wFIAT tokens are mapped. listings.currency and
--       bookings.currency become real FKs — seed.sql only uses codes in
--       this list (USD for most, ARS/BRL/CLP/COP/MXN/UYU).
--   D3  book_stay was the last RPC still executable by anon/authenticated
--       through PostgREST; the api calls it via service_role like the five
--       locked down in 20261024150000.

-- ---------------------------------------------------------------------------
-- credit_ledger → agent_usage
-- ---------------------------------------------------------------------------
alter table public.credit_ledger rename to agent_usage;

alter table public.agent_usage rename column amount to cost_units;
alter table public.agent_usage drop column booking_id;

-- Retired kinds (purchase, free_grant, refund) become 'adjustment' so any
-- existing rows satisfy the narrowed check.
update public.agent_usage set kind = 'adjustment'
  where kind not in ('spend', 'adjustment');

alter table public.agent_usage drop constraint credit_ledger_kind_check;
alter table public.agent_usage add constraint agent_usage_kind_check
  check (kind in ('spend', 'adjustment'));

alter index public.credit_ledger_traveler_idx rename to agent_usage_traveler_idx;
alter index public.credit_ledger_reference_uq rename to agent_usage_reference_uq;

alter policy credit_ledger_select_own on public.agent_usage
  rename to agent_usage_select_own;

-- ---------------------------------------------------------------------------
-- currencies — fiat codes with per-network wFIAT token addresses
-- ---------------------------------------------------------------------------
create table public.currencies (
  code text primary key,
  name text not null,
  decimals smallint not null default 2,
  wfiat_address jsonb not null default '{}'::jsonb
);

alter table public.currencies enable row level security;

create policy currencies_public_read on public.currencies
  for select using (true);

insert into public.currencies (code, name, decimals) values
  ('ARS', 'Peso argentino', 2),
  ('BRL', 'Real brasileño', 2),
  ('CLP', 'Peso chileno', 2),
  ('COP', 'Peso colombiano', 2),
  ('MXN', 'Peso mexicano', 2),
  ('PEN', 'Sol peruano', 2),
  ('UYU', 'Peso uruguayo', 2),
  ('USD', 'Dólar estadounidense', 2);

alter table public.listings
  add constraint listings_currency_fkey
  foreign key (currency) references public.currencies(code);

alter table public.bookings
  add constraint bookings_currency_fkey
  foreign key (currency) references public.currencies(code);

-- ---------------------------------------------------------------------------
-- book_stay — service_role only (same lockdown as the other RPCs)
-- ---------------------------------------------------------------------------
revoke execute on function public.book_stay(text, text, text, int, text, uuid)
  from public, anon, authenticated;
grant execute on function public.book_stay(text, text, text, int, text, uuid)
  to service_role;
