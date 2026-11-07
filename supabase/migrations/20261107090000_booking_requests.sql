-- Booking requests (ADR-0010) — drafts an external agent creates over MCP.
-- The Agent proposes, the Traveler disposes: a request holds NO inventory,
-- moves NO money, and only becomes a Booking when the Traveler confirms and
-- pays in the app (normal x402 flow). The Owner sees nothing until then.

create table public.booking_requests (
  id text primary key default ('brq_' || encode(gen_random_bytes(12), 'hex')),
  traveler_id uuid not null references public.travelers (id) on delete cascade,
  listing_id text not null references public.listings (id) on delete cascade,
  checkin date not null,
  checkout date not null check (checkout > checkin),
  guests int not null check (guests > 0),
  -- Frozen quote snapshot at request time (totals, currency, service fee).
  -- Reference only: confirmation re-quotes server-side.
  quote jsonb not null default '{}'::jsonb,
  total_minor bigint not null check (total_minor >= 0),
  currency text not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'expired', 'stale')),
  booking_id text references public.bookings (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now()
);

create index booking_requests_traveler_idx
  on public.booking_requests (traveler_id, created_at desc);
create index booking_requests_listing_idx
  on public.booking_requests (listing_id);

alter table public.booking_requests enable row level security;

-- Traveler-scoped: own rows only. Writes still go through apps/api
-- (service_role) like every other write surface — RLS is the backstop.
create policy booking_requests_party_rw on public.booking_requests
  for all using (traveler_id = auth.uid());

-- RPCs — security definer, locked to service_role like the escrow/review RPCs.

create or replace function public.create_booking_request(
  p_traveler_id uuid,
  p_listing_id text,
  p_checkin date,
  p_checkout date,
  p_guests int,
  p_quote jsonb,
  p_total_minor bigint,
  p_currency text
) returns public.booking_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.booking_requests%rowtype;
begin
  if p_checkout <= p_checkin then
    raise exception 'checkout must be after checkin' using errcode = '22000';
  end if;
  if p_guests < 1 then
    raise exception 'guests must be positive' using errcode = '22000';
  end if;
  insert into public.booking_requests
    (traveler_id, listing_id, checkin, checkout, guests, quote, total_minor, currency)
  values
    (p_traveler_id, p_listing_id, p_checkin, p_checkout, p_guests,
     coalesce(p_quote, '{}'::jsonb), p_total_minor, p_currency)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.list_booking_requests(p_traveler_id uuid)
returns setof public.booking_requests
language sql security definer set search_path = public as $$
  -- Expiry is marked lazily on read: a row past expires_at never answers pending.
  update public.booking_requests
     set status = 'expired'
   where traveler_id = p_traveler_id
     and status = 'pending'
     and expires_at < now();
  select *
    from public.booking_requests
   where traveler_id = p_traveler_id
   order by created_at desc;
$$;

create or replace function public.cancel_booking_request(
  p_traveler_id uuid,
  p_request_id text
) returns public.booking_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.booking_requests%rowtype;
begin
  select * into v_row from public.booking_requests
   where id = p_request_id and traveler_id = p_traveler_id;
  if not found then
    raise exception 'booking request not found' using errcode = 'P0002';
  end if;
  if v_row.status != 'pending' then
    raise exception 'booking request is not pending' using errcode = 'P0001';
  end if;
  update public.booking_requests set status = 'cancelled'
   where id = p_request_id returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.convert_booking_request(
  p_traveler_id uuid,
  p_request_id text,
  p_booking_id text
) returns public.booking_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.booking_requests%rowtype;
begin
  select * into v_row from public.booking_requests
   where id = p_request_id and traveler_id = p_traveler_id;
  if not found then
    raise exception 'booking request not found' using errcode = 'P0002';
  end if;
  if v_row.status != 'pending' then
    raise exception 'booking request is not pending' using errcode = 'P0001';
  end if;
  update public.booking_requests
     set status = 'confirmed', booking_id = p_booking_id
   where id = p_request_id returning * into v_row;
  return v_row;
end;
$$;

revoke all on function
  public.create_booking_request(uuid, text, date, date, int, jsonb, bigint, text),
  public.list_booking_requests(uuid),
  public.cancel_booking_request(uuid, text),
  public.convert_booking_request(uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.create_booking_request(uuid, text, date, date, int, jsonb, bigint, text),
  public.list_booking_requests(uuid),
  public.cancel_booking_request(uuid, text),
  public.convert_booking_request(uuid, text, text)
  to service_role;
