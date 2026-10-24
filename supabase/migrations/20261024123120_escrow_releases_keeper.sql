-- Escrow rework of the booking RPCs + the time-based release keeper (ADR-0006).
--
--   confirm_booking_payment → escrow_status='funded', cancel_deadline set,
--     charge payment row + service_fee row for the platform's cut.
--   release_booking       → escrow_status back to 'unfunded'.
--   cancel_booking        → refund payment rows get kind='refund',
--     escrow_status='refunded'. (Replaced wholesale below.)
--   open_claim            → Traveler-only, 24 h after check-in → claim_open +
--     escrow 'claimed'.
--   resolve_claim         → Nomai's manual resolution: full/partial refund or
--     full release; emits the matching payment rows.
--   process_escrow_releases → the keeper: run periodically (edge-fn cron or an
--     api endpoint); marks releases and emits 'release' payment intents whose
--     tx_hash the on-chain keeper fills after broadcasting.

-- ---------------------------------------------------------------------------
-- confirm_booking_payment: mark the escrow funded + set cancel_deadline, emit
-- the charge row and the service_fee row.
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
      v_booking.id, p_payer, 'platform', v_booking.service_fee_minor,
      p_asset, p_network, p_tx_hash, v_booking.id, 'service_fee'
    );
  end if;

  return jsonb_build_object('ok', true, 'booking_id', v_booking.id,
                            'status', 'confirmed');
end;
$$;

-- ---------------------------------------------------------------------------
-- release_booking (payment never settled): escrow stays unfunded.
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
-- open_claim: Traveler-only, within 24 h of check-in (ADR-0006).
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

  if v_booking.guest_ref <> p_guest_ref and v_booking.traveler_id::text <> p_guest_ref then
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
-- resolve_claim: Nomai resolves a Claim by hand (ADR-0006). Emits the payment
-- intent rows; the on-chain keeper fills tx_hash after broadcasting.
--   full_refund    → whole rental back to the Traveler, booking cancelled.
--   partial_refund → p_refund_pct of the rental refunded, the rest releases.
--   full_release   → entire rental releases to the Owner.
-- Service fee is never refunded (ADR-0005).
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
  from listings l join businesses b on b.id = l.business_id
  where l.id = v_booking.listing_id;

  v_rental := v_booking.total_minor - v_booking.service_fee_minor;
  v_refund := case p_resolution
    when 'full_refund' then v_rental
    when 'partial_refund' then (v_rental * least(greatest(p_refund_pct, 0), 100)) / 100
    else 0
  end;

  if v_refund > 0 then
    -- Refund = negative amount on the original charge corridor (the escrow
    -- sends it back to the Traveler's agent wallet).
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
-- process_escrow_releases: the keeper body (ADR-0006). Call periodically —
-- marks releases and emits 'release' payment intents; the on-chain side fills
-- tx_hash per row after broadcasting. Returns the touched booking ids.
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
    from listings l join businesses b on b.id = l.business_id
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
