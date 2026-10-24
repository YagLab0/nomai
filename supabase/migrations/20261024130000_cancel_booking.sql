-- cancel_booking — Traveler-initiated Cancellation (GitHub issue #18, ADR-0004).
--
-- Mirror of book_stay: the api calls this via rpc() and it does in ONE
-- transaction what a cancellation needs:
--   1. locks the booking row and checks the caller is the Traveler (or their
--      Agent): today a guest_ref / traveler_id match — real auth lands in a
--      separate ticket; this parameter pair is the hook it plugs into.
--   2. requires status 'confirmed' — the only cancellable state.
--   3. resolves the policy: listing.cancel_policy_id, else the platform
--      default ('cpol_moderada' — the business_id-null row closest to
--      ADR-0004's original global rule), else any business_id-null row.
--   4. computes the refund from days-until-checkin in the PROPERTY's
--      timezone (nights are local): >= full_refund_days → 100%;
--      >= partial_refund_days → partial_refund_pct; below that → 0.
--      The gap between the two windows resolves to the partial rate —
--      "inside the partial window" means days >= partial_refund_days.
--   5. flips the booking to 'cancelled', returns one unit per night
--      ('booked' nights reopen; a night the Owner 'blocked' by hand stays
--      blocked but still recovers the unit), and records the refund intent
--      in payments.
--
-- Refund bookkeeping: the original settlement is a payments row with
-- pay_to = business.payout_address (the Owner's wallet — the platform never
-- held the funds, so the money must come back OUT of it). The refund is
-- recorded as a NEGATIVE amount on the same corridor — payer/pay_to/asset/
-- network copied from the original payment when one exists, falling back to
-- the business payout_address and the booking's currency — so summing
-- payments per booking nets the Owner's take and the refund stays
-- reconciliable against the original tx_hash. tx_hash and facilitator_ref
-- stay null: the actual Owner→Traveler transfer rail is out of scope here;
-- this row is the intent it will later settle.
--
-- Returns jsonb mirroring the book_stay convention:
--   {ok:true, booking_id, status, checkin, checkout, currency, total_minor,
--    days_until_checkin, policy_name, refund_pct, refund_minor,
--    refund_payment_id}
-- or {ok:false, error:{code,message}} with codes:
--   not_found | forbidden | not_cancellable | no_policy

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
  v_listing listings%rowtype;
  v_property properties%rowtype;
  v_business businesses%rowtype;
  v_policy cancellation_policies%rowtype;
  v_orig payments%rowtype;
  v_today date;
  v_days int;
  v_pct int;
  v_refund_minor bigint;
  v_pay_to text;
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

  -- Ownership hook: only the Traveler (or the Agent acting for them) can
  -- cancel. Until real auth lands, identity = matching guest_ref or
  -- traveler_id. A booking carrying neither can never be cancelled through
  -- this path — nothing to prove ownership against.
  if not (
    (v_booking.traveler_id is not null
      and p_traveler_id is not null
      and p_traveler_id = v_booking.traveler_id)
    or (v_booking.guest_ref is not null
      and p_guest_ref is not null
      and p_guest_ref = v_booking.guest_ref)
  ) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden',
      'message', 'only the traveler on this booking can cancel it'));
  end if;

  if v_booking.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_cancellable',
      'message', format('booking is %s — only confirmed bookings can be cancelled',
                        v_booking.status)));
  end if;

  select * into v_listing from listings where id = v_booking.listing_id;
  select * into v_property from properties where id = v_listing.property_id;
  select * into v_business from businesses where id = v_property.business_id;

  -- Policy resolution: the listing's own, else the platform default. The
  -- business_id-null rows are a catalog the Owner picks from; the platform
  -- default among them is Moderada (closest to ADR-0004's original global
  -- rule). If it ever disappears, fall back deterministically by id.
  if v_listing.cancel_policy_id is not null then
    select * into v_policy
    from cancellation_policies
    where id = v_listing.cancel_policy_id;
  else
    select * into v_policy
    from cancellation_policies
    where id = 'cpol_moderada';
    if not found then
      select * into v_policy
      from cancellation_policies
      where business_id is null
      order by id
      limit 1;
    end if;
  end if;
  if v_policy.id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'no_policy',
      'message', 'no cancellation policy resolved for this booking'));
  end if;

  -- "Days until check-in" in the property's timezone: availability nights
  -- are local dates, so the cutoff must be too.
  v_today := (now() at time zone v_property.timezone)::date;
  v_days := v_booking.checkin - v_today;

  v_pct := case
    when v_days >= v_policy.full_refund_days then 100
    when v_days >= v_policy.partial_refund_days then v_policy.partial_refund_pct
    else 0
  end;
  v_refund_minor := round(v_booking.total_minor * v_pct / 100.0)::bigint;

  update bookings
  set status = 'cancelled'
  where id = v_booking.id;

  -- Hand the unit back on every night of the stay. 'booked' nights reopen;
  -- a night the Owner blocked since stays 'blocked' — the block is theirs,
  -- not this booking's — but the unit still comes back.
  update availability_nights
  set units_available = units_available + 1,
      status = case
        when status = 'booked'::avail_status then 'open'::avail_status
        else status
      end
  where listing_id = v_booking.listing_id
    and night >= v_booking.checkin
    and night < v_booking.checkout;

  -- Refund intent on the same corridor as the settlement (see header).
  select * into v_orig
  from payments
  where booking_id = v_booking.id
  order by created_at desc
  limit 1;

  v_pay_to := coalesce(v_orig.pay_to, v_business.payout_address);
  if v_pay_to is not null then
    insert into payments (
      booking_id, payer, pay_to, amount_minor, asset, network,
      tx_hash, facilitator_ref
    ) values (
      v_booking.id, v_orig.payer, v_pay_to, -v_refund_minor,
      coalesce(v_orig.asset, v_booking.currency),
      coalesce(v_orig.network, 'pending'),
      null, null
    )
    returning id into v_payment_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking.id,
    'status', 'cancelled',
    'checkin', v_booking.checkin,
    'checkout', v_booking.checkout,
    'currency', v_booking.currency,
    'total_minor', v_booking.total_minor,
    'days_until_checkin', v_days,
    'policy_name', v_policy.name,
    'refund_pct', v_pct,
    'refund_minor', v_refund_minor,
    'refund_payment_id', v_payment_id);
end;
$$;
