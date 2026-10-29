-- Chat threads — the Traveler's saved Nomito conversations.
--
-- One row per conversation in the /app chat: the title the thread list
-- shows, the eve session pointer (ClientSessionState {sessionId,
-- streamIndex} — reopening a thread reattaches its durable Agent session
-- via client.sessions.attach), and the transcript's stream events the UI
-- replays. archived_at is the soft delete: a chat leaves the list but the
-- row (and its transcript) stays.
--
-- Per-user isolation is RLS, like travelers: every read/write runs on the
-- caller's JWT-scoped client (apps/api/src/chats.ts), so a thread is only
-- ever visible to auth.uid() = traveler_id — a foreign id reads as absent.

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers (id) on delete cascade,
  title text not null default '',
  eve_session jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- The thread list: one Traveler's live chats, most recently active first.
create index chat_threads_traveler_idx
  on public.chat_threads (traveler_id, updated_at desc)
  where archived_at is null;

create trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row execute function public.set_updated_at();

alter table public.chat_threads enable row level security;

create policy chat_threads_select_own on public.chat_threads
  for select using (auth.uid() = traveler_id);
create policy chat_threads_insert_own on public.chat_threads
  for insert with check (auth.uid() = traveler_id);
create policy chat_threads_update_own on public.chat_threads
  for update using (auth.uid() = traveler_id)
  with check (auth.uid() = traveler_id);
create policy chat_threads_delete_own on public.chat_threads
  for delete using (auth.uid() = traveler_id);
