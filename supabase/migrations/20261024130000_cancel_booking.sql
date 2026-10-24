-- cancel_booking — Traveler-initiated Cancellation (GitHub issue #18).
--
-- This file originally shipped the per-business-policy version (ADR-0004:
-- cancellation_policies + listings.cancel_policy_id). Both objects are
-- dropped by 20261024124352, which runs BEFORE this file, so that version
-- broke a fresh `supabase db reset`. It now carries the ADR-0006 global rule
-- (same body as 20261024123558; 20261024150000 re-asserts it as the final
-- state):
--   1. locks the booking row; only the Traveler (guest_ref / traveler_id
--      match) may cancel.
--   2. requires status 'confirmed' — the only cancellable state.
--   3. refund = 100% of the rental before the Cancellation deadline
--      (cancel_deadline, i.e. check-in − 5 days), 50% on/after it. The
--      Service fee is never refunded (ADR-0005).
--   4. booking → 'cancelled', escrow_status → 'refunded'; one unit per night
--      goes back to availability (Owner-blocked nights stay blocked).
--   5. records the refund intent out of escrow as a kind='refund' payments
--      row on the reversed charge corridor (escrow → Traveler wallet).
--
-- Returns {ok:true, booking_id, status, days_until_checkin, policy_name,
-- refund_pct, refund_minor, refund_payment_id} or {ok:false, error:{code,
-- message}} with codes not_found | forbidden | not_cancellable.

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
