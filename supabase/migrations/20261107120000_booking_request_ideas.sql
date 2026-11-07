-- Booking requests v2 (ADR-0010, two-stage drafts): a request can start as
-- an "idea" — only the place is required — and become "pending" (ready to
-- pay) once dates/guests complete and a fresh quote freezes. Origin tracks
-- where the draft was born so the UI can badge it.

alter table public.booking_requests
  alter column checkin drop not null,
  alter column checkout drop not null,
  alter column guests drop not null,
  alter column quote drop not null,
  alter column total_minor drop not null,
  alter column currency drop not null,
  add column origin text not null default 'mcp'
    check (origin in ('mcp', 'app', 'agent'));

alter table public.booking_requests
  drop constraint booking_requests_status_check;
alter table public.booking_requests
  add constraint booking_requests_status_check
  check (status in ('idea', 'pending', 'confirmed', 'cancelled', 'expired', 'stale'));

-- A pending row must carry the full stay + frozen totals; an idea carries
-- only the place.
alter table public.booking_requests
  add constraint booking_requests_pending_complete
  check (
    status != 'pending' or (
      checkin is not null and checkout is not null and guests is not null
      and total_minor is not null and currency is not null
    )
  );

create or replace function public.create_booking_request(
  p_traveler_id uuid,
  p_listing_id text,
  p_origin text default 'mcp',
  p_checkin date default null,
  p_checkout date default null,
  p_guests int default null,
  p_quote jsonb default null,
  p_total_minor bigint default null,
  p_currency text default null
) returns public.booking_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.booking_requests%rowtype;
begin
  if p_origin not in ('mcp', 'app', 'agent') then
    raise exception 'unknown origin' using errcode = '22000';
  end if;
  if p_checkin is not null then
    if p_checkout is null or p_checkout <= p_checkin then
      raise exception 'checkout must be after checkin' using errcode = '22000';
    end if;
    if p_guests is null or p_guests < 1 then
      raise exception 'guests must be positive' using errcode = '22000';
    end if;
    if p_total_minor is null or p_currency is null then
      raise exception 'a dated request needs frozen totals' using errcode = '22000';
    end if;
  end if;
  insert into public.booking_requests
    (traveler_id, listing_id, origin, checkin, checkout, guests, quote,
     total_minor, currency, status)
  values
    (p_traveler_id, p_listing_id, p_origin, p_checkin, p_checkout, p_guests,
     coalesce(p_quote, '{}'::jsonb), p_total_minor, p_currency,
     case when p_checkin is null then 'idea' else 'pending' end)
  returning * into v_row;
  return v_row;
end;
$$;

-- Complete an idea: freeze the fresh server-side quote and flip to pending
-- with a new 48 h expiry. Only ideas can complete; pending rows are already
-- priced (re-quote instead by cancelling + recreating).
create or replace function public.complete_booking_request(
  p_traveler_id uuid,
  p_request_id text,
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
  select * into v_row from public.booking_requests
   where id = p_request_id and traveler_id = p_traveler_id;
  if not found then
    raise exception 'booking request not found' using errcode = 'P0002';
  end if;
  if v_row.status != 'idea' then
    raise exception 'only ideas can be completed' using errcode = 'P0001';
  end if;
  if p_checkout <= p_checkin then
    raise exception 'checkout must be after checkin' using errcode = '22000';
  end if;
  if p_guests < 1 then
    raise exception 'guests must be positive' using errcode = '22000';
  end if;
  update public.booking_requests
     set checkin = p_checkin,
         checkout = p_checkout,
         guests = p_guests,
         quote = coalesce(p_quote, '{}'::jsonb),
         total_minor = p_total_minor,
         currency = p_currency,
         status = 'pending',
         expires_at = now() + interval '48 hours'
   where id = p_request_id returning * into v_row;
  return v_row;
end;
$$;

revoke all on function
  public.create_booking_request(uuid, text, text, date, date, int, jsonb, bigint, text),
  public.complete_booking_request(uuid, text, date, date, int, jsonb, bigint, text)
  from public, anon, authenticated;
grant execute on function
  public.create_booking_request(uuid, text, text, date, date, int, jsonb, bigint, text),
  public.complete_booking_request(uuid, text, date, date, int, jsonb, bigint, text)
  to service_role;
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
  if v_row.status not in ('idea', 'pending') then
    raise exception 'only ideas and pending requests can be cancelled' using errcode = 'P0001';
  end if;
  update public.booking_requests set status = 'cancelled'
   where id = p_request_id returning * into v_row;
  return v_row;
end;
$$;
