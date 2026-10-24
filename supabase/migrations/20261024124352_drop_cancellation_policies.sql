-- ADR-0006 established one global Cancellation rule (5-day deadline, 50%
-- inside it). cancel_booking no longer reads per-business policies, so the
-- table is dropped along with the listing FK.
alter table public.listings drop column cancel_policy_id;
drop table public.cancellation_policies;
