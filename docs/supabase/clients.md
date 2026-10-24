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
const { data } = await supabase.from("lodgings").select("*");
```

Uses the publishable key; RLS applies. Session lives in cookies, shared
with the server side automatically.

### Server — Server Components, Route Handlers, Server Actions

```ts
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient();   // async: reads cookies()
const { data } = await supabase
  .from("lodgings")
  .select("*, owners(name, slug)");
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
await supabase.from("credit_ledger").insert({
  traveler_id, amount: -3, kind: "spend", stage: "live_query",
});
```

Authenticates with `SUPABASE_SECRET_KEY` → **bypasses RLS**. Use it for
platform writes the browser must never perform: posting Credits, settling
Bookings, creating Agent wallets. `persistSession`/`autoRefreshToken` are
off — there is no user session server-side.

## Patterns to keep

- **Reads the Traveler/Owner can do themselves** (their bookings, their
  credits, the marketplace) → web client, RLS does the scoping.
- **Writes that spend or move value** → api admin client, inside a Hono
  route with its own checks (ADR-0002 spend ceilings belong there too).
- **Never** create a second Supabase client flavor per request shape — the
  three above cover browser, server render, and trusted backend.
- If a query needs a column the generated types don't have, the types are
  stale — regenerate, don't cast.
