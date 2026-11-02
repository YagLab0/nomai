-- Private Traveler↔Owner chat per Booking (issue #73, ADR-0009). The thread
-- opens the moment the Booking exists — an AFTER INSERT trigger plants a
-- 'system' welcome row — and only its two parties take part: the Traveler on
-- the Booking and the Owner behind the Lodging. Reads are RLS-scoped to the
-- parties; writes go exclusively through the service_role-only RPCs below,
-- so every send re-derives the caller's role server-side and no PostgREST
-- insert can forge a sender.
--
-- booking_messages is a single reader model (Airbnb-style 1:1): read_at is
-- the counterpart's "visto" mark — one timestamp is enough because a thread
-- has exactly one reader per side.

-- ---------------------------------------------------------------------------
-- BOOKING_MESSAGES — one row per message. sender_id stays NULL on 'system'
-- rows (no human author); sender_role still classifies them so the API can
-- render thread structure. System rows never count as unread: the
-- sender_id <> caller rule below treats NULL like any SQL comparison does —
-- a NULL sender is nobody's counterpart, so notices never badge and never
-- need marking.
-- ---------------------------------------------------------------------------
create table public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  sender_role text not null check (sender_role in ('traveler', 'owner', 'system')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index booking_messages_booking_idx
  on public.booking_messages (booking_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS helper — is this user a party of the thread? True for the Booking's
-- Traveler or for the Owner user behind the Lodging's business (same join
-- chain as is_owner_of_traveler: bookings → listings → properties →
-- businesses). security definer so the policy can reach bookings the caller
-- can't select; stays executable by everyone, like owns_listing — policies
-- need EXECUTE on the functions they call.
-- ---------------------------------------------------------------------------
create or replace function public.is_booking_party(p_user_id uuid, p_booking_id text)
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
    where bk.id = p_booking_id
      and (bk.traveler_id = p_user_id or b.user_id = p_user_id));
$$;

-- ---------------------------------------------------------------------------
-- send_message — the only way a message lands. Same spirit as the booking
-- RPCs but a leaner contract per the issue: {message: <row>} on success,
-- {error: {code, message}} on failure. sender_role is DERIVED here, never
-- taken as a parameter: the Booking's Traveler wins when the caller is both
-- (self-booked Owner), the Lodging's Owner otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.send_message(
  p_user_id uuid,
  p_booking_id text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b bookings%rowtype;
  v_role text;
  v_msg booking_messages%rowtype;
begin
  if nullif(btrim(p_body), '') is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'code', 'empty_body',
        'message', 'message body is empty'));
  end if;

  select * into v_b from bookings where id = p_booking_id;
  if not found then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'code', 'not_found',
        'message', 'booking not found'));
  end if;

  if v_b.traveler_id is not null and v_b.traveler_id = p_user_id then
    v_role := 'traveler';
  elsif exists (
    select 1
    from listings l
    join properties p on p.id = l.property_id
    join businesses b on b.id = p.business_id
    where l.id = v_b.listing_id and b.user_id = p_user_id
  ) then
    v_role := 'owner';
  else
    return jsonb_build_object(
      'error', jsonb_build_object(
        'code', 'forbidden',
        'message', 'only the booking parties can message this thread'));
  end if;

  insert into booking_messages (booking_id, sender_id, sender_role, body)
  values (v_b.id, p_user_id, v_role, btrim(p_body))
  returning * into v_msg;

  return jsonb_build_object('message', to_jsonb(v_msg));
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_thread_read — sets the "visto" mark on every message in the thread
-- the caller did NOT send (sender_id <> p_user_id; NULL-sender system rows
-- compare NULL and stay unmarked — they never badge). Party-checked like
-- send_message: a non-party gets forbidden, an unknown booking not_found.
-- ---------------------------------------------------------------------------
create or replace function public.mark_thread_read(
  p_user_id uuid,
  p_booking_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not exists (select 1 from bookings where id = p_booking_id) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'code', 'not_found',
        'message', 'booking not found'));
  end if;

  if not public.is_booking_party(p_user_id, p_booking_id) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'code', 'forbidden',
        'message', 'only the booking parties can mark this thread'));
  end if;

  update booking_messages
  set read_at = now()
  where booking_id = p_booking_id
    and sender_id <> p_user_id
    and read_at is null;
  get diagnostics v_n = row_count;

  return jsonb_build_object('marked', v_n);
end;
$$;

-- ---------------------------------------------------------------------------
-- The thread's opening row: every new Booking gets a 'system' message so the
-- parties land on a live thread, not an empty one (same welcome copy the
-- booking confirmation shows).
-- ---------------------------------------------------------------------------
create or replace function public.booking_messages_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into booking_messages (booking_id, sender_id, sender_role, body)
  values (
    new.id,
    null,
    'system',
    'Reserva recibida — ya podés coordinar los detalles de tu estadía.');
  return new;
end;
$$;

create trigger booking_messages_on_booking
  after insert on public.bookings
  for each row execute function public.booking_messages_on_booking();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY. The thread is private to its two parties — no public
-- read like lodging Reviews get. There is NO insert policy on purpose:
-- writes go through send_message() only, so sender_id/sender_role can never
-- be forged over PostgREST.
-- ---------------------------------------------------------------------------
alter table public.booking_messages enable row level security;

create policy booking_messages_party_read on public.booking_messages
  for select using (public.is_booking_party(auth.uid(), booking_id));

-- Same lockdown as the booking/escrow RPCs: EXECUTE only for service_role,
-- so every call goes through apps/api with the secret key.
revoke execute on function public.send_message(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.mark_thread_read(uuid, text)
  from public, anon, authenticated;

grant execute on function public.send_message(uuid, text, text)
  to service_role;
grant execute on function public.mark_thread_read(uuid, text)
  to service_role;
