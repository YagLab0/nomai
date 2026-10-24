-- nomai — initial schema.
-- Domain vocabulary: GLOSSARY.md (Traveler, Owner, Agent, Lodging, Booking,
-- Credit, FX fee). Design decisions: docs/adr/0001–0004.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- TRAVELERS — the person who chats with the Agent and pays Bookings.
-- One row per auth.users; created by the app on signup.
-- ---------------------------------------------------------------------------
create table public.travelers (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  country_code char(2),

  -- Tiered verification (ADR-0002): phone at signup → first Ripio funding or
  -- Self proof for the full free grant → government ID only at Booking time.
  phone_verified_at timestamptz,
  funded_at timestamptz,
  self_verified_at timestamptz,
  gov_id_verified_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger travelers_set_updated_at
  before update on public.travelers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- AGENT WALLETS — exactly one per Traveler (ADR-0003). The address the
-- Traveler's Agent pays Bookings from; the Traveler never operates it.
-- Signing-key custody is still an open question — store none here.
-- ---------------------------------------------------------------------------
create table public.agent_wallets (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null unique references public.travelers (id) on delete cascade,
  address text not null unique check (address ~ '^0x[0-9a-fA-F]{40}$'),
  network text not null default 'celo-sepolia',
  erc8004_agent_id text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- OWNERS — list Lodgings; every Booking's x402 payment settles straight into
-- `wallet` (ADR-0001: the platform never holds booking funds). `user_id` is
-- the Owner's optional login for the owner dashboard.
-- ---------------------------------------------------------------------------
create table public.owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  slug text not null unique,
  name text not null,
  city text not null,
  country text not null,
  country_code char(2) not null,
  since int,
  wallet text check (wallet ~ '^0x[0-9a-fA-F]{40}$'),
  verified boolean not null default false,
  response_time text,
  bio text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger owners_set_updated_at
  before update on public.owners
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- LODGINGS — the marketplace inventory. `photo_key`/`tone` map onto the
-- existing PhotoKey/ArtTone artwork system in apps/web/src/lib.
-- ---------------------------------------------------------------------------
create table public.lodgings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners (id) on delete cascade,
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('posada','cabana','departamento','casa','hostal','hotel-boutique')),
  city text not null,
  region text,
  country_code char(2) not null,
  code char(3),
  price_per_night numeric(12,2) not null check (price_per_night > 0),
  currency char(3) not null check (currency in ('ARS','BRL','CLP','COP','MXN','UYU')),
  blurb text,
  guests int not null default 2 check (guests > 0),
  bedrooms int,
  baths int,
  amenities text[] not null default '{}',
  featured boolean not null default false,
  photo_key text,
  tone text check (tone in ('terra','agua','sand','siete-colores')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lodgings_owner_idx on public.lodgings (owner_id);
create index lodgings_country_idx on public.lodgings (country_code);

create trigger lodgings_set_updated_at
  before update on public.lodgings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- BOOKINGS — a paid reservation settled by x402 in wFIAT, direct to the
-- Owner's wallet. Money fields are captured at quote time; `fx_fee` is the
-- platform's conversion commission, shown as its own line (ADR-0001) and null
-- for same-currency Bookings. Cancellation is Traveler-initiated only, full
-- refund until 7 days before check-in, 50% after (ADR-0004) — enforced in
-- app code, not here.
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers (id),
  lodging_id uuid not null references public.lodgings (id),
  check_in date not null,
  check_out date not null check (check_out > check_in),
  status text not null default 'pending'
    check (status in ('pending','settled','cancelled','refunded')),

  currency char(3) not null check (currency in ('ARS','BRL','CLP','COP','MXN','UYU')),
  subtotal numeric(14,2) not null,
  fx_fee numeric(14,2),
  total numeric(14,2) not null,
  quote jsonb,

  agent_wallet_id uuid references public.agent_wallets (id),
  pay_to text check (pay_to ~ '^0x[0-9a-fA-F]{40}$'),
  tx_hash text check (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  network text,

  cancelled_at timestamptz,
  refund_amount numeric(14,2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_traveler_idx on public.bookings (traveler_id);
create index bookings_lodging_idx on public.bookings (lodging_id);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- CREDIT LEDGER — Credits (monedas Nomai). Signed `amount`: positive for
-- purchases and free grants, negative for Agent spend. Balance = sum(amount)
-- per Traveler; grants are non-transferable and non-withdrawable (ADR-0002).
-- `stage` records which search stage spent the Credits.
-- ---------------------------------------------------------------------------
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers (id),
  amount numeric(12,2) not null check (amount <> 0),
  kind text not null check (kind in ('purchase','free_grant','spend','refund','adjustment')),
  stage text check (stage in ('conversation','cached_inventory','live_query')),
  booking_id uuid references public.bookings (id),
  reference text,
  meta jsonb not null default '{}',

  created_at timestamptz not null default now()
);

create index credit_ledger_traveler_idx on public.credit_ledger (traveler_id);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Marketplace reads (owners, lodgings) are public; everything personal is
-- scoped to auth.uid(). Writes that the platform performs — posting Credits,
-- settling Bookings — go through apps/api with the secret key, which bypasses
-- RLS, so no insert/update policies are needed for them.
-- ---------------------------------------------------------------------------
alter table public.travelers enable row level security;
alter table public.agent_wallets enable row level security;
alter table public.owners enable row level security;
alter table public.lodgings enable row level security;
alter table public.bookings enable row level security;
alter table public.credit_ledger enable row level security;

create policy travelers_select_own on public.travelers
  for select using (auth.uid() = id);
create policy travelers_insert_own on public.travelers
  for insert with check (auth.uid() = id);
create policy travelers_update_own on public.travelers
  for update using (auth.uid() = id);

create policy agent_wallets_select_own on public.agent_wallets
  for select using (auth.uid() = traveler_id);

create policy owners_public_read on public.owners
  for select using (true);
create policy owners_insert_own on public.owners
  for insert with check (auth.uid() = user_id);
create policy owners_update_own on public.owners
  for update using (auth.uid() = user_id);

create policy lodgings_public_read on public.lodgings
  for select using (true);
create policy lodgings_owner_insert on public.lodgings
  for insert with check (
    exists (select 1 from public.owners o
            where o.id = owner_id and o.user_id = auth.uid()));
create policy lodgings_owner_update on public.lodgings
  for update using (
    exists (select 1 from public.owners o
            where o.id = owner_id and o.user_id = auth.uid()));
create policy lodgings_owner_delete on public.lodgings
  for delete using (
    exists (select 1 from public.owners o
            where o.id = owner_id and o.user_id = auth.uid()));

create policy bookings_traveler_read on public.bookings
  for select using (auth.uid() = traveler_id);
create policy bookings_owner_read on public.bookings
  for select using (
    exists (select 1
            from public.lodgings l
            join public.owners o on o.id = l.owner_id
            where l.id = lodging_id and o.user_id = auth.uid()));

create policy credit_ledger_select_own on public.credit_ledger
  for select using (auth.uid() = traveler_id);
