-- On-chain execution of Escrow intents (issue #69). cancel_booking,
-- resolve_claim and process_escrow_releases already write intent rows into
-- payments (kind 'release' | 'refund', tx_hash null); this migration adds the
-- execution state machine the keeper drives and the service_role RPCs that
-- make claiming a row atomic across concurrent keeper runs.
--
-- Row state machine (payments.status, intents only):
--
--   pending    intent written, never claimed
--   executing  claimed by one keeper run (for update skip locked inside
--              claim_escrow_intents) — at most one run ever holds a row
--   sent       transfer confirmed on-chain; tx_hash set — terminal
--   held       a precondition is not met (Owner payout unverified, missing
--              charge) — re-evaluated every run, self-heals
--   failed     the send attempt errored (RPC, vault balance, revert) —
--              last_error recorded, retryable on the next claim pass
--              (the same cycle's, if it failed during recovery)
--
-- Broadcast discipline: the keeper signs the vault.transfer first, records
-- attempt_tx_hash BEFORE broadcasting, then sends raw. So:
--   * executing + attempt_tx_hash NULL  → the tx never reached the chain;
--     recover_escrow_intents requeues it to pending once it is stale.
--   * executing + attempt_tx_hash set   → check the receipt: success → sent,
--     reverted → failed, no receipt yet → left executing (NEVER resent
--     blindly — the tx may be in flight).
--
-- The API-facing surface is four service_role functions plus a p_dry_run
-- flag on process_escrow_releases so `POST /internal/keeper?dryRun` can
-- report exactly what a real run would mark and send without writing.

alter table public.payments
  add column status text not null default 'pending'
    check (status in ('pending', 'executing', 'held', 'failed', 'sent')),
  add column resolved_to text check (resolved_to ~ '^0x[0-9a-fA-F]{40}$'),
  -- The charge row's asset verbatim — a token address for real settlements,
  -- a symbol for the legacy sepolia rows; the api resolves the contract.
  add column resolved_token text,
  add column resolved_network text,
  add column attempt_tx_hash text check (attempt_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  add column executing_at timestamptz,
  add column sent_at timestamptz,
  add column attempts integer not null default 0,
  add column last_error text;

-- Everything that already moved money reads 'sent'; open intents read
-- 'pending' (the column default already lands them there).
update public.payments
  set status = 'sent', sent_at = created_at
  where tx_hash is not null;

-- Rows inserted already-paid (charge / service_fee) are 'sent' from the
-- start, not 'pending' — pending is the pre-claim state of an intent.
create or replace function public.payments_status_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tx_hash is not null and new.status = 'pending' then
    new.status := 'sent';
    new.sent_at := coalesce(new.sent_at, now());
  end if;
  return new;
end;
$$;

revoke execute on function public.payments_status_default()
  from public, anon, authenticated;

drop trigger if exists payments_status_default on public.payments;
create trigger payments_status_default
  before insert on public.payments
  for each row execute function public.payments_status_default();

-- The keeper's claim scan.
create index payments_escrow_intent_idx
  on public.payments (status, created_at)
  where kind in ('release', 'refund') and tx_hash is null;

-- pay_to is the corridor at write time — an intent may be written before its
-- destination is resolvable (an Owner release for a Booking whose business
-- has not set a payout_address must still land as a row, so the keeper can
-- hold it 'payout_missing'/'payout_unverified' instead of the release
-- processor dying on the not-null constraint and never retrying). The
-- destination that actually receives funds is resolved live at claim time
-- from businesses.payout_address / the charge's payer — pay_to stays
-- documentary. The 0x-shape check still applies to any non-null value.
alter table public.payments alter column pay_to drop not null;

-- ---------------------------------------------------------------------------
-- process_escrow_releases — same ADR-0006 semantics, now with p_dry_run:
-- when true nothing is written but the would-be release intents are returned
-- (payment_id null — no row exists). `intents` lists what this pass posts
-- (or would post) so the keeper response can tie releases to intent rows.
-- The signature gains a defaulted argument, so the old zero-arg function is
-- dropped first — every caller keeps working.
-- ---------------------------------------------------------------------------
drop function public.process_escrow_releases();

create or replace function public.process_escrow_releases(
  p_dry_run boolean default false
)
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
  v_intents jsonb := '[]'::jsonb;
  v_payment_id uuid;
begin
  for v_b in
    select * from bookings
    where escrow_status in ('funded', 'partially_released')
    order by cancel_deadline
    -- A dry run takes no locks — nothing it sees is committed.
    for update skip locked
  loop
    -- Under p_dry_run the row lock is released unused; the simulation below
    -- only mutates v_b in memory, never the table.
    select b.payout_address into v_owner_pay_to
    from listings l
    join properties p on p.id = l.property_id
    join businesses b on b.id = p.business_id
    where l.id = v_b.listing_id;
    v_rental := v_b.total_minor - v_b.service_fee_minor;

    -- Stage 1: confirmed bookings pass into the stay once check-in day lands.
    if v_b.status = 'confirmed' and v_b.checkin <= current_date and not p_dry_run then
      update bookings set status = 'in_progress' where id = v_b.id;
    end if;

    -- First release: 50% at the Cancellation deadline.
    if v_b.escrow_status = 'funded'
       and v_b.cancel_deadline is not null
       and v_b.cancel_deadline <= current_date
       and v_b.first_release_at is null then
      v_payment_id := null;
      if not p_dry_run then
        insert into payments (booking_id, pay_to, amount_minor, asset, network,
                              facilitator_ref, kind)
          values (v_b.id, v_owner_pay_to, v_rental / 2, v_b.currency, 'celo',
                  v_b.id, 'release')
          returning id into v_payment_id;
        update bookings
          set escrow_status = 'partially_released', first_release_at = now()
          where id = v_b.id;
      end if;
      v_released := v_released || v_b.id;
      -- A dry run resolves the would-be intent too (resolve_escrow_intent is
      -- the same lookup claim_escrow_intents uses) — the operator sees where
      -- the release would land, not just that a row would be posted.
      -- (the parens matter: 'array || obj' appends — only the merged object
      -- may land as a new element)
      v_intents := v_intents || (jsonb_build_object(
        'booking_id', v_b.id, 'payment_id', v_payment_id, 'kind', 'release',
        'stage', 'first', 'amount_minor', v_rental / 2,
        'currency', v_b.currency)
        || case when p_dry_run
             then public.resolve_escrow_intent(v_b.id, 'release')
             else '{}'::jsonb end);
      v_b.escrow_status := 'partially_released';
    end if;

    -- Final release: the rest, 24 h after check-in, no open Claim.
    if v_b.escrow_status = 'partially_released'
       and now() > v_b.checkin::timestamptz + interval '24 hours'
       and v_b.status <> 'claim_open'
       and v_b.final_release_at is null then
      v_payment_id := null;
      if not p_dry_run then
        insert into payments (booking_id, pay_to, amount_minor, asset, network,
                              facilitator_ref, kind)
          values (v_b.id, v_owner_pay_to, v_rental - v_rental / 2,
                  v_b.currency, 'celo', v_b.id, 'release')
          returning id into v_payment_id;
        update bookings
          set escrow_status = 'released', final_release_at = now(),
              status = 'completed'
          where id = v_b.id;
      end if;
      v_released := v_released || v_b.id;
      v_intents := v_intents || (jsonb_build_object(
        'booking_id', v_b.id, 'payment_id', v_payment_id, 'kind', 'release',
        'stage', 'final', 'amount_minor', v_rental - v_rental / 2,
        'currency', v_b.currency)
        || case when p_dry_run
             then public.resolve_escrow_intent(v_b.id, 'release')
             else '{}'::jsonb end);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'released', v_released,
                            'intents', v_intents, 'dry_run', p_dry_run);
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_escrow_intent — THE destination lookup, shared by the claim path
-- (authoritative, under lock) and the dry-run preview (read-only). One
-- function so the two can never drift:
--   release → the Owner's CURRENT businesses.payout_address, and only when
--             payout_verified_at is set (#68). Unverified → 'payout_unverified';
--             no address/business → 'payout_missing'.
--   refund  → the payer of the Booking's charge row — the Traveler's Agent
--             wallet. No charge → 'charge_missing'; missing/malformed payer
--             → 'charge_payer_missing'.
-- Returns {outcome: send|held, to, reason, charge_asset, charge_network}.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_escrow_intent(
  p_booking_id text,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge record;
  v_charge_found boolean;
  v_payout text;
  v_verified timestamptz;
  v_biz_found boolean;
  v_to text;
  v_reason text;
begin
  select payer, asset, network into v_charge
    from payments
    where booking_id = p_booking_id and kind = 'charge'
    order by created_at limit 1;
  v_charge_found := found;

  select b.payout_address, b.payout_verified_at into v_payout, v_verified
    from bookings bk
    join listings l on l.id = bk.listing_id
    join properties pr on pr.id = l.property_id
    join businesses b on b.id = pr.business_id
    where bk.id = p_booking_id;
  v_biz_found := found;

  v_to := null;
  v_reason := null;
  if not v_charge_found then
    v_reason := 'charge_missing';
  elsif p_kind = 'release' then
    if not v_biz_found or v_payout is null then
      v_reason := 'payout_missing';
    elsif v_verified is null then
      v_reason := 'payout_unverified';
    else
      v_to := v_payout;
    end if;
  else -- refund: back to the charge's payer, the Traveler's Agent wallet
    if v_charge.payer is null or v_charge.payer !~ '^0x[0-9a-fA-F]{40}$' then
      v_reason := 'charge_payer_missing';
    else
      v_to := v_charge.payer;
    end if;
  end if;

  return jsonb_build_object(
    'outcome', case when v_to is null then 'held' else 'send' end,
    'to', v_to,
    'reason', v_reason,
    'charge_asset', v_charge.asset,
    'charge_network', v_charge.network);
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_escrow_intents — atomically claims up to p_limit intents for one
-- keeper run and resolves each row's destination in the same transaction.
-- Rows another run holds are skipped (for update skip locked), so two
-- concurrent runs can never pay the same intent twice.
--
-- Resolution, per kind:
--   release → the Owner's CURRENT businesses.payout_address, and only when
--             payout_verified_at is set (#68). Unverified → held
--             'payout_unverified'; no address/business → 'payout_missing'.
--   refund  → the payer of the Booking's charge row — the Traveler's Agent
--             wallet. No charge → 'charge_missing'; missing/malformed payer
--             → 'charge_payer_missing'.
--
-- Sendable rows become 'executing' with resolved_to / resolved_token /
-- resolved_network snapshotted; unresolvable rows become 'held' with the
-- reason in last_error. Held rows stay in the candidate set — once the
-- Owner verifies, the next run sends. p_dry_run runs the same resolution
-- read-only (no locks, no writes) for `POST /internal/keeper?dryRun`.
--
-- Returns a jsonb array, one entry per evaluated row:
--   {payment_id, booking_id, kind, amount_minor, currency, outcome,
--    to, charge_asset, charge_network, reason}
-- outcome 'send' → claimed (executing); 'held' → reason set.
-- ---------------------------------------------------------------------------
create or replace function public.claim_escrow_intents(
  p_limit int default 50,
  p_dry_run boolean default false,
  p_booking_id text default null    -- scope to one Booking's intents
)                                   -- (the operator's first minimal run)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r payments%rowtype;
  v_res jsonb;
  v_to text;
  v_reason text;
  v_outcome text;
  v_out jsonb := '[]'::jsonb;
begin
  for v_r in
    select * from payments
    where kind in ('release', 'refund')
      and tx_hash is null
      and status in ('pending', 'held', 'failed')
      and (p_booking_id is null or booking_id = p_booking_id)
    order by created_at
    limit greatest(p_limit, 1)
    -- Locks are pointless in a dry run — but also harmless: the RPC's
    -- transaction ends with the call. Skip them anyway for clarity.
    for update skip locked
  loop
    v_res := public.resolve_escrow_intent(v_r.booking_id, v_r.kind::text);
    v_to := v_res ->> 'to';
    v_reason := v_res ->> 'reason';
    v_outcome := v_res ->> 'outcome';

    if not p_dry_run then
      if v_outcome = 'held' then
        update payments
          set status = 'held', last_error = v_reason
          where id = v_r.id;
      else
        update payments
          set status = 'executing', executing_at = now(),
              attempts = attempts + 1,
              -- a re-claimed row is a NEW attempt: the previous attempt's
              -- hash stays only until this claim clears it — without this,
              -- record_escrow_attempt would refuse the next signing and the
              -- row could never retry.
              attempt_tx_hash = null,
              resolved_to = v_to,
              resolved_token = v_res ->> 'charge_asset',
              resolved_network = v_res ->> 'charge_network',
              last_error = null
          where id = v_r.id;
      end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'payment_id', v_r.id,
      'booking_id', v_r.booking_id,
      'kind', v_r.kind,
      'amount_minor', v_r.amount_minor,
      'currency', v_r.asset,
      'outcome', v_outcome,
      'to', v_to,
      'charge_asset', v_res ->> 'charge_asset',
      'charge_network', v_res ->> 'charge_network',
      'reason', v_reason);
  end loop;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_escrow_attempt — stamps the signed tx's hash on a claimed row
-- BEFORE it is broadcast. The hash is what makes a crashed run recoverable:
-- executing + hash ⇒ check the receipt; executing + no hash ⇒ provably never
-- broadcast ⇒ safe to requeue. Refuses unless the row is executing and has
-- no attempt hash yet (a second broadcast of one claim is never recorded).
-- ---------------------------------------------------------------------------
create or replace function public.record_escrow_attempt(
  p_payment_id uuid,
  p_tx_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update payments
    set attempt_tx_hash = p_tx_hash
    where id = p_payment_id and status = 'executing'
      and attempt_tx_hash is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_executing',
      'message', 'row is not executing or already has an attempt hash'));
  end if;
  return jsonb_build_object('ok', true, 'payment_id', p_payment_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_escrow_intent — finalizes a claimed row.
--   'sent'   tx_hash required; terminal.
--   'failed' last_error recorded; retryable (back in the candidate set).
--   'held'   last_error recorded; re-evaluated every run.
-- Only an 'executing' row settles — anything else answers not_executing.
-- ---------------------------------------------------------------------------
create or replace function public.settle_escrow_intent(
  p_payment_id uuid,
  p_outcome text,
  p_tx_hash text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_outcome = 'sent' then
    if p_tx_hash is null or p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'invalid_tx_hash', 'message', 'sent needs a 0x…64 hash'));
    end if;
    update payments
      set status = 'sent', tx_hash = p_tx_hash, sent_at = now(),
          last_error = null
      where id = p_payment_id and status = 'executing';
  elsif p_outcome = 'failed' then
    update payments
      set status = 'failed', last_error = left(coalesce(p_error, 'unknown'), 500)
      where id = p_payment_id and status = 'executing';
  elsif p_outcome = 'held' then
    update payments
      set status = 'held', last_error = left(coalesce(p_error, 'unknown'), 500)
      where id = p_payment_id and status = 'executing';
  else
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid_outcome',
      'message', 'outcome must be sent|failed|held'));
  end if;
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_executing', 'message', 'row is not executing'));
  end if;
  return jsonb_build_object('ok', true, 'payment_id', p_payment_id,
                            'status', p_outcome);
end;
$$;

-- ---------------------------------------------------------------------------
-- recover_escrow_intents — the stuck-row path, run at the top of every
-- keeper cycle.
--
--   * executing + attempt_tx_hash NULL + older than p_stale_seconds →
--     back to 'pending'. The hash is recorded before broadcast, so no hash
--     provably means nothing reached the chain — requeueing cannot
--     double-pay. Fresh no-hash rows are left alone (another run may be
--     mid-send right now).
--   * executing + attempt_tx_hash → returned for the api to receipt-check
--     (success → sent, reverted → failed, still absent → left executing;
--     a broadcast that never lands is NEVER auto-resent — the operator
--     reconciles the hash on the explorer, then requeues by hand).
--
-- Returns {requeued: [ids], awaiting: [rows]}. p_dry_run reports without
-- writing.
-- ---------------------------------------------------------------------------
create or replace function public.recover_escrow_intents(
  p_stale_seconds int default 600,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requeued uuid[];
begin
  if p_dry_run then
    select array_agg(id) into v_requeued
      from payments
      where status = 'executing' and attempt_tx_hash is null
        and executing_at < now() - make_interval(secs => p_stale_seconds);
  else
    with u as (
      update payments
        set status = 'pending', executing_at = null
        where status = 'executing' and attempt_tx_hash is null
          and executing_at < now() - make_interval(secs => p_stale_seconds)
        returning id
    )
    select array_agg(id) into v_requeued from u;
  end if;

  return jsonb_build_object(
    'requeued', coalesce(v_requeued, '{}'),
    'awaiting', coalesce((
      select jsonb_agg(jsonb_build_object(
        'payment_id', id,
        'booking_id', booking_id,
        'kind', kind,
        'amount_minor', amount_minor,
        'resolved_to', resolved_to,
        'resolved_token', resolved_token,
        'resolved_network', resolved_network,
        'attempt_tx_hash', attempt_tx_hash,
        'executing_at', executing_at))
      from payments
      where status = 'executing' and attempt_tx_hash is not null), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Lockdown — every function here is invoked by the api with the secret key.
-- ---------------------------------------------------------------------------
revoke execute on function public.process_escrow_releases(boolean)
  from public, anon, authenticated;
grant execute on function public.process_escrow_releases(boolean) to service_role;

revoke execute on function public.resolve_escrow_intent(text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_escrow_intent(text, text) to service_role;

revoke execute on function public.claim_escrow_intents(int, boolean, text)
  from public, anon, authenticated;
grant execute on function public.claim_escrow_intents(int, boolean, text) to service_role;

revoke execute on function public.record_escrow_attempt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_escrow_attempt(uuid, text) to service_role;

revoke execute on function public.settle_escrow_intent(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_escrow_intent(uuid, text, text, text) to service_role;

revoke execute on function public.recover_escrow_intents(int, boolean)
  from public, anon, authenticated;
grant execute on function public.recover_escrow_intents(int, boolean) to service_role;
