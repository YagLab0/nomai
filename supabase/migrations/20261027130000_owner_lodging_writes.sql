-- Owner Lodging writes: makes the Owner's wizard persistent (issue: alta de
-- alojamientos → Supabase). Until now the wizard kept everything in the
-- browser's localStorage.
--
--   * storage bucket `listing-photos`: public read; writes only through the
--     server with the secret key (same "writes are api-only" rule as the
--     publication satellites).
--   * ensure_amenity(label): resolves a free-text "Servicios" line to an
--     amenities row — by code, then by name, else creates it ('servicios'),
--     the same way the web-catalog migration added codes for Spanish labels.
--   * create_lodging / update_lodging / archive_lodging: security-definer
--     RPCs so the whole write (properties + listings + listing_photos +
--     listing_amenities + availability_nights) lands in ONE transaction.
--     Same lockdown as every other RPC (20261024150000, 20261026120000,
--     20261027120000): EXECUTE is service_role only. The web route verifies
--     the session (auth.getUser) and passes p_user_id; the Owner is resolved
--     from businesses.user_id = p_user_id, never from a business or listing
--     id the client sends.
--   * listings.currency is an FK to currencies (20261026120000): the RPCs
--     reject unknown codes with a readable error instead of an FK violation.
--
-- Upcoming Booking (GLOSSARY): a Booking that is confirmed or in progress —
-- here 'pending_payment' (nights already held) and 'claim_open' (mid-stay
-- dispute) also count — blocks relocating and removing the Lodging.
-- Removal is a soft delete to 'archived' so historical Booking FKs survive.

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

create policy listing_photos_public_read on storage.objects
  for select using (bucket_id = 'listing-photos');

-- ---------------------------------------------------------------------------
-- ensure_amenity — free-text label → amenities.id. Code is the slugified
-- label (Spanish accents folded); unknown labels become new 'servicios'
-- rows so nothing the Owner types is dropped.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_amenity(p_label text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := btrim(p_label);
  v_code text;
  v_id text;
begin
  if v_label = '' then
    return null;
  end if;
  v_code := lower(translate(v_label, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'));
  v_code := regexp_replace(v_code, '[^a-z0-9]+', '_', 'g');
  v_code := btrim(v_code, '_');
  v_code := left(v_code, 40);
  if v_code = '' then
    return null;
  end if;

  select a.id into v_id from amenities a where a.code = v_code;
  if v_id is null then
    select a.id into v_id from amenities a where lower(a.name) = lower(v_label);
  end if;
  if v_id is null then
    v_id := 'amn_' || v_code;
    if exists (select 1 from amenities where id = v_id) then
      v_id := 'amn_' || v_code || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    end if;
    insert into amenities (id, code, name, category)
    values (v_id, v_code, left(v_label, 80), 'servicios')
    on conflict (code) do nothing
    returning id into v_id;
    if v_id is null then
      select a.id into v_id from amenities a where a.code = v_code;
    end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.ensure_amenity(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_lodging — the wizard's "Publicar". One transaction: property +
-- published listing + photos (first is the cover) + amenities + the next
-- 365 nights 'open' (book_stay needs a row per night; missing = unbookable).
-- Returns {ok, listing_id, property_id, slug} or {ok:false, error:{code…}}.
-- ---------------------------------------------------------------------------
create or replace function public.create_lodging(
  p_user_id uuid,
  p_name text,
  p_property_type property_type,
  p_city text,
  p_region text,
  p_country_code text,
  p_timezone text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_guests integer,
  p_bedrooms integer,
  p_bathrooms integer,
  p_base_price_minor bigint,
  p_currency text,
  p_blurb text default '',
  p_photos jsonb default '[]'::jsonb,
  p_amenities jsonb default '[]'::jsonb,
  p_listing_id text default null,
  p_property_id text default null,
  p_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_suffix text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_listing_id text;
  v_property_id text;
  v_slug text;
  v_today date;
  v_i int;
  v_photo jsonb;
  v_label text;
  v_amenity_id text;
  v_amenity_name text;
begin
  -- The Owner is the business tied to the verified session user — never a
  -- client-sent business id.
  select * into v_business from businesses where user_id = p_user_id;
  if p_user_id is null or not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'no business linked to this account'));
  end if;

  if char_length(btrim(p_name)) < 3 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'name is required'));
  end if;
  if btrim(p_city) = '' or btrim(p_country_code) = '' or btrim(p_address) = '' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'town, country and address are required'));
  end if;
  if p_guests < 1 or p_bedrooms < 0 or p_bathrooms < 1 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'rooms out of range'));
  end if;
  if p_base_price_minor is null or p_base_price_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'price must be positive'));
  end if;
  if p_latitude is null or p_longitude is null
     or abs(p_latitude) > 90 or abs(p_longitude) > 180 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'pin is required'));
  end if;
  if not exists (select 1 from currencies c where c.code = upper(p_currency)) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', format('unknown currency %s', p_currency)));
  end if;

  v_listing_id := coalesce(p_listing_id, 'lst_' || v_suffix);
  v_property_id := coalesce(p_property_id, 'prp_' || v_suffix);
  v_slug := coalesce(
    nullif(p_slug, ''),
    btrim(regexp_replace(
      lower(translate(p_name, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
      '[^a-z0-9]+', '-', 'g'), '-') || '-' || v_suffix);

  insert into properties (
    id, business_id, name, property_type, description,
    address_line1, city, region, country_code, latitude, longitude, timezone,
    checkin_time, checkout_time
  ) values (
    v_property_id, v_business.id, btrim(p_name), p_property_type,
    nullif(btrim(p_blurb), ''), btrim(p_address), btrim(p_city),
    nullif(btrim(p_region), ''), upper(p_country_code), p_latitude, p_longitude,
    p_timezone, '14:00', '11:00'
  );

  insert into listings (
    id, property_id, slug, title, summary, description, kind,
    max_guests, bedrooms, bathrooms, base_price_minor, currency,
    status, published_at, min_nights
  ) values (
    v_listing_id, v_property_id, v_slug, btrim(p_name),
    nullif(btrim(p_blurb), ''), nullif(btrim(p_blurb), ''), 'entire_place',
    p_guests, p_bedrooms, p_bathrooms, p_base_price_minor, upper(p_currency),
    'published', now(), 1
  );

  for v_i in 0 .. jsonb_array_length(p_photos) - 1 loop
    v_photo := p_photos -> v_i;
    insert into listing_photos (id, listing_id, url, alt_text, position, is_cover)
    values (
      'pho_' || v_suffix || '_' || v_i,
      v_listing_id,
      v_photo ->> 'url',
      coalesce(v_photo ->> 'alt_text', 'Foto de ' || btrim(p_name)),
      v_i,
      v_i = 0);
  end loop;

  for v_i in 0 .. jsonb_array_length(p_amenities) - 1 loop
    v_label := btrim(coalesce(p_amenities -> v_i ->> 'label', p_amenities ->> v_i));
    v_amenity_id := public.ensure_amenity(v_label);
    if v_amenity_id is not null then
      select a.name into v_amenity_name from amenities a where a.id = v_amenity_id;
      -- `detail` keeps the Owner's own wording when it isn't the canonical name.
      insert into listing_amenities (listing_id, amenity_id, detail)
      values (
        v_listing_id,
        v_amenity_id,
        case when lower(v_amenity_name) <> lower(v_label) then v_label end)
      on conflict (listing_id, amenity_id) do nothing;
    end if;
  end loop;

  v_today := (now() at time zone p_timezone)::date;
  insert into availability_nights (listing_id, night, status, units_available)
  select v_listing_id, v_today + d, 'open', 1
  from generate_series(0, 364) as d
  on conflict (listing_id, night) do nothing;

  return jsonb_build_object(
    'ok', true,
    'listing_id', v_listing_id,
    'property_id', v_property_id,
    'slug', v_slug);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_lodging — the wizard's "Guardar cambios". p_listing_id accepts the
-- listing id or its slug. A Lodging with an Upcoming Booking can't be
-- relocated (town / address / pin / country); everything else always edits.
-- Photos and amenities replace the whole set (the wizard sends the draft).
-- Missing availability nights inside the window are topped up — booked and
-- blocked nights are never touched.
-- ---------------------------------------------------------------------------
create or replace function public.update_lodging(
  p_user_id uuid,
  p_listing_id text,
  p_name text,
  p_property_type property_type,
  p_city text,
  p_region text,
  p_country_code text,
  p_timezone text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_guests integer,
  p_bedrooms integer,
  p_bathrooms integer,
  p_base_price_minor bigint,
  p_currency text,
  p_blurb text default '',
  p_photos jsonb default '[]'::jsonb,
  p_amenities jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing listings%rowtype;
  v_property properties%rowtype;
  v_upcoming boolean;
  v_relocating boolean;
  v_today date;
  v_i int;
  v_photo jsonb;
  v_label text;
  v_amenity_id text;
  v_amenity_name text;
begin
  select l.* into v_listing
  from listings l
  where l.id = p_listing_id or l.slug = p_listing_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'listing not found'));
  end if;
  select * into v_property from properties where id = v_listing.property_id;
  -- Ownership through the verified session user (service_role has no
  -- auth.uid(), so owns_listing() can't be used here).
  if p_user_id is null or not exists (
    select 1 from businesses bz
    where bz.id = v_property.business_id and bz.user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'not the owner of this listing'));
  end if;

  -- Same payload rules as create_lodging, checked before the relocation
  -- verdict so a malformed draft answers 'invalid', not 'has_upcoming_…'.
  if btrim(p_city) = '' or btrim(p_country_code) = '' or btrim(p_address) = '' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'town, country and address are required'));
  end if;
  if p_latitude is null or p_longitude is null
     or abs(p_latitude) > 90 or abs(p_longitude) > 180 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'pin is required'));
  end if;
  if not exists (select 1 from currencies c where c.code = upper(p_currency)) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', format('unknown currency %s', p_currency)));
  end if;

  v_upcoming := exists (
    select 1 from bookings b
    where b.listing_id = v_listing.id
      and b.status in ('pending_payment', 'confirmed', 'in_progress', 'claim_open')
      and b.checkout >= current_date);
  v_relocating :=
    btrim(p_city) is distinct from v_property.city
    or btrim(p_address) is distinct from v_property.address_line1
    -- numeric(9,6) columns: compare at stored precision so re-sending the
    -- same pin never reads as a move.
    or round(p_latitude, 6) is distinct from v_property.latitude
    or round(p_longitude, 6) is distinct from v_property.longitude
    or upper(p_country_code) is distinct from v_property.country_code;

  if v_relocating and v_upcoming then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'has_upcoming_bookings',
      'message', 'a lodging with upcoming bookings cannot be relocated'));
  end if;

  if char_length(btrim(p_name)) < 3 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'name is required'));
  end if;
  if p_guests < 1 or p_bedrooms < 0 or p_bathrooms < 1 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'rooms out of range'));
  end if;
  if p_base_price_minor is null or p_base_price_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'price must be positive'));
  end if;

  update properties set
    name = btrim(p_name),
    property_type = p_property_type,
    description = nullif(btrim(p_blurb), ''),
    address_line1 = btrim(p_address),
    city = btrim(p_city),
    region = nullif(btrim(p_region), ''),
    country_code = upper(p_country_code),
    latitude = p_latitude,
    longitude = p_longitude,
    timezone = p_timezone
  where id = v_property.id;

  update listings set
    title = btrim(p_name),
    summary = nullif(btrim(p_blurb), ''),
    description = nullif(btrim(p_blurb), ''),
    max_guests = p_guests,
    bedrooms = p_bedrooms,
    bathrooms = p_bathrooms,
    base_price_minor = p_base_price_minor,
    currency = upper(p_currency)
  where id = v_listing.id;

  delete from listing_photos where listing_id = v_listing.id;
  for v_i in 0 .. jsonb_array_length(p_photos) - 1 loop
    v_photo := p_photos -> v_i;
    insert into listing_photos (id, listing_id, url, alt_text, position, is_cover)
    values (
      'pho_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
      v_listing.id,
      v_photo ->> 'url',
      coalesce(v_photo ->> 'alt_text', 'Foto de ' || btrim(p_name)),
      v_i,
      v_i = 0);
  end loop;

  delete from listing_amenities where listing_id = v_listing.id;
  for v_i in 0 .. jsonb_array_length(p_amenities) - 1 loop
    v_label := btrim(coalesce(p_amenities -> v_i ->> 'label', p_amenities ->> v_i));
    v_amenity_id := public.ensure_amenity(v_label);
    if v_amenity_id is not null then
      select a.name into v_amenity_name from amenities a where a.id = v_amenity_id;
      insert into listing_amenities (listing_id, amenity_id, detail)
      values (
        v_listing.id,
        v_amenity_id,
        case when lower(v_amenity_name) <> lower(v_label) then v_label end)
      on conflict (listing_id, amenity_id) do nothing;
    end if;
  end loop;

  v_today := (now() at time zone p_timezone)::date;
  insert into availability_nights (listing_id, night, status, units_available)
  select v_listing.id, v_today + d, 'open', 1
  from generate_series(0, 364) as d
  on conflict (listing_id, night) do nothing;

  return jsonb_build_object('ok', true, 'listing_id', v_listing.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- archive_lodging — soft delete. An Upcoming Booking blocks it; otherwise
-- status='archived' hides the Lodging from the catalog, the Storefront and
-- book_stay while historical Booking rows keep their FK.
-- ---------------------------------------------------------------------------
create or replace function public.archive_lodging(p_user_id uuid, p_listing_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id text;
  v_business_id text;
  v_upcoming boolean;
begin
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

  v_upcoming := exists (
    select 1 from bookings b
    where b.listing_id = v_listing_id
      and b.status in ('pending_payment', 'confirmed', 'in_progress', 'claim_open')
      and b.checkout >= current_date);
  if v_upcoming then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'has_upcoming_bookings',
      'message', 'a lodging with upcoming bookings cannot be removed'));
  end if;

  update listings set status = 'archived' where id = v_listing_id;
  return jsonb_build_object('ok', true, 'listing_id', v_listing_id);
end;
$$;

-- service_role only, like every other RPC: they trust p_user_id, which only
-- the server (after auth.getUser) may supply.
revoke execute on function public.create_lodging(
  uuid, text, property_type, text, text, text, text, text, numeric, numeric,
  integer, integer, integer, bigint, text, text, jsonb, jsonb, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_lodging(
  uuid, text, property_type, text, text, text, text, text, numeric, numeric,
  integer, integer, integer, bigint, text, text, jsonb, jsonb, text, text, text
) to service_role;

revoke execute on function public.update_lodging(
  uuid, text, text, property_type, text, text, text, text, text, numeric, numeric,
  integer, integer, integer, bigint, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.update_lodging(
  uuid, text, text, property_type, text, text, text, text, text, numeric, numeric,
  integer, integer, integer, bigint, text, text, jsonb, jsonb
) to service_role;

revoke execute on function public.archive_lodging(uuid, text) from public, anon, authenticated;
grant execute on function public.archive_lodging(uuid, text) to service_role;
