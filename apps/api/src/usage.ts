// Agent usage metering — ADR-0002 free-tier abuse controls. There is no
// balance: Credits (monedas Nomai) were retired by the Service fee
// (ADR-0005), so no grants, no purchases, nothing to top up. The daily
// caps below are the only gate here; upstream, the agent wallet's own
// on-chain balance is the hard spend cap.
//
// `agent_usage` is the append-only ledger of what the Agent cost each
// Traveler: `kind='spend'` rows carry a POSITIVE `cost_units` priced
// server-side per stage — the caller reports WHICH stage ran, never the
// cost — and `kind='adjustment'` is ops bookkeeping. `stage` tells
// conversation / cached_inventory / live_query apart; `reference` is the
// caller's idempotency key (partial unique index on
// (traveler_id, reference)).
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
// Units: cost_units is numeric(12,2) end to end, never float math. Sums run
// in integer hundredths (this PostgREST has aggregates disabled — "Use of
// aggregate functions is not allowed" — so the column is fetched and
// totalled without drift).

import { Hono } from "hono";
import { supabaseAdmin, travelerIdFrom } from "./auth.js";
import type { Json } from "./database.types.js";

const USAGE_STAGES = [
  "conversation",
  "cached_inventory",
  "live_query",
] as const;
type UsageStage = (typeof USAGE_STAGES)[number];

// ---------------------------------------------------------------------------
// config — ADR-0002 daily ceilings and per-stage costs, all in whole units
// ---------------------------------------------------------------------------

/** Positive numeric env, falling back when unset or invalid. */
function envAmount(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Daily ceiling in units; `0` (or negative) disables that axis. */
function envCap(name: string, fallback: number): number | null {
  const raw = process.env[name];
  if (raw != null && raw !== "" && Number(raw) <= 0) return null;
  return envAmount(name, fallback);
}

/**
 * What one recorded call of each stage costs, in usage units. The Agent
 * reports the stage; the price is ours — a meter reading, not an invoice
 * the caller fills in.
 */
const STAGE_COST_UNITS: Record<UsageStage, () => number> = {
  conversation: () => envAmount("USAGE_COST_CONVERSATION", 1),
  cached_inventory: () => envAmount("USAGE_COST_CACHED_INVENTORY", 5),
  live_query: () => envAmount("USAGE_COST_LIVE_QUERY", 10),
};

const DAILY_FREE_BUDGET = () => envCap("FREE_DAILY_BUDGET", 500);
const DAILY_FREE_PER_ACCOUNT = () => envCap("FREE_DAILY_PER_ACCOUNT", 50);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function toHundredths(units: string | number): number {
  return Math.round(Number(units) * 100);
}

/**
 * Units spent today (UTC) — `kind='spend'` rows are positive, so this
 * returns a positive total. With `travelerId` it's the per-account figure
 * for the ADR-0002 ceiling; without it, the global one.
 */
async function dailySpendHundredths(travelerId?: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let q = supabaseAdmin()
    .from("agent_usage")
    .select("cost_units")
    .eq("kind", "spend")
    .gte("created_at", today.toISOString());
  if (travelerId) q = q.eq("traveler_id", travelerId);
  const { data, error } = await q;
  if (error) throw error;
  return data.reduce((c, r) => c + toHundredths(r.cost_units), 0);
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

const usage = new Hono();

// GET /usage/today — the Traveler's spend so far today vs the per-account
// daily cap. `cap_units`/`remaining_units` are null when the cap axis is
// disabled (FREE_DAILY_PER_ACCOUNT=0).
usage.get("/today", async (c) => {
  const travelerId = await travelerIdFrom(c);
  if (!travelerId) return c.json({ error: "unauthorized" }, 401);

  const used = (await dailySpendHundredths(travelerId)) / 100;
  const cap = DAILY_FREE_PER_ACCOUNT();
  return c.json({
    used_units: used,
    cap_units: cap,
    remaining_units: cap == null ? null : Math.max(0, cap - used),
  });
});

// POST /usage/record — the Nomito adapter / Agent tools wire stage costs
// here. Body: { stage, reference?, meta? }. `stage` is required so the
// ledger can tell conversation / cached_inventory / live_query apart; the
// cost is priced server-side from STAGE_COST_UNITS.
//
// ADR-0002: before a live_query spend, today's free spend is checked
// globally and per account — 429 before any paid API is touched.
usage.post("/record", async (c) => {
  const travelerId = await travelerIdFrom(c);
  if (!travelerId) return c.json({ error: "unauthorized" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    stage?: string;
    reference?: string | null;
    meta?: Json;
  } | null;

  if (!USAGE_STAGES.includes(body?.stage as UsageStage))
    return c.json(
      { error: `stage must be one of ${USAGE_STAGES.join(", ")}` },
      400
    );
  const stage = body!.stage as UsageStage;
  const costUnits = STAGE_COST_UNITS[stage]();

  if (stage === "live_query") {
    const cost = toHundredths(costUnits);
    const [globalSpent, accountSpent] = await Promise.all([
      dailySpendHundredths(),
      dailySpendHundredths(travelerId),
    ]);
    const globalCap = DAILY_FREE_BUDGET();
    const accountCap = DAILY_FREE_PER_ACCOUNT();
    if (globalCap != null && globalSpent + cost > toHundredths(globalCap))
      return c.json(
        { error: "daily free-tier budget exceeded", scope: "global" },
        429
      );
    if (accountCap != null && accountSpent + cost > toHundredths(accountCap))
      return c.json(
        { error: "daily free-tier budget exceeded", scope: "account" },
        429
      );
  }

  const { data: row, error } = await supabaseAdmin()
    .from("agent_usage")
    .insert({
      traveler_id: travelerId,
      cost_units: costUnits,
      kind: "spend",
      stage,
      reference: body?.reference ?? null,
      meta: body?.meta ?? {},
    })
    .select()
    .single();
  if (error) throw error;

  return c.json(
    { entry: { id: row.id, cost_units: row.cost_units, stage: row.stage } },
    201
  );
});

export default usage;
