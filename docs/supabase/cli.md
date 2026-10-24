# CLI workflows

The repo is linked to `tspsaemylnzvdgwtjcrz`. Most commands below need the
repo-root `.env` loaded (`SUPABASE_ACCESS_TOKEN`, and `SUPABASE_DB_PASSWORD`
for anything that touches Postgres directly):

```bash
set -a && . ./.env && set +a
```

## Migrations

```bash
# new migration file
supabase migration new <name>

# push pending migrations to the linked project
supabase db push

# pull schema changes made in the dashboard into a migration
supabase db pull <name>

# ad-hoc SQL against the linked DB
supabase db query --linked "select count(*) from lodgings"
supabase db query --linked --file supabase/seed.sql
```

Rules:

- **Never edit a migration that was already pushed** — the remote history
  tracks checksums. Add a new migration instead (see
  `…_lodging_ratings.sql` for an example).
- `db push` applies files in `supabase/migrations/` in order; the remote
  records them in `supabase_migrations.schema_migrations`.

## Seed

`supabase/seed.sql` is **generated** from the marketplace mock — the mock
stays the single source of truth while the UI still renders it:

```bash
cd apps/web && ../api/node_modules/.bin/tsx scripts/gen-seed.ts > ../../supabase/seed.sql
supabase db query --linked --file supabase/seed.sql   # apply to linked DB
```

The inserts are idempotent (`on conflict (slug) do nothing`) — re-running
is safe.

## Types

```bash
supabase gen types typescript --linked > apps/web/src/lib/supabase/database.types.ts
cp apps/web/src/lib/supabase/database.types.ts apps/api/src/database.types.ts
```

Run this after every pushed migration. The web copy is the source; the api
copy is a plain duplicate (no shared package today).

## Auth / linking

```bash
supabase login                       # browser OAuth, writes ~/.supabase
# or non-interactive:
SUPABASE_ACCESS_TOKEN=sbp_… supabase link --project-ref tspsaemylnzvdgwtjcrz

supabase projects api-keys --project-ref tspsaemylnzvdgwtjcrz   # list keys
```

`SUPABASE_DB_PASSWORD` in the env skips the interactive password prompt on
`db push`, `db query`, `db pull`.

## Useful checks

```bash
# does a table respond over PostgREST with the publishable key?
curl -s -o /dev/null -w "%{http_code}\n" \
  "$SUPABASE_URL/rest/v1/lodgings?select=slug&limit=1" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
```
