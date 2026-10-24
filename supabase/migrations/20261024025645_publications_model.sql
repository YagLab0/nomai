-- Publications model — field-for-field mirror of apps/api/src/data/types.ts,
-- which mirrors the modelo-datos-publicaciones spec (see
-- docs/informe-mock-listings.md §6). Replaces the owners/lodgings sketch from
-- the init migration.
--
-- Conventions from the model:
--   * text PKs equal to the mock ids ("bus_palermo", "lst_…") — migration is a
--     straight row copy, no id remapping.
--   * Postgres enums for the closed sets (property_type, listing_status…).
--   * Money in minor units (bigint) — *_minor, never floats.
--   * slug (citext) is the public identifier agents quote; uuid stays internal.
--   * Availability is per NIGHT in the property's timezone.
--   * payout_address lives on business — the x402 payTo of every Booking.

create extension if not exists citext;

create type business_status as enum ('pending','active','suspended');
create type property_type as enum
  ('hotel','hostel','cabana','casa','apartamento','glamping','posada','finca','otro');
create type listing_kind as enum ('entire_place','room');
create type listing_status as enum ('draft','published','paused','archived');
create type unit_status as enum ('active','maintenance','inactive');
create type avail_status as enum ('open','blocked','booked');
create type amenity_category as enum
  ('general','cocina','bano','exterior','seguridad','accesibilidad','servicios');
create type booking_status as enum
  ('pending_payment','confirmed','cancelled','completed','refunded');

-- ---------------------------------------------------------------------------
-- Out with the sketch: credit_ledger references bookings, so release its FK
-- first, then drop in dependency order and rebuild bookings below.
-- ---------------------------------------------------------------------------
alter table public.credit_ledger drop constraint credit_ledger_booking_id_fkey;
drop table public.bookings;
drop table public.lodgings;
drop table public.owners;

-- ---------------------------------------------------------------------------
-- BUSINESSES — the Operator that owns Properties; payout_address is where
-- every Booking's x402 payment settles (ADR-0001: platform never holds funds).
-- `user_id` links to auth.users for the owner dashboard (platform addition,
-- not in the publications model).
-- ---------------------------------------------------------------------------
create table public.businesses (
  id text primary key,
  name text not null,
  slug citext not null unique,
  legal_name text,
  tax_id text,
  payout_address text check (payout_address ~ '^0x[0-9a-fA-F]{40}$'),
  email text,
  phone text,
  status business_status not null default 'pending',
  user_id uuid unique references auth.users (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- PROPERTIES — the physical place. Its timezone defines what a "night" means.
-- ---------------------------------------------------------------------------
create table public.properties (
  id text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  name text not null,
  property_type property_type not null,
  description text,
  address_line1 text,
  city text not null,
  region text,
  country_code char(2) not null,
  postal_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  timezone text not null,
  checkin_time text not null,
  checkout_time text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index properties_business_idx on public.properties (business_id);
create index properties_city_idx on public.properties (city, country_code);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- CANCELLATION_POLICIES — reusable per operator; business_id null means a
-- platform default. Replaces ADR-0004's single hard-coded rule.
-- ---------------------------------------------------------------------------
create table public.cancellation_policies (
  id text primary key,
  business_id text references public.businesses (id) on delete cascade,
  name text not null,
  full_refund_days int not null,
  partial_refund_pct int not null check (partial_refund_pct between 0 and 100),
  partial_refund_days int not null
);

-- ---------------------------------------------------------------------------
-- LISTINGS — the sellable publication. Only status='published' is visible to
-- agents/Travelers (enforced by RLS below).
-- ---------------------------------------------------------------------------
create table public.listings (
  id text primary key,
  property_id text not null references public.properties (id) on delete cascade,
  cancel_policy_id text references public.cancellation_policies (id) on delete set null,
  slug citext not null unique,
  title text not null,
  summary text,
  description text,
  kind listing_kind not null,
  max_guests int not null check (max_guests > 0),
  bedrooms int,
  beds int,
  bathrooms int,
  base_price_minor bigint not null check (base_price_minor > 0),
  currency text not null,
  cleaning_fee_minor bigint not null default 0,
  min_nights int not null default 1 check (min_nights > 0),
  max_nights int,
  rating numeric(2,1) check (rating between 0 and 5),
  reviews int not null default 0,
  instant_book boolean not null default false,
  pets_allowed boolean not null default false,
  smoking_allowed boolean not null default false,
  events_allowed boolean not null default false,
  status listing_status not null default 'draft',
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_property_idx on public.listings (property_id);
create index listings_status_idx on public.listings (status);

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- AMENITIES — canonical catalog; `code` is the filter key for search.
-- ---------------------------------------------------------------------------
create table public.amenities (
  id text primary key,
  code text not null unique,
  name text not null,
  category amenity_category not null
);

create table public.listing_amenities (
  listing_id text not null references public.listings (id) on delete cascade,
  amenity_id text not null references public.amenities (id) on delete cascade,
  detail text,
  primary key (listing_id, amenity_id)
);

-- ---------------------------------------------------------------------------
-- LISTING_PHOTOS / LISTING_UNITS / RATE_RULES / AVAILABILITY_NIGHTS
-- ---------------------------------------------------------------------------
create table public.listing_photos (
  id text primary key,
  listing_id text not null references public.listings (id) on delete cascade,
  url text not null,
  alt_text text,
  position int not null default 0,
  is_cover boolean not null default false
);

create index listing_photos_listing_idx on public.listing_photos (listing_id);

create table public.listing_units (
  id text primary key,
  listing_id text not null references public.listings (id) on delete cascade,
  code text not null,
  status unit_status not null default 'active',
  unique (listing_id, code)
);

create table public.rate_rules (
  id text primary key,
  listing_id text not null references public.listings (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  nightly_price_minor bigint not null check (nightly_price_minor > 0),
  min_nights int,
  priority int not null default 0
);

create index rate_rules_listing_idx on public.rate_rules (listing_id);

-- One row per listing per night (in the property's timezone). price_minor
-- null → resolve via rate_rule → base_price.
create table public.availability_nights (
  listing_id text not null references public.listings (id) on delete cascade,
  night date not null,
  status avail_status not null default 'open',
  units_available int not null default 1 check (units_available >= 0),
  price_minor bigint,
  primary key (listing_id, night)
);

create index availability_night_idx on public.availability_nights (night, status);

-- ---------------------------------------------------------------------------
-- BOOKINGS — the paid reservation. Mock shape plus two platform columns:
-- `traveler_id` ties the Booking to the Traveler (RLS + dashboard), and
-- `currency` snapshots the listing's so total_minor stays interpretable.
-- Settlement lives in `payments`, not here.
-- ---------------------------------------------------------------------------
create table public.bookings (
  id text primary key,
  listing_id text not null references public.listings (id),
  traveler_id uuid references public.travelers (id),
  guest_ref text,
  checkin date not null,
  checkout date not null check (checkout > checkin),
  guests int not null check (guests > 0),
  total_minor bigint not null,
  currency text not null,
  status booking_status not null default 'pending_payment',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_listing_idx on public.bookings (listing_id);
create index bookings_traveler_idx on public.bookings (traveler_id);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

alter table public.credit_ledger alter column booking_id type text;
alter table public.credit_ledger
  add constraint credit_ledger_booking_id_fkey
  foreign key (booking_id) references public.bookings (id);

-- ---------------------------------------------------------------------------
-- PAYMENTS — the x402 settlement receipt (per the model's `payment` entity):
-- payer = the Traveler's Agent wallet, pay_to = business.payout_address.
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings (id) on delete cascade,
  payer text check (payer ~ '^0x[0-9a-fA-F]{40}$'),
  pay_to text not null check (pay_to ~ '^0x[0-9a-fA-F]{40}$'),
  amount_minor bigint not null,
  asset text not null,
  network text not null,
  tx_hash text check (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  facilitator_ref text,
  created_at timestamptz not null default now()
);

create index payments_booking_idx on public.payments (booking_id);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Inventory is public; listings are public only when published (the model's
-- own rule). Value writes — bookings, payments, availability flips — go
-- through apps/api with the secret key, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.properties enable row level security;
alter table public.cancellation_policies enable row level security;
alter table public.listings enable row level security;
alter table public.amenities enable row level security;
alter table public.listing_amenities enable row level security;
alter table public.listing_photos enable row level security;
alter table public.listing_units enable row level security;
alter table public.rate_rules enable row level security;
alter table public.availability_nights enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;

-- helper: is the current user the owner of a business?
create or replace function public.owns_business(p_business_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.user_id = auth.uid());
$$;

-- helper: is the current user the owner of the business behind a listing?
create or replace function public.owns_listing(p_listing_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.listings l
    join public.properties p on p.id = l.property_id
    join public.businesses b on b.id = p.business_id
    where l.id = p_listing_id and b.user_id = auth.uid());
$$;

create policy businesses_public_read on public.businesses
  for select using (true);
create policy businesses_owner_update on public.businesses
  for update using (auth.uid() = user_id);
create policy businesses_owner_insert on public.businesses
  for insert with check (auth.uid() = user_id);

create policy properties_public_read on public.properties
  for select using (true);
create policy properties_owner_write on public.properties
  for all using (owns_business(business_id))
  with check (owns_business(business_id));

create policy cancellation_policies_public_read on public.cancellation_policies
  for select using (true);

create policy listings_public_read on public.listings
  for select using (status = 'published' or owns_listing(id));
create policy listings_owner_write on public.listings
  for all using (
    exists (select 1 from public.properties p
            where p.id = property_id and owns_business(p.business_id)))
  with check (
    exists (select 1 from public.properties p
            where p.id = property_id and owns_business(p.business_id)));

create policy amenities_public_read on public.amenities
  for select using (true);
create policy listing_amenities_public_read on public.listing_amenities
  for select using (true);
create policy listing_photos_public_read on public.listing_photos
  for select using (true);
create policy listing_units_public_read on public.listing_units
  for select using (true);
create policy rate_rules_public_read on public.rate_rules
  for select using (true);
create policy availability_nights_public_read on public.availability_nights
  for select using (true);

create policy bookings_traveler_read on public.bookings
  for select using (auth.uid() = traveler_id);
create policy bookings_owner_read on public.bookings
  for select using (owns_listing(listing_id));

create policy payments_traveler_read on public.payments
  for select using (
    exists (select 1 from public.bookings bk
            where bk.id = booking_id and bk.traveler_id = auth.uid()));
create policy payments_owner_read on public.payments
  for select using (
    exists (select 1 from public.bookings bk
            where bk.id = booking_id and owns_listing(bk.listing_id)));
