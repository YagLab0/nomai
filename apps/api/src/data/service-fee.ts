// ADR-0005 Service fee — the platform's revenue line on every Booking, a
// fixed percentage of the rental. Single source of truth is the
// platform_settings.service_fee_pct row (decision D5): the DB trigger
// apply_service_fee reads the same row, so quoting off it keeps the
// charged x402 price equal to the fee the bookings row stores.
//
// getServiceFeePct() is the async read — the supabase leg awaits it inside
// quoteListing(). The mock leg can't await, so it takes
// serviceFeePctSnapshot(): the last cached pct (env fallback before the
// first fetch), kicking a background refresh when the cache is stale so
// the mock converges to the DB value too. env SERVICE_FEE_PCT is only the
// fallback for when the DB read fails or the row is absent.

import { createSupabaseAdmin } from "../supabase.js";
import type { Database } from "../database.types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const SETTINGS_KEY = "service_fee_pct";
const CACHE_TTL_MS = 60_000;

/** env fallback — only when platform_settings can't be read. */
function envFallbackPct(): number {
  const n = Number(process.env.SERVICE_FEE_PCT ?? "7");
  return Number.isFinite(n) ? n : 7;
}

// Lazy module-local admin client, same pattern as data/supabase.ts —
// `undefined` = not attempted yet, `null` = unavailable (env not set).
let admin: SupabaseClient<Database> | null | undefined;

function client(): SupabaseClient<Database> | null {
  if (admin === undefined) {
    try {
      admin = createSupabaseAdmin();
    } catch {
      admin = null;
    }
  }
  return admin;
}

// value is jsonb ('7.0'::jsonb → number); accept numeric strings too.
function parsePct(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

let cached: { pct: number; fetchedAt: number } | null = null;
let inflight: Promise<number> | null = null;

/**
 * Service fee pct from platform_settings.service_fee_pct, cached 60s.
 * Never rejects: a failed read or an absent row resolves to the env
 * fallback (the stale cache is kept for serviceFeePctSnapshot).
 */
export function getServiceFeePct(): Promise<number> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.pct);
  }
  inflight ??= (async () => {
    try {
      const supabase = client();
      if (supabase) {
        const { data, error } = await supabase
          .from("platform_settings")
          .select("value")
          .eq("key", SETTINGS_KEY)
          .limit(1);
        const pct = error ? null : parsePct(data?.[0]?.value);
        if (pct != null) {
          cached = { pct, fetchedAt: Date.now() };
          return pct;
        }
      }
    } catch {
      // fall through to the env fallback
    } finally {
      inflight = null;
    }
    return envFallbackPct();
  })();
  return inflight;
}

/**
 * Last cached pct — or the env fallback before the first fetch — for
 * synchronous callers (the mock repo can't await). A stale/absent cache
 * kicks a background refresh so the mock converges to the DB value.
 */
export function serviceFeePctSnapshot(): number {
  if (!cached || Date.now() - cached.fetchedAt >= CACHE_TTL_MS) {
    void getServiceFeePct(); // never rejects — every path resolves a number
  }
  return cached?.pct ?? envFallbackPct();
}
