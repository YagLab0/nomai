import { Hono, type Context } from "hono";
import {
  keccak256,
  stringToHex,
  createPublicClient,
  http,
  formatUnits,
  erc20Abi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSupabaseAdmin } from "./supabase.js";
import { supabaseAdmin, travelerIdFrom } from "./auth.js";
import { CONFIG, COUNTRY_WFIAT, WFIAT } from "./x402.js";

const router = new Hono();

export const publicClient = createPublicClient({
  chain: CONFIG.chain,
  transport: http(CONFIG.rpc),
});

/**
 * Deterministically derives a Celo/EVM address for a Traveler's agent wallet
 * from the platform master secret and the traveler's UUID.
 *
 * Testnet custody (ADR-0003):
 * - Key material is NEVER stored in the database.
 * - The DB stores only address, network, and traveler_id in public.agent_wallets.
 * - The keyRef conceptual identifier documents the derivation path.
 */
export function deriveAgentWallet(travelerId: string): { address: Address; keyRef: string } {
  const masterSecret = process.env.AGENT_WALLET_MASTER_SECRET;
  if (!masterSecret) {
    throw new Error("AGENT_WALLET_MASTER_SECRET is not set");
  }
  const seed = `${masterSecret}:${travelerId}`;
  const privateKey = keccak256(stringToHex(seed));
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    keyRef: `env:AGENT_WALLET_MASTER_SECRET#${travelerId}`,
  };
}

/**
 * Provisions an agent_wallet row for a traveler if one does not already exist.
 * Idempotent (unique constraint on traveler_id).
 */
export async function provisionAgentWallet(travelerId: string) {
  try {
    const supabase = createSupabaseAdmin();

    // Check if wallet already exists
    const { data: existing, error: fetchError } = await supabase
      .from("agent_wallets")
      .select("id, traveler_id, address, network, created_at")
      .eq("traveler_id", travelerId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to query agent_wallets: ${fetchError.message}`);
    }

    if (existing) {
      return existing;
    }

    const { address } = deriveAgentWallet(travelerId);

    const { data: inserted, error: insertError } = await supabase
      .from("agent_wallets")
      .insert({
        traveler_id: travelerId,
        address,
        network: CONFIG.name,
      })
      .select("id, traveler_id, address, network, created_at")
      .single();

    if (insertError) {
      // In case of concurrent race condition, check again
      if (insertError.code === "23505") {
        const { data: raceExisting } = await supabase
          .from("agent_wallets")
          .select("id, traveler_id, address, network, created_at")
          .eq("traveler_id", travelerId)
          .single();
        if (raceExisting) return raceExisting;
      }
      throw new Error(`Failed to insert agent_wallet: ${insertError.message}`);
    }

    return inserted;
  } catch (err) {
    // Every creation failure lands in the server log with traveler_id and
    // cause — never key material, which derivation keeps out of errors.
    const cause = err instanceof Error ? err.message : String(err);
    console.error(
      `agent wallet creation failed for traveler ${travelerId}: ${cause}`
    );
    throw err;
  }
}

// Auth (same contract as /usage/*): `Authorization: Bearer <Supabase access
// token>`, verified through the Auth server. No/invalid token → 401; a valid
// token for a different Traveler than the requested traveler_id → 403.
async function authorize(c: Context, travelerId: string) {
  const callerId = await travelerIdFrom(c);
  if (!callerId) return c.json({ error: "unauthorized" }, 401);
  if (callerId !== travelerId) return c.json({ error: "forbidden" }, 403);
  return null;
}

// POST /wallet/provision - body: { traveler_id: string }
router.post("/provision", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { traveler_id?: string };
  const travelerId = body.traveler_id;
  if (!travelerId || typeof travelerId !== "string") {
    return c.json({ error: "traveler_id is required" }, 400);
  }
  const denied = await authorize(c, travelerId);
  if (denied) return denied;

  try {
    const wallet = await provisionAgentWallet(travelerId);
    return c.json({ ok: true, wallet });
  } catch {
    return c.json({ error: "wallet_unavailable" }, 503);
  }
});

// GET /wallet/:traveler_id - provisions the Agent wallet on first read and
// returns its wFIAT balances. wFIAT is backed 1:1 by the fiat, so each
// balance IS a fiat amount — no conversion. balances lists every wFIAT the
// network configures (zeroes included); country_code is the Traveler's and
// may be null — reading a saldo never requires a country. A network with no
// wFIAT (testnet) answers `currency_unavailable`; a failed balance read
// answers `rpc_unreachable` — neither may ever surface as a zero balance.
router.get("/:traveler_id", async (c) => {
  const travelerId = c.req.param("traveler_id");
  const denied = await authorize(c, travelerId);
  if (denied) return denied;
  try {
    const wallet = await provisionAgentWallet(travelerId);

    const { data: traveler, error: travelerError } = await supabaseAdmin()
      .from("travelers")
      .select("country_code, funded_at")
      .eq("id", travelerId)
      .maybeSingle();
    if (travelerError) throw travelerError;

    // No wFIAT exists off mainnet — a defined failure, not an empty wallet.
    if (WFIAT.length === 0) {
      return c.json(
        {
          error: "currency_unavailable",
          address: wallet.address,
          network: wallet.network,
        },
        404
      );
    }

    let raws: bigint[];
    try {
      raws = await Promise.all(
        WFIAT.map((t) =>
          publicClient.readContract({
            address: t.def.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet.address as Address],
          })
        )
      );
    } catch {
      // An unreachable RPC must never read as an empty wallet.
      return c.json(
        {
          error: "rpc_unreachable",
          address: wallet.address,
          network: wallet.network,
        },
        502
      );
    }
    const balances = WFIAT.map((t, i) => ({
      token: t.token,
      currency: t.fiat,
      country: t.country,
      amount: formatUnits(raws[i], t.def.decimals),
    }));

    // The first positive balance in ANY wFIAT marks travelers.funded_at
    // (ADR-0002's verification ladder). Conditional update: only writes while
    // the column is still null, so an existing timestamp is never rewritten.
    // Bookkeeping must not fail the read — a failed mark only logs.
    if (traveler && !traveler.funded_at && raws.some((r) => r > 0n)) {
      const { error: fundedError } = await supabaseAdmin()
        .from("travelers")
        .update({ funded_at: new Date().toISOString() })
        .eq("id", travelerId)
        .is("funded_at", null);
      if (fundedError) {
        console.error(
          `funded_at mark failed for traveler ${travelerId}: ${fundedError.message}`
        );
      }
    }

    return c.json({
      ok: true,
      address: wallet.address,
      network: wallet.network,
      country_code: traveler?.country_code ?? null,
      balances,
    });
  } catch {
    return c.json({ error: "wallet_unavailable" }, 503);
  }
});

// ---------------------------------------------------------------------------
// Funding — "Cargar" (issue #40)
// ---------------------------------------------------------------------------

/**
 * Ripio hosted-ramp base URL — the public deep link confirmed in #38. No
 * partner credentials: payment method and KYC live on Ripio's side.
 */
const RAMP_URL = process.env.RIPIO_RAMP_URL ?? "https://ramp.ripio.com/";

/**
 * Minimum Funding amount per fiat currency, in fiat units (the ramp's
 * `amount` is fiat). `FUNDING_MIN_<FIAT>` overrides per currency; the
 * defaults sit at the ramp's observed floor so the Traveler meets it
 * here, not after arriving at Ripio.
 */
const FUNDING_MIN: Record<string, number> = {
  ARS: 2_100,
  BRL: 25,
  CLP: 5_000,
  COP: 20_000,
  MXN: 100,
  PEN: 20,
};

const fundingMin = (fiat: string): number => {
  const n = Number(process.env[`FUNDING_MIN_${fiat}`]);
  return Number.isFinite(n) && n > 0 ? n : (FUNDING_MIN[fiat] ?? 1);
};

// POST /wallet/:traveler_id/funding-link — builds the Funding deep link.
// Body: { amount, currency, country? }. `currency` is the fiat the Traveler
// picked — any of the six wFIAT, not only their country's. `country` is the
// payer country: persisted to travelers.country_code while it is still null
// and never asked again; the stored value always wins. The answer is the
// Ripio ramp URL with payer country, Celo chain id, chosen wFIAT, amount and
// the Traveler's own Agent wallet as destination — the address exists only
// server-side and inside that URL. Each issued link is logged with
// traveler_id, amount, currency and network — never the full address nor
// key material.
router.post("/:traveler_id/funding-link", async (c) => {
  const travelerId = c.req.param("traveler_id");
  const denied = await authorize(c, travelerId);
  if (denied) return denied;

  const body = (await c.req.json().catch(() => null)) as {
    amount?: number | string;
    currency?: unknown;
    country?: unknown;
  } | null;

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: "invalid_amount" }, 400);
  }

  const fiat = String(body?.currency ?? "")
    .trim()
    .toUpperCase();
  if (!Object.values(COUNTRY_WFIAT).some((w) => w.fiat === fiat)) {
    return c.json({ error: "unsupported_currency" }, 400);
  }
  const wfiat = WFIAT.find((t) => t.fiat === fiat);
  if (!wfiat) {
    // No wFIAT exists off mainnet — a defined failure, not a 400.
    return c.json(
      { error: "currency_unavailable", network: CONFIG.name },
      404
    );
  }
  const min = fundingMin(fiat);
  if (amount < min) {
    return c.json({ error: "invalid_amount", min }, 400);
  }

  const rawCountry = body?.country;
  const country =
    rawCountry == null ? undefined : String(rawCountry).trim().toUpperCase();
  if (country !== undefined && !/^[A-Z]{2}$/.test(country)) {
    return c.json({ error: "invalid_country" }, 400);
  }

  try {
    const { data: traveler, error: travelerError } = await supabaseAdmin()
      .from("travelers")
      .select("country_code")
      .eq("id", travelerId)
      .maybeSingle();
    if (travelerError) throw travelerError;

    // The payer country persists once — the conditional update keeps any
    // value that landed first, so a repeated answer never rewrites it.
    // Bookkeeping must not fail the link — a failed write only logs.
    if (!traveler?.country_code && country) {
      const { error: countryError } = await supabaseAdmin()
        .from("travelers")
        .update({ country_code: country })
        .eq("id", travelerId)
        .is("country_code", null);
      if (countryError) {
        console.error(
          `country_code persist failed for traveler ${travelerId}: ${countryError.message}`
        );
      }
    }
    const payer = traveler?.country_code ?? country;
    if (!payer) {
      return c.json({ error: "country_required" }, 400);
    }

    // Tapping "Cargar" is a wallet action (ADR-0003): the Agent wallet is
    // created here if the Traveler does not have one yet.
    const wallet = await provisionAgentWallet(travelerId);

    const url = new URL(RAMP_URL);
    url.searchParams.set("country", payer);
    url.searchParams.set("chain", String(CONFIG.chain.id));
    url.searchParams.set("token", wfiat.token.toUpperCase());
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("address", wallet.address);

    console.log(
      `funding link issued: traveler=${travelerId} amount=${amount} currency=${fiat} network=${CONFIG.name}`
    );
    return c.json({ ok: true, url: url.toString() });
  } catch {
    return c.json({ error: "wallet_unavailable" }, 503);
  }
});

export default router;
