# Environment setup

Per-app `.env` files for a fresh clone. Every `apps/*/.env.template` lists
its variables with comments — copy it and fill in the blanks. `.env*` files
are gitignored; never commit them.

## 1. Copy the templates

```bash
cp apps/web/.env.template apps/web/.env.local
cp apps/api/.env.template apps/api/.env
```

## 2. `apps/web/.env.local`

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tspsaemylnzvdgwtjcrz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Dashboard → Settings → API Keys → `sb_publishable_…` |
| `RIPIO_*` | Optional — without them `/api/fx` uses the free public feed with a static fallback |

## 3. `apps/api/.env`

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://tspsaemylnzvdgwtjcrz.supabase.co` |
| `SUPABASE_SECRET_KEY` | Dashboard → Settings → API Keys → `sb_secret_…` — ask the project owner; **server-only** |
| `SUPABASE_JWKS_URL` | `https://tspsaemylnzvdgwtjcrz.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_DB_PASSWORD` | Postgres password, needed only for CLI `db push`/`db query` |
| `DATABASE_URL` | `postgresql://postgres:<password>@db.tspsaemylnzvdgwtjcrz.supabase.co:5432/postgres` (direct) or the pooler — see the template comment |
| `X402_*`, `BUYER_PRIVATE_KEY` | x402 seller/buyer — see `X402_SETUP.md` and the template comments |

## 4. Repo-root `.env` (CLI work only)

Not needed to run the apps — only if you run migrations or CLI queries:

```bash
SUPABASE_ACCESS_TOKEN=sbp_…        # supabase.com/dashboard/account/tokens (personal)
SUPABASE_DB_PASSWORD=…             # same value as in apps/api/.env
```

## Rules

- `NEXT_PUBLIC_*` → inlined into the client bundle; safe by design (the
  publishable key is constrained by RLS, not secrecy).
- `SUPABASE_SECRET_KEY` → `apps/api` only. Equivalent to the legacy
  `service_role` JWT: bypasses RLS entirely. If it ever reaches the web
  bundle, rotate it immediately (Dashboard → Settings → API Keys).
- `SUPABASE_ACCESS_TOKEN` → personal token for the Management API. Never put
  it in an app env or commit it.
- Sharing keys: the publishable key can go over any channel; the secret key
  and DB password should go through a private channel (password manager
  share link, encrypted DM).

## 5. Verify

```bash
pnpm dev
# web → http://localhost:3000
# api → http://localhost:3001/free  →  {"ok":true,…}
```

## 6. Test users (e2e)

Two e2e accounts (idempotent):

| Rol | Email | Password |
|---|---|---|
| Traveler | `viajera@nomai.dev` | `nomai123` |
| Owner | `duena@nomai.dev` | `nomai123` |

Auth users are created via the Admin API (SQL inserts into `auth.users`
can't log in on hosted projects):

```bash
cd apps/api && node scripts/seed-test-users.mjs   # creates/resets both, links biz_test
```

The Traveler gets a `travelers` row via the `handle_new_user` trigger; the
script links `biz_test` → `prop_test` → published listing `posada-test-centro`
to the Owner. Apply `supabase db query --linked --file supabase/seed.sql` for
inventory data. The same credentials are listed under the login form.
