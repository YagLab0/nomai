-- Owner write RLS goes insert-only: the browser can create a draft, never
-- mutate a live row. `listings_owner_write` and `properties_owner_write`
-- were `for all` (20261024025645_publications_model.sql) — a bare update or
-- delete the table accepted but the platform rules never wanted client-
-- side: every Owner mutation already funnels through the service_role-only
-- RPCs (create_lodging/update_lodging/archive_lodging/set_lodging_status,
-- 20261027130000 + 20261027140000) which re-check ownership against the
-- verified session user and enforce the Upcoming Booking rules.
--
--   * properties_owner_insert: an Owner may insert a property for a
--     business they own (owns_business via businesses.user_id = auth.uid()).
--   * listings_owner_insert: an Owner may insert a listing on one of their
--     properties AND only with status = 'draft' — onboarding's stub row.
--     Published/paused/archived states and every later write belong to the
--     RPCs; 'draft' rows become 'published' through create_lodging/
--     update_lodging, never through a client-side update.
--
-- Read policies are untouched (public read on both tables). The onboard
-- route — now POST /owners/onboard in apps/api — keeps doing these inserts
-- with the caller's JWT, so the checks above still decide what lands.

begin;

drop policy listings_owner_write on public.listings;
create policy listings_owner_insert on public.listings
  for insert with check (
    status = 'draft'
    and exists (select 1 from public.properties p
                where p.id = property_id and owns_business(p.business_id)));

drop policy properties_owner_write on public.properties;
create policy properties_owner_insert on public.properties
  for insert with check (owns_business(business_id));

commit;
