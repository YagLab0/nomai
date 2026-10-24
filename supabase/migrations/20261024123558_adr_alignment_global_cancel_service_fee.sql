-- Aligns the booking writes with the current ADRs:
--
--   ADR-0005  a fixed-percentage Service fee is charged on every Booking and
--             shown as its own line. Implemented as a BEFORE-INSERT trigger so
--             every booking row carries service_fee_minor and total_minor =
--             rental + fee (the 402 amount must match — book-payment.ts adds
--             the fee when computing the price). The % lives in
--             platform_settings so ops can move it without a migration.
--
--   ADR-0006  Cancellation becomes ONE GLOBAL RULE — full refund of the
--             rental until the Cancellation deadline (check_in - 5), 50%
--             after; a Booking made inside the window is 50% refundable from
--             the start. The Service fee is never refunded. Refunds come out
--             of escrow, so they are immediate (kind='refund' payment intent).
--             The per-business cancellation_policies table stays in the schema
--             for a possible future override, but the RPC no longer reads it.

-- ---------------------------------------------------------------------------
-- platform_settings — single-row config the SQL layer can read (env vars do
-- not reach the database).
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
create policy platform_settings_admin_only on public.platform_settings
  for all using (false); -- server/admin-client only

insert into public.platform_settings (key, value) values
  ('service_fee_pct', '7.0'::jsonb);

-- ---------------------------------------------------------------------------
-- Service fee on every booking insert (ADR-0005).
-- ---------------------------------------------------------------------------
create or replace function public.apply_service_fee()
returns trigger
language plpgsql
as $$
declare
  v_pct numeric;
begin
  select (value#>>'{}')::numeric into v_pct
  from platform_settings where key = 'service_fee_pct';
  v_pct := coalesce(v_pct, 0);

  new.service_fee_pct := v_pct;
  new.service_fee_minor := round(new.total_minor * v_pct / 100)::bigint;
  new.total_minor := new.total_minor + new.service_fee_minor;
  return new;
end;
$$;

create trigger bookings_apply_service_fee
  before insert on public.bookings
  for each row execute function public.apply_service_fee();

-- ---------------------------------------------------------------------------
-- cancel_booking rewritten to the ADR-0006 global rule.
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

  -- Traveler-only cancellation: guest_ref or the traveler_id claim.
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

  -- Global rule (ADR-0006): rental fully refundable until the Cancellation
  -- deadline (check_in - 5), 50% at/after it. Service fee is never refunded.
  v_days := v_booking.checkin - current_date;
  v_pct := case when v_booking.cancel_deadline is null
                     or current_date < v_booking.cancel_deadline
                then 100 else 50 end;
  v_rental := v_booking.total_minor - v_booking.service_fee_minor;
  v_refund_minor := round(v_rental * v_pct / 100.0)::bigint;

  update bookings
  set status = 'cancelled', escrow_status = 'refunded'
  where id = v_booking.id;

  -- Nights go back to availability (owner-blocked nights stay blocked).
  update availability_nights
  set units_available = units_available + 1,
      status = case
        when status = 'booked' then 'open'::avail_status
        else status
      end
  where listing_id = v_booking.listing_id
    and night >= v_booking.checkin
    and night < v_booking.checkout;

  -- Refund intent out of the escrow: positive amount on the reversed
  -- corridor (escrow → Traveler's agent wallet), same convention as
  -- resolve_claim.
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
