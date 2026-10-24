-- Restores credit_ledger — repurposed, not revived: under ADR-0005 Credits
-- stopped being a product (the Traveler no longer buys monedas; the Service
-- fee is the revenue line). This table is now INTERNAL Agent-usage metering
-- implementing ADR-0002's ceilings on free usage: the api's /credits endpoints
-- write `spend` rows per stage and read sum(amount) as the remaining free
-- allowance, enforcing the daily budgets before live_query calls.
--
-- Same shape as the original init migration so existing api code keeps
-- working verbatim.

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id),
  amount numeric(12,2) not null check (amount <> 0),
  kind text not null check (kind in ('purchase','free_grant','spend','refund','adjustment')),
  stage text check (stage in ('conversation','cached_inventory','live_query')),
  booking_id text references public.bookings(id),
  reference text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index credit_ledger_traveler_idx on public.credit_ledger (traveler_id, created_at);
create unique index credit_ledger_reference_uq
  on public.credit_ledger (traveler_id, reference)
  where reference is not null;

alter table public.credit_ledger enable row level security;

create policy credit_ledger_select_own on public.credit_ledger
  for select using (auth.uid() = traveler_id);
