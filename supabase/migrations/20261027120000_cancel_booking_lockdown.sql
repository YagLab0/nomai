-- cancel_booking — service_role only, completing the RPC lockdown.
-- Supervisor review of 3d84b44 (.context/work/pendientes-db/reviews/).
--
--   20261024150000 revoked EXECUTE on the five escrow RPCs and
--   20261026120000 did the same for book_stay, leaving cancel_booking as
--   the last function anon/authenticated could reach through PostgREST.
--   It self-authorizes with caller-supplied p_guest_ref / p_traveler_id —
--   and guest_ref is a readable label, not a secret, so anyone who learns
--   either value could cancel a Traveler's confirmed booking and release
--   the held nights.
--
--   Nothing in the repo calls it over PostgREST: the api invokes it with
--   the service-role client (data/supabase.ts) behind
--   POST /bookings/:id/cancel, where the Bearer token is verified and the
--   Traveler is matched before the RPC runs — a strictly stronger check
--   than trusting the caller's traveler_id. Traveler-initiated
--   cancellation (ADR-0004) keeps working through that route.

revoke execute on function public.cancel_booking(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_booking(text, text, uuid)
  to service_role;
