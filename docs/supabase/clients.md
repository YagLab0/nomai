# Clients

Typed `supabase-js` clients per app. Types are generated from the live
schema into `database.types.ts` — regenerate after every migration
(see `cli.md`).

## `apps/web` — `@supabase/ssr`

Three entry points under `src/lib/supabase/`:

### Browser — Client Components

```tsx
"use client";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const { data } = await supabase.from("listings").select("*");
```

Uses the publishable key; RLS applies. Session lives in cookies, shared
with the server side automatically.

### Server — Server Components, Route Handlers, Server Actions

```ts
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();   // async: reads cookies()
const { data } = await supabase
  .from("listings")
  .select("*, properties(name, businesses(name, slug))");
```

Cookie writes from a Server Component are swallowed on purpose — session
refresh is middleware's job.

### Middleware — `src/middleware.ts`

Already wired: calls `updateSession(request)` on every non-static request,
which runs `supabase.auth.getUser()` so expired tokens get refreshed before
the page renders. The matcher skips `_next/static`, `_next/image`,
`favicon.ico`, `images/` and image extensions — keep it that way unless a
route genuinely needs auth refresh.

## `apps/api` — admin client

```ts
import { createSupabaseAdmin } from "./supabase.js";

const supabase = createSupabaseAdmin();
await supabase.from("agent_usage").insert({
  traveler_id, cost_units: 10, kind: "spend", stage: "live_query",
});
```

Authenticates with `SUPABASE_SECRET_KEY` → **bypasses RLS**. Use it for
platform writes the browser must never perform: recording Agent usage,
settling Bookings, creating Agent wallets. `persistSession`/`autoRefreshToken` are
off — there is no user session server-side.

User-scoped API routes (`GET /usage/today`, `POST /usage/record`)
still use the admin client: the caller's Supabase
access token arrives as `Authorization: Bearer` (the web server forwards
`session.access_token` from @supabase/ssr — the chunked SSR cookie is never
parsed upstream) and is verified by passing it to the Auth server,
`admin.auth.getUser(token)` — a deliberate passthrough instead of local JWKS
verification: no extra dependency and it holds whatever signing algorithm
the project uses. The verified `user.id` IS the traveler id
(`travelers.id = auth.users.id`); caller-supplied ids are never trusted.
Caveat: `getUser(jwt)` with an explicit token does not mutate the client,
but `signInWithPassword` would — never sign a user in on the admin client,
or later queries silently run under that user's RLS.

### `apps/api` — user-scoped client

```ts
import { createSupabaseUser } from "./supabase.js";

const supabase = createSupabaseUser(accessToken);   // caller's verified Bearer
await supabase.from("properties").insert({ business_id, … });
```

Publishable key + the caller's access token forwarded as `Authorization` →
**RLS applies**, exactly as the browser session did. `/owners` uses it where
the old web route handlers wrote under the user session (e.g. onboarding's
business/property/draft-listing inserts — `insert`-only policies decide
what lands). Privileged writes still go through the admin client above.

## Patterns to keep

- **Reads the Traveler/Owner can do themselves** (their bookings, their
  usage rows, the marketplace) → web client, RLS does the scoping.
- **Writes that spend or move value** → api admin client, inside a Hono
  route with its own checks (ADR-0002 spend ceilings belong there too).
- **Writes RLS still allows the user** → api user-scoped client with the
  caller's Bearer, never the admin client.
- **Never** create a second Supabase client flavor per request shape — the
  four above cover browser, server render, trusted backend, and trusted
  backend acting as the user.
- If a query needs a column the generated types don't have, the types are
  stale — regenerate, don't cast.
