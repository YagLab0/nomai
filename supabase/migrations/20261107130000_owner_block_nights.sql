-- Owner night blocking: the dashboard's calendar closes nights without a
-- Booking — maintenance, a private stay, or a channel that isn't nomai.
-- Until now availability_nights only moved through the booking RPCs (a
-- blocked night never existed), so an Owner had no way to take a night out of
-- Availability (GLOSSARY).
--
--   * block_nights(p_user_id, p_listing_id, p_nights): open → blocked. A night
--     with no row is inserted 'blocked' (create_lodging seeds the whole
--     365-night window as open, so this is the exception). A booked night is
--     reserved by a Booking and never touched — it comes back in `skipped`.
--     Nights already blocked are idempotent and come back in `unchanged`.
--   * unblock_nights(p_user_id, p_listing_id, p_nights): blocked → open.
--     booked nights stay booked (again `skipped`); open nights are `unchanged`.
--
-- Both are security-definer RPCs with the same contract and lockdown as
-- set_lodging_status (20261027140000): {ok, ...} or {ok:false,
-- error:{code,message}}; EXECUTE is service_role only. The api verifies the
-- session first and passes p_user_id; the Owner is resolved from
-- businesses.user_id = p_user_id, never from a business or listing id the
-- client sends. Past nights and empty or oversized arrays (cap 366) are
-- rejected: the calendar starts today and the api caps one request at 366.

begin;

create or replace function public.block_nights(
  p_user_id uuid,
  p_listing_id text,
  p_nights date[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id text;
  v_business_id text;
  v_nights date[];
  v_night date;
  v_status avail_status;
  v_rows int;
  v_blocked text[] := '{}';
  v_skipped text[] := '{}';
  v_unchanged text[] := '{}';
begin
  -- Duplicates collapse; the order stays deterministic for the response.
  select coalesce(array_agg(distinct n order by n), '{}'::date[])
    into v_nights
  from unnest(p_nights) as n;

  if cardinality(v_nights) = 0 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'nights must not be empty'));
  end if;
  if cardinality(v_nights) > 366 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'at most 366 nights per request'));
  end if;
  if exists (select 1 from unnest(v_nights) as n where n < current_date) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'past nights cannot be blocked'));
  end if;

  select l.id, p.business_id into v_listing_id, v_business_id
  from listings l
  join properties p on p.id = l.property_id
  where l.id = p_listing_id or l.slug = p_listing_id;
  if v_listing_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'listing not found'));
  end if;
  -- Ownership through the verified session user (service_role has no
  -- auth.uid(), so owns_listing() can't be used here).
  if p_user_id is null or not exists (
    select 1 from businesses bz
    where bz.id = v_business_id and bz.user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'not the owner of this listing'));
  end if;

  foreach v_night in array v_nights loop
    -- A booked night belongs to a Booking: never move it.
    if exists (
      select 1 from availability_nights av
      where av.listing_id = v_listing_id
        and av.night = v_night
        and av.status = 'booked') then
      v_skipped := array_append(v_skipped, v_night::text);
      continue;
    end if;

    select av.status into v_status
    from availability_nights av
    where av.listing_id = v_listing_id and av.night = v_night;

    if v_status = 'blocked' then
      v_unchanged := array_append(v_unchanged, v_night::text);
      continue;
    end if;

    -- The WHERE keeps a night that raced into 'booked' untouched.
    insert into availability_nights (listing_id, night, status, units_available)
    values (v_listing_id, v_night, 'blocked', 1)
    on conflict (listing_id, night) do update
      set status = 'blocked'
      where availability_nights.status = 'open';
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      v_skipped := array_append(v_skipped, v_night::text);
    else
      v_blocked := array_append(v_blocked, v_night::text);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'listing_id', v_listing_id,
    'blocked', to_jsonb(v_blocked),
    'skipped', to_jsonb(v_skipped),
    'unchanged', to_jsonb(v_unchanged));
end;
$$;

create or replace function public.unblock_nights(
  p_user_id uuid,
  p_listing_id text,
  p_nights date[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id text;
  v_business_id text;
  v_nights date[];
  v_night date;
  v_status avail_status;
  v_rows int;
  v_unblocked text[] := '{}';
  v_skipped text[] := '{}';
  v_unchanged text[] := '{}';
begin
  select coalesce(array_agg(distinct n order by n), '{}'::date[])
    into v_nights
  from unnest(p_nights) as n;

  if cardinality(v_nights) = 0 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'nights must not be empty'));
  end if;
  if cardinality(v_nights) > 366 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'at most 366 nights per request'));
  end if;
  if exists (select 1 from unnest(v_nights) as n where n < current_date) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'past nights cannot be unblocked'));
  end if;

  select l.id, p.business_id into v_listing_id, v_business_id
  from listings l
  join properties p on p.id = l.property_id
  where l.id = p_listing_id or l.slug = p_listing_id;
  if v_listing_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'listing not found'));
  end if;
  if p_user_id is null or not exists (
    select 1 from businesses bz
    where bz.id = v_business_id and bz.user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'not the owner of this listing'));
  end if;

  foreach v_night in array v_nights loop
    -- A booked night is reserved by a Booking: unblocking it would resell it.
    if exists (
      select 1 from availability_nights av
      where av.listing_id = v_listing_id
        and av.night = v_night
        and av.status = 'booked') then
      v_skipped := array_append(v_skipped, v_night::text);
      continue;
    end if;

    select av.status into v_status
    from availability_nights av
    where av.listing_id = v_listing_id and av.night = v_night;

    if v_status is null or v_status = 'open' then
      v_unchanged := array_append(v_unchanged, v_night::text);
      continue;
    end if;

    update availability_nights
      set status = 'open'
      where listing_id = v_listing_id
        and night = v_night
        and status = 'blocked';
    get diagnostics v_rows = row_count;

    if v_rows = 0 then
      v_skipped := array_append(v_skipped, v_night::text);
    else
      v_unblocked := array_append(v_unblocked, v_night::text);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'listing_id', v_listing_id,
    'unblocked', to_jsonb(v_unblocked),
    'skipped', to_jsonb(v_skipped),
    'unchanged', to_jsonb(v_unchanged));
end;
$$;

-- service_role only, like every other RPC: they trust p_user_id, which only
-- the server (after auth.getUser) may supply.
revoke execute on function public.block_nights(uuid, text, date[])
  from public, anon, authenticated;
grant execute on function public.block_nights(uuid, text, date[])
  to service_role;

revoke execute on function public.unblock_nights(uuid, text, date[])
  from public, anon, authenticated;
grant execute on function public.unblock_nights(uuid, text, date[])
  to service_role;

commit;
