-- Supabase Auth -> public.travelers (GitHub issue #15).
--
-- Every new auth.users row gets its matching public.travelers profile so the
-- rest of the platform (credits, bookings, wallets) has a row to hang on.
-- SECURITY DEFINER + pinned search_path means the insert runs with the
-- function owner's privileges and resolves the `travelers` table against the
-- public schema regardless of the caller's search_path. ON CONFLICT DO NOTHING
-- keeps the trigger idempotent (retried signup callbacks, re-signups).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.travelers (id, full_name, phone, country_code)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'country_code'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists handle_new_user on auth.users;
create trigger handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();
