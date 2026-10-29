-- Owner payout verification (issue #68; the Escrow keeper #69 only releases
-- to a verified address). The Owner gets paid into their Ripio account: they
-- paste Ripio's deposit address for the Celo network, and because an exchange
-- address can NOT sign, ownership is proven by a test deposit — the platform
-- sends a small unique random amount of the Owner's wFIAT from the ops
-- wallet and the Owner types what Ripio credited.
--
--   * businesses.payout_verified_at — when the current payout_address was
--     verified; NULL = unverified.
--   * businesses.payout_address_set_at — when the Owner last stored the
--     address through PUT /owners/payout (the set_payout_address RPC). Only
--     that RPC stamps it, so the 22 seeded placeholder addresses — and any
--     payout_address that ever lands outside the API — can never be sent a
--     test deposit.
--   * payout_verifications — one row per test deposit: the expected amount
--     lives ONLY here, under RLS with no client policies and no client
--     grants, so it never reaches a browser. One live 'pending' row per
--     business (partial unique index).
--   * Changing payout_address clears payout_verified_at and cancels pending
--     verifications — in a trigger, so it holds no matter where the write
--     comes from.
--   * Lockdown (covers issue #43 point 2): the table-level INSERT/UPDATE
--     grants on businesses become column grants — PostgREST can no longer
--     write payout_address, payout_verified_at, payout_address_set_at or
--     status. Owner contact fields stay editable; onboarding inserts can't
--     smuggle a status or address in either. Platform writes go through the
--     service_role RPCs below.
--
-- Limits (anti ops-float drain): at most one test deposit per business per
-- 24 h — per BUSINESS, stricter than the issue's per-address phrasing,
-- because an Owner cycling addresses would otherwise bypass it entirely.
-- Only deposits that were actually sent (tx_hash set) count.

alter table public.businesses
  add column if not exists payout_verified_at timestamptz;
alter table public.businesses
  add column if not exists payout_address_set_at timestamptz;

create table if not exists public.payout_verifications (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.businesses (id) on delete cascade,
  -- The address the deposit went to — a snapshot: businesses.payout_address
  -- may have moved on by the time anyone reads this.
  address text not null,
  token text not null,
  currency text not null,
  -- Atomic units of `token` (18 decimals for wFIAT). numeric(78,0) because no
  -- client ever reads it and the api passes it as text.
  amount_atomic numeric(78,0) not null,
  tx_hash text,
  attempts integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'failed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists payout_verifications_business_idx
  on public.payout_verifications (business_id, created_at desc);

-- At most one live verification per business — the DB-level backstop under
-- the RPC's check.
create unique index if not exists payout_verifications_one_pending
  on public.payout_verifications (business_id) where status = 'pending';

alter table public.payout_verifications enable row level security;
-- No policies AND no client grants on purpose: anon/authenticated can
-- neither read nor write this table — the expected amount never reaches a
-- client. Only the api's service_role key touches it.
revoke all on public.payout_verifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- businesses_payout_reset — a changed payout_address clears verification and
-- cancels pending deposits. Trigger, so the rule survives every write path.
-- ---------------------------------------------------------------------------
create or replace function public.businesses_payout_reset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payout_address is distinct from old.payout_address then
    new.payout_verified_at := null;
    -- The set_payout_address RPC stamps a fresh set_at in the same write —
    -- kept. Any OTHER path that moves payout_address loses the stamp, so a
    -- deposit can only ever be sent to an address stored via the API.
    if new.payout_address_set_at is not distinct from old.payout_address_set_at then
      new.payout_address_set_at := null;
    end if;
    -- cancelled, not deleted — the sent deposit keeps its audit row.
    update public.payout_verifications
      set status = 'cancelled'
      where business_id = old.id and status = 'pending';
  end if;
  return new;
end;
$$;

revoke execute on function public.businesses_payout_reset()
  from public, anon, authenticated;

drop trigger if exists businesses_payout_reset on public.businesses;
create trigger businesses_payout_reset
  before update on public.businesses
  for each row execute function public.businesses_payout_reset();

-- ---------------------------------------------------------------------------
-- set_payout_address — the ONLY writer of businesses.payout_address now that
-- column grants close the direct PostgREST update. The api calls it with the
-- verified Bearer user id; the Owner is resolved inside
-- (businesses.user_id = p_user_id), never from a client-sent business id.
-- Stamping payout_address_set_at = now() is what makes the address testable
-- — a deposit is only ever sent to an address the Owner stored via the API.
-- ---------------------------------------------------------------------------
create or replace function public.set_payout_address(p_user_id uuid, p_address text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business businesses%rowtype;
begin
  if p_address is null or p_address !~ '^0x[0-9a-fA-F]{40}$' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid', 'message', 'invalid address'));
  end if;
  select * into v_business from businesses where user_id = p_user_id;
  if p_user_id is null or not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'no business linked to this account'));
  end if;
  update businesses
    set payout_address = p_address, payout_address_set_at = now()
    where id = v_business.id
    returning payout_address, payout_verified_at
    into v_business.payout_address, v_business.payout_verified_at;
  return jsonb_build_object(
    'ok', true,
    'payout_address', v_business.payout_address,
    'payout_verified_at', v_business.payout_verified_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_payout_verification — opens the row for a test deposit BEFORE the api
-- sends it (tx_hash lands afterwards). Everything the api pre-checked is
-- re-checked here atomically, so a racing call can never slip a second send
-- past the limits:
--   * the address must still be the business's stored payout_address
--     ('address_changed' when it moved between PUT and verify)
--   * no other live 'pending' row               → 'verification_pending'
--   * no deposit sent in the last 24 h          → 'verification_cooldown'
-- Rows whose expires_at passed are swept to 'expired' first so a stale
-- pending never blocks a retry.
-- ---------------------------------------------------------------------------
create or replace function public.start_payout_verification(
  p_user_id uuid,
  p_address text,
  p_token text,
  p_currency text,
  p_amount_atomic text,
  p_ttl_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_pending payout_verifications%rowtype;
  v_retry_at timestamptz;
begin
  select * into v_business from businesses where user_id = p_user_id;
  if p_user_id is null or not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'no business linked to this account'));
  end if;
  -- Case-insensitive compare: the api checksums before storing, but the
  -- column may hold a lowercase paste.
  if v_business.payout_address is null
     or lower(v_business.payout_address) <> lower(p_address) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'address_changed', 'message', 'payout address changed — save it first'));
  end if;

  update payout_verifications set status = 'expired'
    where business_id = v_business.id and status = 'pending' and expires_at <= now();

  select * into v_pending from payout_verifications
    where business_id = v_business.id and status = 'pending';
  if found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'verification_pending',
      'message', 'a verification is already in flight',
      'expires_at', v_pending.expires_at));
  end if;

  select max(created_at) + interval '24 hours' into v_retry_at
    from payout_verifications
    where business_id = v_business.id and tx_hash is not null;
  if v_retry_at is not null and v_retry_at > now() then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'verification_cooldown',
      'message', 'one test deposit per business every 24 hours',
      'retry_at', v_retry_at));
  end if;

  insert into payout_verifications
    (business_id, address, token, currency, amount_atomic, expires_at)
    values (
      v_business.id, p_address, p_token, p_currency, p_amount_atomic::numeric,
      now() + make_interval(secs => greatest(p_ttl_seconds, 60)))
    returning id, expires_at into v_pending.id, v_pending.expires_at;

  return jsonb_build_object('ok', true, 'verification', jsonb_build_object(
    'id', v_pending.id, 'expires_at', v_pending.expires_at));
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_payout_verification — the Owner types what Ripio credited. An
-- exact match (atomic units) verifies the address and stamps
-- businesses.payout_verified_at; a miss spends one of 3 attempts, and the
-- third closes the verification as 'failed' — a new one must be started
-- (subject to the 24 h limit). The expected amount never leaves this table.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_payout_verification(
  p_user_id uuid,
  p_amount_atomic text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business businesses%rowtype;
  v_ver payout_verifications%rowtype;
  v_swept integer;
  v_attempts integer;
begin
  select * into v_business from businesses where user_id = p_user_id;
  if p_user_id is null or not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'no business linked to this account'));
  end if;

  update payout_verifications set status = 'expired'
    where business_id = v_business.id and status = 'pending' and expires_at <= now();
  get diagnostics v_swept = row_count;

  select * into v_ver from payout_verifications
    where business_id = v_business.id and status = 'pending'
    order by created_at desc limit 1
    for update;
  if not found then
    if v_swept > 0 then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'verification_expired',
        'message', 'the verification expired — start a new one'));
    end if;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'no_pending_verification',
      'message', 'no verification in flight'));
  end if;

  if v_ver.amount_atomic = p_amount_atomic::numeric then
    update payout_verifications set status = 'verified' where id = v_ver.id;
    update businesses set payout_verified_at = now() where id = v_business.id
      returning payout_verified_at into v_business.payout_verified_at;
    return jsonb_build_object('ok', true,
      'verified_at', v_business.payout_verified_at);
  end if;

  v_attempts := v_ver.attempts + 1;
  if v_attempts >= 3 then
    update payout_verifications set attempts = v_attempts, status = 'failed'
      where id = v_ver.id;
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'verification_failed',
      'message', 'three wrong amounts — the verification was voided',
      'attempts_left', 0));
  end if;

  update payout_verifications set attempts = v_attempts where id = v_ver.id;
  return jsonb_build_object('ok', false, 'error', jsonb_build_object(
    'code', 'amount_mismatch',
    'message', 'that is not the amount that was sent',
    'attempts_left', 3 - v_attempts));
end;
$$;

-- Drop the superseded numeric-signature variants (the first draft took
-- numeric amounts; text carries the exact decimal string — atomic units
-- exceed 2^53, so a JSON number would lose precision).
drop function if exists public.start_payout_verification(uuid, text, text, text, numeric, integer);
drop function if exists public.confirm_payout_verification(uuid, numeric);

-- service_role only, like every other RPC: they trust p_user_id, which only
-- the server (after auth.getUser) may supply.
revoke execute on function public.set_payout_address(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_payout_address(uuid, text) to service_role;

revoke execute on function public.start_payout_verification(uuid, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.start_payout_verification(uuid, text, text, text, text, integer)
  to service_role;

revoke execute on function public.confirm_payout_verification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.confirm_payout_verification(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Lockdown (#43 point 2): PostgREST can no longer write payout_address,
-- payout_verified_at, payout_address_set_at or status. Table-level INSERT /
-- UPDATE go away; the Owner keeps column-level grants on contact data and
-- onboarding columns. Inserts can no longer smuggle a status or an address
-- (they take the column defaults: 'pending' / NULL).
-- ---------------------------------------------------------------------------
revoke update on public.businesses from anon, authenticated;
revoke insert on public.businesses from anon, authenticated;

grant update (name, legal_name, tax_id, email, phone)
  on public.businesses to authenticated;
grant insert (id, name, slug, legal_name, tax_id, email, phone, user_id)
  on public.businesses to authenticated;

-- The policy also gains WITH CHECK so an Owner can't rewrite user_id out
-- from under themselves (the claim path is service_role — unaffected).
drop policy if exists businesses_owner_update on public.businesses;
create policy businesses_owner_update on public.businesses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
