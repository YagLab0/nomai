// Credits (monedas Nomai) — ledger helpers + HTTP surface (issue #17).
//
// `credit_ledger` is the only source of truth for a Traveler's balance:
// balance = sum(amount), positive for purchases and free grants, negative for
// Agent spend (ADR-0001). RLS lets a Traveler SELECT their own rows, but
// every write is a platform write through the admin client — the browser
// never posts to the ledger (docs/supabase/clients.md).
//
// Auth: callers send the Supabase access token as `Authorization: Bearer`.
// The web server extracts `session.access_token` (@supabase/ssr) and forwards
// it; the chunked SSR cookie is never parsed here. The token is verified by
// passing it through to the Auth server (`admin.auth.getUser`) instead of
// verifying JWKS locally — the passthrough costs one Auth call per request
// but adds no dependency and holds regardless of the project's signing-key
// algorithm. The verified user id IS the traveler id
// (travelers.id = auth.users.id), so no caller-supplied id is ever trusted.
//
// Amounts: numeric(12,2) end to end, never float math. Inputs are validated
// to ≤10 integer digits and ≤2 decimals and posted as decimal strings; sums
// run in integer cents (this PostgREST has aggregates disabled — "Use of
// aggregate functions is not allowed" — so amount columns are fetched and
// totalled without drift).

import { Hono } from "hono";
import type { Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "./supabase.js";
import type { Database, Json } from "./database.types.js";

type CreditRow = Database["public"]["Tables"]["credit_ledger"]["Row"];

const CREDIT_KINDS = [
  "purchase",
  "free_grant",
  "spend",
  "refund",
  "adjustment",
] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

const CREDIT_STAGES = [
  "conversation",
  "cached_inventory",
  "live_query",
] as const;
export type CreditStage = (typeof CREDIT_STAGES)[number];

// numeric(12,2): up to 10 integer digits plus up to 2 decimals, never 0.
const AMOUNT_RE = /^-?\d{1,10}(\.\d{1,2})?$/;

let admin: SupabaseClient<Database> | null = null;

function client(): SupabaseClient<Database> {
  if (!admin) admin = createSupabaseAdmin();
  return admin;
}

// ---------------------------------------------------------------------------
// config — ADR-0002 grant tiers and daily ceilings, all in whole Credits
// ---------------------------------------------------------------------------

/** Positive numeric env, falling back when unset or invalid. */
function envAmount(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Daily ceiling in Credits; `0` (or negative) disables that axis. */
function envCap(name: string, fallback: number): number | null {
  const raw = process.env[name];
  if (raw != null && raw !== "" && Number(raw) <= 0) return null;
  return envAmount(name, fallback);
}

const FREE_GRANTS = {
  phone: () => envAmount("FREE_GRANT_PHONE", 50),
  funded: () => envAmount("FREE_GRANT_FUNDED", 200),
} as const;

const DAILY_FREE_BUDGET = () => envCap("FREE_DAILY_BUDGET", 500);
const DAILY_FREE_PER_ACCOUNT = () => envCap("FREE_DAILY_PER_ACCOUNT", 50);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * A decimal string acceptable to numeric(12,2), or null. Numbers are
 * re-serialized so 3.50 and "3.50" mean the same thing; anything with more
 * than 2 decimals or non-numeric garbage is rejected rather than rounded —
 * money is never silently bent into shape.
 */
export function parseCreditAmount(input: unknown): string | null {
  const s = typeof input === "number" ? String(input) : input;
  if (typeof s !== "string" || !AMOUNT_RE.test(s.trim())) return null;
  const v = s.trim();
  return v === "0" || v === "-0" || v === "0.0" || v === "0.00" ? null : v;
}

function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}

/** Verified Traveler id from the request's Bearer token (see file header). */
export async function travelerIdFrom(c: Context): Promise<string | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "");
  if (!m) return null;
  const { data, error } = await client().auth.getUser(m[1]);
  return error || !data.user ? null : data.user.id;
}

/**
 * Append a ledger row. `amount` keeps the caller's sign: positive for
 * purchases/grants/refunds coming in, negative for spend. `stage` records
 * which Agent search stage produced the spend — null everywhere else.
 */
export async function postCredit(
  travelerId: string,
  amount: string | number,
  kind: CreditKind,
  stage?: CreditStage | null,
  bookingId?: string | null,
  reference?: string | null,
  meta?: Json
): Promise<CreditRow> {
  const parsed = parseCreditAmount(amount);
  if (parsed == null)
    throw new Error(`invalid credit amount for numeric(12,2): ${amount}`);
  if (!CREDIT_KINDS.includes(kind)) throw new Error(`invalid kind: ${kind}`);
  if (stage != null && !CREDIT_STAGES.includes(stage))
    throw new Error(`invalid stage: ${stage}`);

  const { data, error } = await client()
    .from("credit_ledger")
    .insert({
      traveler_id: travelerId,
      amount: Number(parsed),
      kind,
      stage: stage ?? null,
      booking_id: bookingId ?? null,
      reference: reference ?? null,
      meta: meta ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Balance = sum(amount) — exact, totalled in integer cents. */
export async function getBalance(travelerId: string): Promise<number> {
  const { data, error } = await client()
    .from("credit_ledger")
    .select("amount")
    .eq("traveler_id", travelerId);
  if (error) throw error;
  return data.reduce((c, r) => c + toCents(r.amount), 0) / 100;
}

/**
 * Credits spent today (UTC) — `kind='spend'` rows are negative, so this
 * returns a positive total. With `travelerId` it's the per-account figure
 * for the ADR-0002 ceiling; without it, the global one.
 */
async function dailySpendCents(travelerId?: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let q = client()
    .from("credit_ledger")
    .select("amount")
    .eq("kind", "spend")
    .gte("created_at", today.toISOString());
  if (travelerId) q = q.eq("traveler_id", travelerId);
  const { data, error } = await q;
  if (error) throw error;
  return data.reduce((c, r) => c + toCents(-r.amount), 0);
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

const credits = new Hono();

// GET /credits/balance — the Traveler's own balance, scoped by the Bearer
// token. RLS would scope the same rows to auth.uid(); we use the admin
// client with the verified id instead so one client flavor covers both the
// read and the platform writes this router owns.
credits.get("/balance", async (c) => {
  const travelerId = await travelerIdFrom(c);
  if (!travelerId) return c.json({ error: "unauthorized" }, 401);
  return c.json({ traveler_id: travelerId, balance: await getBalance(travelerId) });
});

// POST /credits/spend — internal: the Nomito adapter wires its stage costs
// here. Body: { amount, stage, booking_id?, reference?, meta? } where amount
// is the POSITIVE cost — the row is posted negative. stage is required so
// the ledger can tell conversation / cached_inventory / live_query apart.
//
// ADR-0002: before a live_query spend, today's free spend is checked
// globally and per account — 429 before any paid API is touched. The check
// counts all spend rows as "free" for now; once purchases exist it can be
// narrowed to grant-funded accounts. Spend also can't take the balance
// below zero — Credits are prepaid, never credit in the banking sense.
credits.post("/spend", async (c) => {
  const travelerId = await travelerIdFrom(c);
  if (!travelerId) return c.json({ error: "unauthorized" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    amount?: unknown;
    stage?: string;
    booking_id?: string | null;
    reference?: string | null;
    meta?: Json;
  } | null;

  const amount = parseCreditAmount(body?.amount);
  if (amount == null || Number(amount) <= 0)
    return c.json({ error: "amount must be a positive numeric(12,2) cost" }, 400);
  if (!CREDIT_STAGES.includes(body?.stage as CreditStage))
    return c.json(
      { error: `stage must be one of ${CREDIT_STAGES.join(", ")}` },
      400
    );
  const stage = body!.stage as CreditStage;

  if (stage === "live_query") {
    const cost = toCents(amount);
    const [globalSpent, accountSpent] = await Promise.all([
      dailySpendCents(),
      dailySpendCents(travelerId),
    ]);
    const globalCap = DAILY_FREE_BUDGET();
    const accountCap = DAILY_FREE_PER_ACCOUNT();
    if (globalCap != null && globalSpent + cost > toCents(globalCap))
      return c.json(
        { error: "daily free-tier budget exceeded", scope: "global" },
        429
      );
    if (accountCap != null && accountSpent + cost > toCents(accountCap))
      return c.json(
        { error: "daily free-tier budget exceeded", scope: "account" },
        429
      );
  }

  const balance = await getBalance(travelerId);
  if (balance < Number(amount))
    return c.json({ error: "insufficient credits", balance }, 402);

  const row = await postCredit(
    travelerId,
    `-${amount}`,
    "spend",
    stage,
    body?.booking_id ?? null,
    body?.reference ?? null,
    body?.meta ?? {}
  );
  return c.json(
    {
      entry: { id: row.id, amount: row.amount, stage: row.stage },
      balance: Math.round((balance - Number(amount)) * 100) / 100,
    },
    201
  );
});

// POST /credits/grant — releases a free grant when the Traveler reaches a
// verification tier (ADR-0002). Body: { tier: "phone" | "funded" }.
//   phone  → +FREE_GRANT_PHONE once phone_verified_at is set
//   funded → +FREE_GRANT_FUNDED once funded_at OR self_verified_at is set
// The verification timestamps are only ever set by trusted flows, so the
// Traveler can claim their own tier — nothing here takes the caller's word
// for it. Idempotent via reference `free_grant:<tier>`: a second claim
// reports already_granted instead of posting twice. (The check-then-insert
// pair can race under concurrent claims; a partial unique index on
// (traveler_id, reference) would close it if it ever matters.)
credits.post("/grant", async (c) => {
  const travelerId = await travelerIdFrom(c);
  if (!travelerId) return c.json({ error: "unauthorized" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    tier?: string;
  } | null;
  const tier = body?.tier;
  if (tier !== "phone" && tier !== "funded")
    return c.json({ error: 'tier must be "phone" or "funded"' }, 400);

  const { data: traveler, error } = await client()
    .from("travelers")
    .select("phone_verified_at, funded_at, self_verified_at")
    .eq("id", travelerId)
    .maybeSingle();
  if (error) throw error;
  if (!traveler) return c.json({ error: "traveler not found" }, 404);

  const reached =
    tier === "phone"
      ? traveler.phone_verified_at != null
      : traveler.funded_at != null || traveler.self_verified_at != null;
  if (!reached)
    return c.json({ error: `verification tier "${tier}" not reached` }, 403);

  const reference = `free_grant:${tier}`;
  const { data: existing, error: qErr } = await client()
    .from("credit_ledger")
    .select("id")
    .eq("traveler_id", travelerId)
    .eq("kind", "free_grant")
    .eq("reference", reference)
    .maybeSingle();
  if (qErr) throw qErr;
  if (existing)
    return c.json({
      status: "already_granted",
      balance: await getBalance(travelerId),
    });

  const amount = FREE_GRANTS[tier]();
  const row = await postCredit(travelerId, amount, "free_grant", null, null, reference, {
    tier,
  });
  return c.json(
    {
      status: "granted",
      amount: row.amount,
      balance: await getBalance(travelerId),
    },
    201
  );
});

export default credits;
