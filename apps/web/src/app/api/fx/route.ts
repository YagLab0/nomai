import { createHmac } from "node:crypto";

import { NextResponse } from "next/server";

import { FALLBACK_USD_RATES, FIAT_OPTIONS, type Fiat } from "@/lib/lodgings";

/**
 * GET /api/fx — fiat-per-USD rates for marketplace price display.
 *
 * Resolution chain:
 *   1. Ripio B2B Ramps "Get Market Rates" — when RIPIO_BASE_URL is set and we
 *      can authenticate: RIPIO_CLIENT_ID/RIPIO_CLIENT_SECRET via the OAuth2
 *      client-credentials flow (POST {base}/oauth2/token/, Basic auth), or a
 *      raw RIPIO_B2B_TOKEN override for manual testing. Ripio quotes
 *      crypto↔fiat pairs, so we read the USDC_{FIAT} legs and treat them as
 *      fiat-per-USD. Coverage gaps (Ripio may not list CLP/UYU) fall through
 *      to the next source for those fiats.
 *   2. open.er-api.com — free public fiat FX, no key, covers all six fiats
 *      (the currencies of the Ripio countries).
 *   3. Static FALLBACK_USD_RATES — last resort, marked source:"static".
 *
 * This is a display estimate only. The firm quote — with the FX fee on top —
 * is what the Agent pulls from Ripio's POST /api/v1/quotes/ at Booking time
 * (ADR-0001). Credentials stay server-side; nothing secret reaches the
 * browser.
 */

export const revalidate = 300; // 5 min — display estimates don't need tick-level freshness

type Rates = Partial<Record<Fiat, number>>;

interface FxPayload {
  /** fiat units per 1 USD */
  rates: Rates;
  source: "ripio" | "public-fx" | "static";
  updatedAt: string | null;
}

const FIATS = FIAT_OPTIONS.map((f) => f.id);

// --- Ripio auth -------------------------------------------------------------

/**
 * Access-token cache. The route module is long-lived (Node runtime / dev
 * server), so a module-scope cache survives across requests. `tokenPromise`
 * dedupes concurrent cold-start requests into a single token exchange.
 */
let ripioToken: { value: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string | null> | null = null;

async function exchangeToken(base: string): Promise<string | null> {
  const id = process.env.RIPIO_CLIENT_ID;
  const secret = process.env.RIPIO_CLIENT_SECRET;
  if (!id || !secret) return null;

  try {
    const res = await fetch(`${base}/oauth2/token/`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store", // never cache a credential exchange
    });
    if (!res.ok) return null;

    const body = await res.json();
    if (!body?.access_token) return null;

    // Refresh a minute early — a stale token fails deeper in the chain.
    const ttlMs = Math.max(0, (Number(body.expires_in) || 0) * 1000 - 60_000);
    ripioToken = { value: body.access_token, expiresAt: Date.now() + ttlMs };
    return ripioToken.value;
  } catch {
    return null;
  }
}

async function getRipioToken(): Promise<string | null> {
  // Manual override — useful to poke the sandbox without provisioning a
  // client_credentials pair yet.
  const staticToken = process.env.RIPIO_B2B_TOKEN;
  if (staticToken) return staticToken;

  if (ripioToken && ripioToken.expiresAt > Date.now()) return ripioToken.value;
  tokenPromise ??= exchangeToken(process.env.RIPIO_BASE_URL!).finally(
    () => (tokenPromise = null),
  );
  return tokenPromise;
}

// --- Rate sources -----------------------------------------------------------

/**
 * Ripio B2B "Get Market Rates" (Ramps API). Requires partner credentials
 * (RIPIO_CLIENT_ID/SECRET) which are issued by Ripio support, not self-service.
 */
async function fromRipioB2B(): Promise<Rates | null> {
  const base = process.env.RIPIO_BASE_URL;
  if (!base) return null;

  const token = await getRipioToken();
  if (!token) return null;

  try {
    const res = await fetch(`${base}/api/v1/rates/`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate },
    });
    if (!res.ok) return null;

    // [{ payment_method_type, rates: [{ pair, final_sell_rate, ... }] }]
    const body: { rates?: { pair: string; final_sell_rate?: number }[] }[] =
      await res.json();

    // final_sell_rate = the all-in rate (Ripio fees included) — closest to
    // what a conversion actually costs the Traveler.
    const usdLeg: Rates = {};
    for (const group of body) {
      for (const r of group.rates ?? []) {
        const match = /^USDC_([A-Z]{3})$/.exec(r.pair);
        if (match && r.final_sell_rate) {
          const fiat = match[1] as Fiat;
          if (FIATS.includes(fiat)) usdLeg[fiat] = r.final_sell_rate;
        }
      }
    }
    // Partial coverage is fine — the caller merges sources per-fiat — but a
    // response with almost nothing is better treated as unreachable.
    return Object.keys(usdLeg).length >= 3 ? usdLeg : null;
  } catch {
    return null;
  }
}

/**
 * Ripio Wallet "Get Rates" — the self-service API the user's credentials hit
 * (API key + HMAC-SHA256 signature, created at app.ripio.com/profile?tab=api).
 *
 * Signature = Base64(HMAC-SHA256(secret, timestamp + method + path + payload)).
 * GET signs the path without query params and an empty payload.
 *
 * Caveat: rates are filtered by the account's country/currency, so coverage
 * outside the account's own market may be partial — the public feed fills in.
 */
async function fromRipioWallet(): Promise<Rates | null> {
  const apiKey = process.env.RIPIO_API_KEY;
  const secret = process.env.RIPIO_API_SECRET;
  if (!apiKey || !secret) return null;

  const base = process.env.RIPIO_WALLET_BASE_URL ?? "https://api.ripio.com";
  const path = "/wallet/rates/";
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}GET${path}`)
    .digest("base64");

  try {
    const res = await fetch(`${base}${path}`, {
      headers: {
        authorization: apiKey,
        timestamp,
        "timestamp-tolerance": "5000",
        signature,
      },
      next: { revalidate },
    });
    if (!res.ok) return null;

    // { data: [{ ticker: "WARS_USD", buy_rate, sell_rate, variation }] }
    const body = await res.json();
    const list: { ticker?: string; buy_rate?: string; sell_rate?: string }[] =
      body?.data ?? [];

    const usdLeg: Rates = {};
    for (const r of list) {
      const ticker = r.ticker ?? "";
      // wFIAT_USD → USD per wFIAT → fiat-per-USD = 1/rate. This is the real
      // stablecoin market price (peg deviation included) — better than a fiat
      // FX feed for what the Traveler actually converts.
      const wfiatUsd = /^W([A-Z]{3})_USD$/.exec(ticker);
      const usdBase = /^USDC_([A-Z]{3})$/.exec(ticker); // USDC_ARS → ARS per USD
      const usdQuote = /^([A-Z]{3})_USDC$/.exec(ticker); // ARS_USDC → USD per ARS
      if (wfiatUsd && FIATS.includes(wfiatUsd[1] as Fiat)) {
        const rate = Number(r.sell_rate ?? r.buy_rate);
        if (rate > 0) usdLeg[wfiatUsd[1] as Fiat] = 1 / rate;
      } else if (usdBase && FIATS.includes(usdBase[1] as Fiat)) {
        const rate = Number(r.buy_rate ?? r.sell_rate);
        if (rate > 0) usdLeg[usdBase[1] as Fiat] ??= rate;
      } else if (usdQuote && FIATS.includes(usdQuote[1] as Fiat)) {
        const rate = Number(r.sell_rate ?? r.buy_rate);
        if (rate > 0) usdLeg[usdQuote[1] as Fiat] ??= 1 / rate;
      }
    }
    return Object.keys(usdLeg).length >= 3 ? usdLeg : null;
  } catch {
    return null;
  }
}

async function fromPublicFx(): Promise<{
  rates: Rates;
  updatedAt: string | null;
} | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate },
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.result !== "success" || !body.rates) return null;

    const rates: Rates = {};
    for (const f of FIATS) {
      if (typeof body.rates[f] === "number") rates[f] = body.rates[f];
    }
    return { rates, updatedAt: body.time_last_update_utc ?? null };
  } catch {
    return null;
  }
}

export async function GET() {
  // Both Ripio sources in parallel: B2B (partner creds) takes precedence over
  // the retail wallet API where both cover a fiat.
  const [ripioB2B, ripioWallet, publicFx] = await Promise.all([
    fromRipioB2B(),
    fromRipioWallet(),
    fromPublicFx(),
  ]);
  const ripio = ripioB2B ?? ripioWallet;

  let payload: FxPayload;
  if (ripio || publicFx) {
    payload = {
      // Ripio legs take precedence where they exist; public FX fills gaps.
      rates: { ...publicFx?.rates, ...ripioWallet, ...ripioB2B },
      source: ripio ? "ripio" : "public-fx",
      updatedAt: publicFx?.updatedAt ?? new Date().toISOString(),
    };
  } else {
    payload = {
      rates: FALLBACK_USD_RATES,
      source: "static",
      updatedAt: null,
    };
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
