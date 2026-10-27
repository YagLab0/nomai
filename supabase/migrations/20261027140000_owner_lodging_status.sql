-- Owner Lodging status: pause / republish from the dashboard. Until now the
-- web panel flipped listings.status through the RLS owner policy — a bare
-- update the table accepts but the platform rules don't want client-side:
-- only the published <-> paused pair is a self-serve transition, ownership is
-- re-verified against the verified session user, and archived stays a
-- one-way door (archive_lodging already guards the Upcoming Booking rule).
--
--   * set_lodging_status(p_user_id, p_listing_id, p_status): security-definer
--     RPC, same contract and lockdown as create_lodging/update_lodging/
--     archive_lodging (20261027130000) — {ok, ...} or {ok:false,
--     error:{code,message}}; EXECUTE is service_role only. The web route
--     verifies the session (auth.getUser) and passes p_user_id; the Owner is
--     resolved from businesses.user_id = p_user_id, never from a business or
--     listing id the client sends.
--
-- Pausing with an Upcoming Booking (GLOSSARY) is allowed on purpose: existing
-- Bookings stand — the pause only takes the Lodging out of the public
-- catalog, the Storefront and new book_stay calls. published_at is stamped
-- the first time a Lodging goes live.

create or replace function public.set_lodging_status(
  p_user_id uuid,
  p_listing_id text,
  p_status listing_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id text;
  v_status listing_status;
  v_business_id text;
begin
  if p_status not in ('published', 'paused') then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid',
      'message', 'status must be published or paused'));
  end if;

  select l.id, l.status, p.business_id into v_listing_id, v_status, v_business_id
  from listings l
  join properties p on p.id = l.property_id
  where l.id = p_listing_id or l.slug = p_listing_id;
  if v_listing_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'not_found', 'message', 'listing not found'));
  end if;
  -- Ownership through the verified session user (service_role has no
  -- auth.uid(), so owns_listing() can't be used here).
  if p_user_id is null or not exists (
    select 1 from businesses bz
    where bz.id = v_business_id and bz.user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'forbidden', 'message', 'not the owner of this listing'));
  end if;
  -- Only the published <-> paused pair is self-serve: 'draft' rows belong to
  -- creation flows and 'archived' is a one-way door (archive_lodging).
  if v_status not in ('published', 'paused') then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'invalid',
      'message', format('a %s listing cannot change status', v_status)));
  end if;

  update listings set
    status = p_status,
    published_at = case
      when p_status = 'published' and published_at is null then now()
      else published_at
    end
  where id = v_listing_id;

  return jsonb_build_object('ok', true, 'listing_id', v_listing_id, 'status', p_status);
end;
$$;

-- service_role only, like every other RPC: it trusts p_user_id, which only
-- the server (after auth.getUser) may supply.
revoke execute on function public.set_lodging_status(uuid, text, listing_status)
  from public, anon, authenticated;
grant execute on function public.set_lodging_status(uuid, text, listing_status)
  to service_role;
