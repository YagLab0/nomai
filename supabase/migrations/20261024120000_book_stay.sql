-- book_stay — the Booking write path (GitHub issue #13).
--
-- The api's `bookListing` calls this via rpc() and it does in ONE transaction
-- what the in-memory repo did in JS:
--   1. revalidates the stay (min_nights / max_nights / max_guests / rate-rule
--      minimum stays / every night `open` with units_available > 0),
--   2. resolves the nightly price (availability.price_minor → rate_rule by
--      highest priority → base_price_minor),
--   3. inserts the booking (status 'confirmed', total_minor + currency from
--      the recomputed quote — never from the caller),
--   4. decrements units_available per night, marking `booked` where it hits 0.
--
-- Race safety: the nights of the range are locked `for update` in date order
-- before validation, so two concurrent calls for the same unit serialize —
-- the loser revalidates against committed rows and fails with `unavailable`.
--
-- Returns jsonb mirroring the api's BookResult: {ok:true, booking, quote} or
-- {ok:false, error:{code,message}} with the same DomainError codes the mock
-- emits (`invalid_dates` / `min_nights` / `max_nights` / `max_guests` /
-- `unavailable` / `not_found`). *_display strings stay in the api layer
-- (formatMoney) — the function returns raw minor units.

create or replace function public.book_stay(
  p_listing_slug text,
  p_checkin text,
  p_checkout text,
  p_guests integer,
  p_guest_ref text default null,
  p_traveler_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing listings%rowtype;
  v_checkin date;
  v_checkout date;
  v_len int;
  v_rule_min int;
  v_locked jsonb := '{}'::jsonb;
  v_cell jsonb;
  v_night_row record;
  v_day date;
  v_price bigint;
  v_source text;
  v_quote_nights jsonb := '[]'::jsonb;
  v_nights_minor bigint := 0;
  v_total_minor bigint;
  v_booking_id text;
  v_created_at timestamptz;
begin
  -- Same failure order as repo.ts: not_found → invalid_dates → stay rules →
  -- availability, so error codes (and therefore HTTP statuses) are identical.
  select * into v_listing
  from listings
  where slug = p_listing_slug and status = 'published';
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'listing not found'));
  end if;

  if p_checkin !~ '^\d{4}-\d{2}-\d{2}$'
     or p_checkout !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid_dates',
      'message', 'checkin/checkout must be YYYY-MM-DD'));
  end if;
  begin
    v_checkin := p_checkin::date;
    v_checkout := p_checkout::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid_dates',
      'message', 'checkout must be after checkin'));
  end;
  if v_checkout <= v_checkin then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid_dates',
      'message', 'checkout must be after checkin'));
  end if;
  v_len := v_checkout - v_checkin;

  if v_len < v_listing.min_nights then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'min_nights',
      'message', format('this listing requires at least %s nights',
                        v_listing.min_nights)));
  end if;
  if v_listing.max_nights is not null and v_len > v_listing.max_nights then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'max_nights',
      'message', format('this listing allows at most %s nights',
                        v_listing.max_nights)));
  end if;
  if p_guests < 1 or p_guests > v_listing.max_guests then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'max_guests',
      'message', format('this listing hosts at most %s guests',
                        v_listing.max_guests)));
  end if;

  -- Rate rules may impose their own minimum stay (same overlap test as the
  -- mock: rule.start_date < checkout and checkin <= rule.end_date).
  select coalesce(max(min_nights), 0) into v_rule_min
  from rate_rules
  where listing_id = v_listing.id
    and min_nights is not null
    and start_date < v_checkout
    and v_checkin <= end_date;
  if v_rule_min > v_len then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'min_nights',
      'message', format('season pricing requires at least %s nights for these dates',
                        v_rule_min)));
  end if;

  -- Lock every night in the range (deterministic order ⇒ no deadlocks
  -- between two book_stay calls) before validating availability.
  for v_night_row in
    select night, status, units_available, price_minor
    from availability_nights
    where listing_id = v_listing.id
      and night >= v_checkin
      and night < v_checkout
    order by night
    for update
  loop
    v_locked := v_locked || jsonb_build_object(
      v_night_row.night::text, to_jsonb(v_night_row));
  end loop;

  for i in 0 .. v_len - 1 loop
    v_day := v_checkin + i;
    v_cell := v_locked -> (v_day::text);
    if v_cell is null
       or (v_cell ->> 'status') <> 'open'
       or (v_cell ->> 'units_available')::int < 1 then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'unavailable',
        'message', format('no availability on %s', v_day)));
    end if;

    v_price := (v_cell ->> 'price_minor')::bigint;
    if v_price is not null then
      v_source := 'availability';
    else
      select nightly_price_minor into v_price
      from rate_rules
      where listing_id = v_listing.id
        and start_date <= v_day
        and v_day <= end_date
      order by priority desc
      limit 1;
      if found then
        v_source := 'rate_rule';
      else
        v_price := v_listing.base_price_minor;
        v_source := 'base';
      end if;
    end if;

    v_quote_nights := v_quote_nights || jsonb_build_object(
      'night', v_day, 'price_minor', v_price, 'source', v_source);
    v_nights_minor := v_nights_minor + v_price;
  end loop;

  v_total_minor := v_nights_minor + v_listing.cleaning_fee_minor;

  -- Consume one unit per night; a night that hits zero flips to `booked`.
  update availability_nights
  set units_available = units_available - 1,
      status = case
        when units_available - 1 <= 0 then 'booked'::avail_status
        else status
      end
  where listing_id = v_listing.id
    and night >= v_checkin
    and night < v_checkout;

  v_booking_id := 'bkg_' || replace(gen_random_uuid()::text, '-', '');
  insert into bookings (
    id, listing_id, traveler_id, guest_ref,
    checkin, checkout, guests, total_minor, currency, status
  ) values (
    v_booking_id, v_listing.id, p_traveler_id, p_guest_ref,
    v_checkin, v_checkout, p_guests, v_total_minor, v_listing.currency,
    'confirmed'
  )
  returning created_at into v_created_at;

  return jsonb_build_object(
    'ok', true,
    'booking', jsonb_build_object(
      'id', v_booking_id,
      'listing_id', v_listing.id,
      'guest_ref', p_guest_ref,
      'checkin', v_checkin,
      'checkout', v_checkout,
      'guests', p_guests,
      'total_minor', v_total_minor,
      'status', 'confirmed',
      'created_at', v_created_at),
    'quote', jsonb_build_object(
      'listing_slug', v_listing.slug,
      'checkin', v_checkin,
      'checkout', v_checkout,
      'guests', p_guests,
      'nights_count', v_len,
      'nights', v_quote_nights,
      'nights_minor', v_nights_minor,
      'cleaning_minor', v_listing.cleaning_fee_minor,
      'total_minor', v_total_minor,
      'currency', v_listing.currency));
end;
$$;
