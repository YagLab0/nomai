-- Corrective migration: restores the ADR-0005/0006 booking RPCs after two
-- later migrations clobbered them, and closes public RPC exposure.
--
--   * 20261024130000 re-created cancel_booking with the pre-ADR-0006
--     per-business policy body (cancellation_policies / cancel_policy_id,
--     both dropped in 20261024124352). That file is fixed in place; this
--     migration re-asserts the ADR-0006 body so databases that already
--     applied the broken version converge too.
--   * 20261024140000 re-created confirm_booking_payment and release_booking
--     without the escrow bookkeeping from 20261024123120, so escrow_status
--     never left 'unfunded' and process_escrow_releases had nothing to do.
--   * open_claim / resolve_claim / process_escrow_releases (and the payment
--     settle hooks) are security definer and were executable by anon /
--     authenticated through PostgREST (functions grant EXECUTE to PUBLIC by
--     default). They are only called by the api with the secret key.
--   * resolve_claim / process_escrow_releases joined listings.business_id,
--     which does not exist — both raised on every call. open_claim's
--     ownership check let NULL comparisons through.

-- ---------------------------------------------------------------------------
-- cancel_booking — ADR-0006 global rule. Rental refunded 100% before the
-- Cancellation deadline (check-in − 5 days), 50% on/after it; the Service fee
-- is never refunded. Refund comes out of escrow as a kind='refund' intent.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(
  p_booking_id text,
  p_guest_ref text default null,
  p_traveler_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings%rowtype;
  v_orig payments%rowtype;
  v_deadline date;
  v_days int;
  v_pct int;
  v_rental bigint;
  v_refund_minor bigint;
  v_payment_id uuid;
begin
  select * into v_booking
  from bookings
  where id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'booking not found'));
  end if;

  if not (
    (v_booking.guest_ref is not null and v_booking.guest_ref = p_guest_ref)
    or (v_booking.traveler_id is not null and v_booking.traveler_id = p_traveler_id)
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'not your booking'));
  end if;

  if v_booking.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_cancellable',
      'message', format('booking is %s — only confirmed bookings can be cancelled',
                        v_booking.status)));
  end if;

  v_deadline := coalesce(v_booking.cancel_deadline, v_booking.checkin - 5);
  v_days := v_booking.checkin - current_date;
  v_pct := case when current_date < v_deadline then 100 else 50 end;
  v_rental := v_booking.total_minor - v_booking.service_fee_minor;
  v_refund_minor := round(v_rental * v_pct / 100.0)::bigint;

  update bookings
  set status = 'cancelled', escrow_status = 'refunded'
  where id = v_booking.id;

  update availability_nights
  set units_available = units_available + 1,
      status = case
        when status = 'booked' then 'open'::avail_status
        else status
      end
  where listing_id = v_booking.listing_id
    and night >= v_booking.checkin
    and night < v_booking.checkout;

  if v_refund_minor > 0 then
    select * into v_orig from payments
    where booking_id = v_booking.id and kind = 'charge'
    order by created_at limit 1;

    insert into payments (
      booking_id, payer, pay_to, amount_minor, asset, network,
      facilitator_ref, kind
    ) values (
      v_booking.id, v_orig.pay_to, v_orig.payer, v_refund_minor,
      coalesce(v_orig.asset, v_booking.currency),
      coalesce(v_orig.network, 'celo'),
      v_booking.id, 'refund'
    )
    returning id into v_payment_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking.id,
    'status', 'cancelled',
    'days_until_checkin', v_days,
    'policy_name', 'nomai-global-5d',
    'refund_pct', v_pct,
    'refund_minor', v_refund_minor,
    'refund_payment_id', v_payment_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_booking_payment — escrow funded, cancel_deadline set, charge row +
-- service_fee row (20261024123120 semantics).
--
-- The service_fee row's pay_to is the escrow (p_pay_to), not the literal
-- 'platform' the 123120 version used: payments.pay_to is NOT NULL with a
-- 0x-address check, so 'platform' made every confirm raise. The fee settles
-- inside the same x402 payment to the escrow, so that is where it sits.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_booking_payment(
  p_booking_id text,
  p_payer text default null,
  p_pay_to text default null,      -- the escrow contract address (ADR-0006)
  p_amount_minor bigint default null,
  p_asset text default null,
  p_network text default null,
  p_tx_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings%rowtype;
begin
  select * into v_booking from bookings where id = p_booking_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'booking not found'));
  end if;

  -- Idempotent: a retried settle hook is a no-op, not an error.
  if v_booking.status <> 'pending_payment' then
    return jsonb_build_object('ok', true, 'booking_id', v_booking.id,
                              'status', v_booking.status,
                              'already_processed', true);
  end if;

  update bookings
  set status = 'confirmed',
      escrow_address = coalesce(escrow_address, p_pay_to),
      escrow_status = 'funded',
      cancel_deadline = coalesce(cancel_deadline, checkin - 5)
  where id = v_booking.id;

  insert into payments (
    booking_id, payer, pay_to, amount_minor, asset, network, tx_hash,
    facilitator_ref, kind
  ) values (
    v_booking.id, p_payer, p_pay_to, p_amount_minor, p_asset, p_network,
    p_tx_hash, v_booking.id, 'charge'
  );

  -- The platform's Service fee (ADR-0005): settled out of the same payment,
  -- kept even on Cancellation.
  if v_booking.service_fee_minor > 0 then
    insert into payments (
      booking_id, payer, pay_to, amount_minor, asset, network, tx_hash,
      facilitator_ref, kind
    ) values (
      v_booking.id, p_payer, p_pay_to, v_booking.service_fee_minor,
      p_asset, p_network, p_tx_hash, v_booking.id, 'service_fee'
    );
  end if;

  return jsonb_build_object('ok', true, 'booking_id', v_booking.id,
                            'status', 'confirmed');
end;
$$;

-- ---------------------------------------------------------------------------
-- release_booking — payment never settled: booking cancelled, held nights
-- returned, escrow stays 'unfunded' (20261024123120 semantics).
-- ---------------------------------------------------------------------------
create or replace function public.release_booking(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings%rowtype;
begin
  select * into v_booking from bookings where id = p_booking_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'booking not found'));
  end if;

  if v_booking.status <> 'pending_payment' then
    return jsonb_build_object('ok', true, 'booking_id', v_booking.id,
                              'status', v_booking.status,
                              'already_processed', true);
  end if;

  update availability_nights
  set units_available = units_available + 1,
      status = case
        when status = 'booked' then 'open'::avail_status
        else status
      end
  where listing_id = v_booking.listing_id
    and night >= v_booking.checkin
    and night < v_booking.checkout;

  update bookings
  set status = 'cancelled', escrow_status = 'unfunded'
  where id = v_booking.id;

  return jsonb_build_object('ok', true, 'booking_id', v_booking.id,
                            'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- open_claim — Traveler-only, within 24 h of check-in (ADR-0006). Same as
-- 20261024123120 except the ownership test is null-safe: the old
-- `guest_ref <> p and traveler_id::text <> p` evaluated to NULL (= allowed)
-- whenever the booking had no guest_ref or no traveler_id.
-- ---------------------------------------------------------------------------
create or replace function public.open_claim(
  p_booking_id text,
  p_guest_ref text,
  p_reason claim_reason,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings%rowtype;
begin
  select * into v_booking from bookings where id = p_booking_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'booking not found'));
  end if;

  if p_guest_ref is null or not (
    v_booking.guest_ref is not distinct from p_guest_ref
    or v_booking.traveler_id::text is not distinct from p_guest_ref
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'not your booking'));
  end if;

  if v_booking.status not in ('confirmed', 'in_progress') then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid_state', 'message', 'claim needs an active booking'));
  end if;

  -- Claims open for 24 h after check-in only.
  if now() > v_booking.checkin::timestamptz + interval '24 hours' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'claim_window_closed', 'message', 'claims close 24h after check-in'));
  end if;

  update bookings
  set status = 'claim_open',
      escrow_status = 'claimed',
      claim_reason = p_reason,
      claim_evidence = p_evidence
  where id = v_booking.id;

  return jsonb_build_object('ok', true, 'booking_id', v_booking.id,
                            'status', 'claim_open');
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_claim — Nomai's manual resolution (ADR-0006), same semantics as
-- 20261024123120. Fix: the Owner's payout address was looked up through
-- listings.business_id, which does not exist (listings → properties →
-- businesses), so every call raised.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_claim(
  p_booking_id text,
  p_resolution claim_resolution,
  p_refund_pct int default 50          -- only used by partial_refund
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings%rowtype;
  v_orig payments%rowtype;
  v_owner_pay_to text;
  v_rental bigint;
  v_refund bigint;
begin
  select * into v_booking from bookings where id = p_booking_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'booking not found'));
  end if;

  if v_booking.status <> 'claim_open' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid_state', 'message', 'no open claim'));
  end if;

  select b.payout_address into v_owner_pay_to
  from listings l
  join properties p on p.id = l.property_id
  join businesses b on b.id = p.business_id
  where l.id = v_booking.listing_id;

  v_rental := v_booking.total_minor - v_booking.service_fee_minor;
  v_refund := case p_resolution
    when 'full_refund' then v_rental
    when 'partial_refund' then (v_rental * least(greatest(p_refund_pct, 0), 100)) / 100
    else 0
  end;

  if v_refund > 0 then
    -- Refund on the reversed charge corridor (escrow → Traveler's wallet).
    select * into v_orig from payments
    where booking_id = v_booking.id and kind = 'charge'
    order by created_at limit 1;
    insert into payments (booking_id, payer, pay_to, amount_minor, asset,
                          network, facilitator_ref, kind)
    values (v_booking.id, v_orig.pay_to, v_orig.payer, v_refund,
            coalesce(v_orig.asset, v_booking.currency),
            coalesce(v_orig.network, 'celo'), v_booking.id, 'refund');
  end if;

  if v_rental - v_refund > 0 then
    insert into payments (booking_id, pay_to, amount_minor, asset, network,
                          facilitator_ref, kind)
    values (v_booking.id, v_owner_pay_to, v_rental - v_refund,
            v_booking.currency, 'celo', v_booking.id, 'release');
  end if;

  update bookings
  set status = case p_resolution
                 when 'full_refund' then 'cancelled'::booking_status
                 else 'completed'::booking_status
               end,
      escrow_status = case p_resolution
                        when 'full_refund' then 'refunded'::escrow_status
                        else 'released'::escrow_status
                      end,
      claim_resolution = p_resolution,
      claim_resolved_at = now()
  where id = v_booking.id;

  -- A full refund frees the nights back to availability.
  if p_resolution = 'full_refund' then
    update availability_nights
    set units_available = units_available + 1,
        status = case when status = 'booked' then 'open'::avail_status else status end
    where listing_id = v_booking.listing_id
      and night >= v_booking.checkin and night < v_booking.checkout;
  end if;

  return jsonb_build_object('ok', true, 'booking_id', v_booking.id,
                            'resolution', p_resolution,
                            'refund_minor', v_refund);
end;
$$;

-- ---------------------------------------------------------------------------
-- process_escrow_releases — the keeper (ADR-0006), same semantics as
-- 20261024123120: 50% of the rental at cancel_deadline, the rest 24 h after
-- check-in with no open Claim. Fix: same listings.business_id join bug as
-- resolve_claim.
-- ---------------------------------------------------------------------------
create or replace function public.process_escrow_releases()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b bookings%rowtype;
  v_owner_pay_to text;
  v_rental bigint;
  v_released text[] := '{}';
begin
  for v_b in
    select * from bookings
    where escrow_status in ('funded', 'partially_released')
    order by cancel_deadline
    for update skip locked
  loop
    select b.payout_address into v_owner_pay_to
    from listings l
    join properties p on p.id = l.property_id
    join businesses b on b.id = p.business_id
    where l.id = v_b.listing_id;
    v_rental := v_b.total_minor - v_b.service_fee_minor;

    -- Stage 1: confirmed bookings pass into the stay once check-in day lands.
    if v_b.status = 'confirmed' and v_b.checkin <= current_date then
      update bookings set status = 'in_progress' where id = v_b.id;
    end if;

    -- First release: 50% at the Cancellation deadline.
    if v_b.escrow_status = 'funded'
       and v_b.cancel_deadline is not null
       and v_b.cancel_deadline <= current_date
       and v_b.first_release_at is null then
      insert into payments (booking_id, pay_to, amount_minor, asset, network,
                            facilitator_ref, kind)
      values (v_b.id, v_owner_pay_to, v_rental / 2, v_b.currency, 'celo',
              v_b.id, 'release');
      update bookings
      set escrow_status = 'partially_released', first_release_at = now()
      where id = v_b.id;
      v_released := v_released || v_b.id;
      v_b.escrow_status := 'partially_released';
    end if;

    -- Final release: the rest, 24 h after check-in, no open Claim.
    if v_b.escrow_status = 'partially_released'
       and now() > v_b.checkin::timestamptz + interval '24 hours'
       and v_b.status <> 'claim_open'
       and v_b.final_release_at is null then
      insert into payments (booking_id, pay_to, amount_minor, asset, network,
                            facilitator_ref, kind)
      values (v_b.id, v_owner_pay_to, v_rental - v_rental / 2, v_b.currency,
              'celo', v_b.id, 'release');
      update bookings
      set escrow_status = 'released', final_release_at = now(),
          status = 'completed'
      where id = v_b.id;
      v_released := v_released || v_b.id;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'released', v_released);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock down server-only RPCs: revoke from PUBLIC as well, since anon and
-- authenticated inherit PUBLIC's default EXECUTE grant.
-- ---------------------------------------------------------------------------
revoke execute on function public.open_claim(text, text, claim_reason, jsonb)
  from public, anon, authenticated;
revoke execute on function public.resolve_claim(text, claim_resolution, int)
  from public, anon, authenticated;
revoke execute on function public.process_escrow_releases()
  from public, anon, authenticated;
revoke execute on function public.confirm_booking_payment(text, text, text, bigint, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.release_booking(text)
  from public, anon, authenticated;

grant execute on function public.open_claim(text, text, claim_reason, jsonb) to service_role;
grant execute on function public.resolve_claim(text, claim_resolution, int) to service_role;
grant execute on function public.process_escrow_releases() to service_role;
grant execute on function public.confirm_booking_payment(text, text, text, bigint, text, text, text) to service_role;
grant execute on function public.release_booking(text) to service_role;
