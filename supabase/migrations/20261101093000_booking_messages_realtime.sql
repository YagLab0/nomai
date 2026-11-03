-- ---------------------------------------------------------------------------
-- booking_messages → Supabase Realtime (ADR-0009).
--
-- The chat thread subscribes to postgres_changes INSERTs on this table from
-- the web client; delivery runs under the subscriber's JWT, so
-- booking_messages_party_read already scopes every event to the two parties
-- (the Traveler and the Lodging's Owner). No new auth layer needed.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'booking_messages'
  ) then
    alter publication supabase_realtime
      add table public.booking_messages;
  end if;
end $$;
