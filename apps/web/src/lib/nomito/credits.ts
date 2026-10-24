/**
 * Credits (monedas Nomai) — the web side of the issue #17 spend wiring.
 *
 * The Nomito chat adapters run in the browser but the spend is decided
 * server-side: they call POST /api/credits with only a `stage`, and the
 * route handler prices it from STAGE_COST_MONEDAS before forwarding to
 * apps/api with the Traveler's Bearer token. The browser never sets the
 * amount (a client-supplied price would let a Traveler under-charge their
 * own free grant) and never sees a secret key — the @supabase/ssr session
 * cookie is the only credential in play.
 *
 * Stage costs are sized against the api's ADR-0002 ceilings
 * (FREE_DAILY_PER_ACCOUNT=50, FREE_DAILY_BUDGET=500): a full-priced day is
 * ~9 live queries; the global budget bounds the whole free tier.
 */

export const CREDIT_STAGES = ['conversation', 'cached_inventory', 'live_query'] as const;
export type CreditStage = (typeof CREDIT_STAGES)[number];

export function isCreditStage(value: unknown): value is CreditStage {
  return CREDIT_STAGES.includes(value as CreditStage);
}

/** Price per stage in whole monedas — the api accepts numeric(12,2). */
export const STAGE_COST_MONEDAS: Record<CreditStage, number> = {
  conversation: 1,
  cached_inventory: 2,
  live_query: 5,
};

/**
 * Why a spend was refused, mapped from the api's status codes.
 * - `no-credits`     — 402: balance can't cover the stage (prepaid, never below 0)
 * - `daily-cap`      — 429: the ADR-0002 daily free-tier ceiling (global or per account)
 * - `unauthenticated`— 401: no session — demo/dev mode, proceed uncharged
 * - `unavailable`    — network/5xx: proceed uncharged; the same api serves
 *   /listings, so an unreachable credits api means no live queries anyway
 */
export type SpendErrorCode = 'no-credits' | 'daily-cap' | 'unauthenticated' | 'unavailable';

export type SpendResult =
  | { ok: true; amount: number; balance: number }
  | { ok: false; code: SpendErrorCode };

/** Codes the chat UI translates into Traveler-facing copy. */
export const creditFailureMessage = (code: 'no-credits' | 'daily-cap') =>
  `credits:${code}` as const;

/**
 * Post a stage spend through the session-authenticated proxy. Never throws —
 * a Credits outage degrades to an uncharged turn instead of a broken chat.
 */
export async function spendCredits(
  stage: CreditStage,
  meta?: Record<string, unknown>,
): Promise<SpendResult> {
  let res: Response;
  try {
    res = await fetch('/api/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, meta }),
    });
  } catch {
    return { ok: false, code: 'unavailable' };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => null)) as {
      entry?: { amount?: number | string };
      balance?: number;
    } | null;
    const posted = Math.abs(Number(body?.entry?.amount));
    return {
      ok: true,
      amount: Number.isFinite(posted) && posted > 0 ? posted : STAGE_COST_MONEDAS[stage],
      balance: Number(body?.balance),
    };
  }
  if (res.status === 401) return { ok: false, code: 'unauthenticated' };
  if (res.status === 402) return { ok: false, code: 'no-credits' };
  if (res.status === 429) return { ok: false, code: 'daily-cap' };
  return { ok: false, code: 'unavailable' };
}
