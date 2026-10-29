-- Two-sided reviews (issue #51, ADR-0008). A Booking that reached 'completed'
-- is a verified stay: the Traveler may review the Lodging and the Owner may
-- review the Traveler — each inside a 14-day window after check-out (Airbnb's
-- window), published immediately. Scores are recency-weighted aggregates
-- (Booking-style): a Review's weight decays linearly to zero over 36 months,
-- so recent stays shape the Score while old ones fade out.
--
-- The listing card pair `listings.rating`/`reviews` stops being seed data and
-- becomes a computed value; `businesses` gains the same pair for the Owner's
-- storefront score (Airbnb's host rating). The Traveler's score is computed
-- on read by traveler_score() — it is never public, only Owners who hosted
-- them see it.

create type review_direction as enum ('to_lodging', 'to_traveler');

-- ---------------------------------------------------------------------------
-- REVIEWS — one row per side per Booking (unique on (booking_id, direction)).
-- Overall stars are required 1–5; category scores are optional. to_lodging
-- carries Airbnb's six categories; to_traveler carries the three that apply
-- to a guest (cleanliness, communication, house_rules) — the check below
-- keeps each direction to its own set.
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings (id),
  direction review_direction not null,

  -- Who wrote it. Real Reviews always carry a verified auth user; seeded
  -- history may have author_id null with author_name as the display copy.
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null,

  -- The rated side — exactly one is set, enforced by the check below.
  subject_listing_id text references public.listings (id) on delete cascade,
  subject_traveler_id uuid references public.travelers (id) on delete cascade,

  rating smallint not null check (rating between 1 and 5),
  cleanliness smallint check (cleanliness between 1 and 5),
  accuracy smallint check (accuracy between 1 and 5),
  checkin smallint check (checkin between 1 and 5),
  communication smallint check (communication between 1 and 5),
  location smallint check (location between 1 and 5),
  value smallint check (value between 1 and 5),
  house_rules smallint check (house_rules between 1 and 5),

  body text,

  -- The Owner's public response on a to_lodging Review (Booking-style reply).
  reply_body text,
  replied_at timestamptz,

  created_at timestamptz not null default now(),

  unique (booking_id, direction),
  check (
    (direction = 'to_lodging'
      and subject_listing_id is not null and subject_traveler_id is null
      and house_rules is null)
    or
    (direction = 'to_traveler'
      and subject_traveler_id is not null and subject_listing_id is null
      and accuracy is null and checkin is null
      and location is null and value is null)
  )
);

create index reviews_listing_idx on public.reviews (subject_listing_id);
create index reviews_traveler_idx on public.reviews (subject_traveler_id);
create index reviews_author_idx on public.reviews (author_id);

-- The Owner's aggregate for the storefront (Airbnb's host rating).
alter table public.businesses
  add column rating numeric(2,1) check (rating between 0 and 5),
  add column reviews int not null default 0;

-- ---------------------------------------------------------------------------
-- Recency weight (ADR-0008): full weight today, decaying linearly to 0 at
-- 36 months — Booking's model, where the newest stays weigh the most.
-- ---------------------------------------------------------------------------
create or replace function public.review_weight(p_created_at timestamptz)
returns numeric
language sql
as $$
  select greatest(
    0::numeric,
    1 - extract(epoch from (now() - p_created_at)) / (36.0 * 30 * 86400));
$$;

-- ---------------------------------------------------------------------------
-- refresh_review_scores — recomputes the denormalized pairs on listings and
-- businesses after a Review lands (same transaction as the insert).
-- ---------------------------------------------------------------------------
create or replace function public.refresh_review_scores(
  p_listing_id text,
  p_business_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_listing_id is not null then
    update listings l
    set rating = s.score, reviews = s.count
    from (
      select round(sum(r.rating * public.review_weight(r.created_at))
                   / nullif(sum(public.review_weight(r.created_at)), 0), 1) as score,
             count(*)::int as count
      from reviews r
      where r.direction = 'to_lodging'
        and r.subject_listing_id = p_listing_id
    ) s
    where l.id = p_listing_id;
  end if;

  if p_business_id is not null then
    update businesses b
    set rating = s.score, reviews = s.count
    from (
      select round(sum(r.rating * public.review_weight(r.created_at))
                   / nullif(sum(public.review_weight(r.created_at)), 0), 1) as score,
             count(*)::int as count
      from reviews r
      join listings l on l.id = r.subject_listing_id
      join properties p on p.id = l.property_id
      where r.direction = 'to_lodging'
        and p.business_id = p_business_id
    ) s
    where b.id = p_business_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- traveler_score — {rating, reviews} for a Traveler, weighted the same way.
-- Computed on read: the guest score is never public, so nothing denormalizes.
-- ---------------------------------------------------------------------------
create or replace function public.traveler_score(p_traveler_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rating', round(sum(rating * w) / nullif(sum(w), 0), 1),
    'reviews', count(*))
  from (
    select rating, public.review_weight(created_at) as w
    from reviews
    where direction = 'to_traveler' and subject_traveler_id = p_traveler_id
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- submit_review — the only way a Review lands. Same contract as the booking
-- RPCs: {ok:true,…} or {ok:false,error:{code,message}}; service_role only.
-- ---------------------------------------------------------------------------
create or replace function public.submit_review(
  p_user_id uuid,
  p_booking_id text,
  p_direction review_direction,
  p_rating int,
  p_body text default null,
  p_cleanliness int default null,
  p_accuracy int default null,
  p_checkin int default null,
  p_communication int default null,
  p_location int default null,
  p_value int default null,
  p_house_rules int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b bookings%rowtype;
  v_business_id text;
  v_business_name text;
  v_author_name text;
  v_review_id uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'invalid_rating',
        'message', 'rating must be an integer between 1 and 5'));
  end if;

  select * into v_b from bookings where id = p_booking_id;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'not_found', 'message', 'booking not found'));
  end if;

  -- Verified stay (ADR-0008): only a completed Booking is reviewable;
  -- cancelled, refunded or in-flight stays leave no Review on either side.
  if v_b.status <> 'completed' then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'not_reviewable',
        'message', 'only completed bookings can be reviewed'));
  end if;

  -- 14 days after check-out (Airbnb's window).
  if current_date > v_b.checkout + 14 then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'window_closed',
        'message', 'the review window closed 14 days after check-out'));
  end if;

  select p.business_id, b.name into v_business_id, v_business_name
  from listings l
  join properties p on p.id = l.property_id
  join businesses b on b.id = p.business_id
  where l.id = v_b.listing_id;

  if p_direction = 'to_lodging' then
    if v_b.traveler_id is null or v_b.traveler_id <> p_user_id then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'forbidden',
          'message', 'only the traveler on this booking can review the stay'));
    end if;

    -- Public copy is the Traveler's first name only — reviews never expose
    -- full names (same display convention as Airbnb).
    select coalesce(nullif(split_part(t.full_name, ' ', 1), ''), 'Viajero')
    into v_author_name
    from travelers t
    where t.id = p_user_id;

    insert into reviews (
      booking_id, direction, author_id, author_name,
      subject_listing_id, rating, body,
      cleanliness, accuracy, checkin, communication, location, value
    ) values (
      v_b.id, 'to_lodging', p_user_id, coalesce(v_author_name, 'Viajero'),
      v_b.listing_id, p_rating, nullif(btrim(p_body), ''),
      p_cleanliness, p_accuracy, p_checkin, p_communication,
      p_location, p_value
    )
    on conflict (booking_id, direction) do nothing
    returning id into v_review_id;

    if v_review_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'already_reviewed',
          'message', 'this booking already has your review'));
    end if;

    perform public.refresh_review_scores(v_b.listing_id, v_business_id);

    return jsonb_build_object(
      'ok', true,
      'review_id', v_review_id,
      'listing', (select jsonb_build_object('rating', l.rating, 'reviews', l.reviews)
                  from listings l where l.id = v_b.listing_id));
  else
    -- to_traveler: the Owner of the Booking's Lodging rates the guest. A
    -- booking with no linked Traveler leaves nothing to attach the score to.
    if v_b.traveler_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'not_reviewable',
          'message', 'this booking has no linked traveler to review'));
    end if;
    if not exists (select 1 from businesses bz
                   where bz.id = v_business_id and bz.user_id = p_user_id) then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'forbidden',
          'message', 'only the owner of this lodging can review the traveler'));
    end if;

    insert into reviews (
      booking_id, direction, author_id, author_name,
      subject_traveler_id, rating, body,
      cleanliness, communication, house_rules
    ) values (
      v_b.id, 'to_traveler', p_user_id, v_business_name,
      v_b.traveler_id, p_rating, nullif(btrim(p_body), ''),
      p_cleanliness, p_communication, p_house_rules
    )
    on conflict (booking_id, direction) do nothing
    returning id into v_review_id;

    if v_review_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'already_reviewed',
          'message', 'this booking already has a review of the traveler'));
    end if;

    return jsonb_build_object(
      'ok', true,
      'review_id', v_review_id,
      'traveler', public.traveler_score(v_b.traveler_id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- reply_to_review — the Owner's public answer on a to_lodging Review. An
-- empty body clears the reply.
-- ---------------------------------------------------------------------------
create or replace function public.reply_to_review(
  p_user_id uuid,
  p_review_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r reviews%rowtype;
  v_owner_id uuid;
begin
  select * into v_r from reviews where id = p_review_id;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'not_found', 'message', 'review not found'));
  end if;
  if v_r.direction <> 'to_lodging' then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'invalid',
        'message', 'only lodging reviews can be answered'));
  end if;

  select bz.user_id into v_owner_id
  from listings l
  join properties p on p.id = l.property_id
  join businesses bz on bz.id = p.business_id
  where l.id = v_r.subject_listing_id;
  if v_owner_id is distinct from p_user_id then
    return jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'forbidden', 'message', 'only the listing owner can answer'));
  end if;

  update reviews
  set reply_body = nullif(btrim(p_body), ''),
      replied_at = case when nullif(btrim(p_body), '') is null then null else now() end
  where id = v_r.id;

  return jsonb_build_object('ok', true, 'review_id', v_r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS helper — is the current user an Owner who has hosted this Traveler?
-- (same encapsulation as owns_listing).
-- ---------------------------------------------------------------------------
create or replace function public.is_owner_of_traveler(p_traveler_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from bookings bk
    join listings l on l.id = bk.listing_id
    join properties p on p.id = l.property_id
    join businesses b on b.id = p.business_id
    where bk.traveler_id = p_traveler_id
      and b.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY. Lodging reviews are public content; a Traveler's own
-- reviews stay scoped — the rated Traveler, the Owner who wrote them, and
-- Owners who hosted that Traveler (Airbnb shows guest ratings only to hosts,
-- never on a public profile). Writes go through the locked-down RPCs only.
-- ---------------------------------------------------------------------------
alter table public.reviews enable row level security;

create policy reviews_lodging_public_read on public.reviews
  for select using (direction = 'to_lodging');

create policy reviews_traveler_scoped_read on public.reviews
  for select using (
    direction = 'to_traveler'
    and (auth.uid() = subject_traveler_id
         or auth.uid() = author_id
         or public.is_owner_of_traveler(subject_traveler_id)));

-- Same lockdown as the booking/escrow RPCs: EXECUTE only for service_role,
-- so every call goes through apps/api with the secret key.
revoke execute on function public.submit_review(uuid, text, review_direction, int, text, int, int, int, int, int, int, int)
  from public, anon, authenticated;
revoke execute on function public.reply_to_review(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.refresh_review_scores(text, text)
  from public, anon, authenticated;
revoke execute on function public.traveler_score(uuid)
  from public, anon, authenticated;

grant execute on function public.submit_review(uuid, text, review_direction, int, text, int, int, int, int, int, int, int)
  to service_role;
grant execute on function public.reply_to_review(uuid, uuid, text)
  to service_role;
grant execute on function public.refresh_review_scores(text, text)
  to service_role;
grant execute on function public.traveler_score(uuid)
  to service_role;
