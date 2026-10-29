import { Hono, type Context } from "hono";
import {
  keccak256,
  stringToHex,
  createPublicClient,
  http,
  formatUnits,
  erc20Abi,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { PaymentRequirements } from "@x402/core/types";
import { createSupabaseAdmin } from "./supabase.js";
import { supabaseAdmin, travelerIdFrom } from "./auth.js";
import { ACCEPTED_TOKENS, CAIP2, CONFIG, COUNTRY_WFIAT, WFIAT } from "./x402.js";

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
 *
 * The key itself is module-private on purpose — only signTravelerPayment
 * calls deriveAgentKey, and the viem account it feeds never leaves that
 * function's scope (ADR-0003's security rule).
 */
function deriveAgentKey(travelerId: string): Hex {
  const masterSecret = process.env.AGENT_WALLET_MASTER_SECRET;
  if (!masterSecret) {
    throw new Error("AGENT_WALLET_MASTER_SECRET is not set");
  }
  return keccak256(stringToHex(`${masterSecret}:${travelerId}`));
}

export function deriveAgentWallet(travelerId: string): { address: Address; keyRef: string } {
  const account = privateKeyToAccount(deriveAgentKey(travelerId));
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

// ---------------------------------------------------------------------------
// payment-auth — the API signs a Booking's x402 payment with the Traveler's
// Agent wallet key (issue #60; ADR-0003 custody, ADR-0006 Escrow payTo)
// ---------------------------------------------------------------------------

/** The extension block our Booking 402 advertises for Permit2 assets — the
 * same literal book-payment.ts emits, needed in the signing context so the
 * scheme produces the sponsored EIP-2612 permit. */
const PERMIT2_SPONSORED_EXTENSIONS = {
  eip2612GasSponsoring: {
    info: {
      description: "The facilitator sponsors the EIP-2612 permit to Permit2.",
      version: "1",
    },
  },
} as const;

interface PaymentRequirementsInput {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
}

interface ResourceInfoInput {
  url: string;
  description?: string;
  mimeType?: string;
}

interface PaymentAuthInput {
  requirements: PaymentRequirementsInput;
  extensions?: Record<string, unknown>;
  resource?: ResourceInfoInput;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// The body is the requirements entry the caller picked out of the 402's
// accepts[], plus the optional extensions/resource blocks from the same 402.
// `extra` is never trusted — signing always uses the token's own EIP-712
// domain from the ACCEPTED_TOKENS table, so a forged extra can change nothing
// the signature binds.
function parsePaymentAuthInput(body: unknown): PaymentAuthInput | null {
  if (!isRecord(body)) return null;
  const r = body.requirements;
  if (!isRecord(r)) return null;
  if (
    r.scheme !== "exact" ||
    typeof r.network !== "string" ||
    typeof r.asset !== "string" ||
    typeof r.payTo !== "string" ||
    typeof r.amount !== "string" ||
    !/^\d+$/.test(r.amount) ||
    BigInt(r.amount) <= 0n ||
    typeof r.maxTimeoutSeconds !== "number" ||
    !Number.isInteger(r.maxTimeoutSeconds) ||
    r.maxTimeoutSeconds <= 0 ||
    r.maxTimeoutSeconds > 3600
  ) {
    return null;
  }
  let resource: ResourceInfoInput | undefined;
  if (isRecord(body.resource) && typeof body.resource.url === "string") {
    resource = { url: body.resource.url };
    if (typeof body.resource.description === "string")
      resource.description = body.resource.description;
    if (typeof body.resource.mimeType === "string")
      resource.mimeType = body.resource.mimeType;
  }
  return {
    requirements: {
      scheme: "exact",
      network: r.network,
      asset: r.asset,
      amount: r.amount,
      payTo: r.payTo,
      maxTimeoutSeconds: r.maxTimeoutSeconds,
    },
    extensions: isRecord(body.extensions) ? body.extensions : undefined,
    resource,
  };
}

// Recreates what x402Client emits on the wire: the server-declared extensions
// with the scheme's client-side echoes merged in (the client fills fields the
// server only declared, e.g. eip2612GasSponsoring.info).
function mergeExtensionEchoes(
  declared: Record<string, unknown>,
  echoed: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...declared };
  for (const [key, clientValue] of Object.entries(echoed)) {
    const serverValue = out[key];
    out[key] =
      isRecord(serverValue) && isRecord(clientValue)
        ? mergeExtensionEchoes(serverValue, clientValue)
        : serverValue === undefined
          ? clientValue
          : serverValue;
  }
  return out;
}

/**
 * Produces the signed x402 payment for `requirements` with the Traveler's
 * custodial key. The key is derived, used and dropped inside this function —
 * what leaves is the PaymentPayloadResult, never key material. The scheme is
 * the same ExactEvmScheme the buyer client registers: it picks EIP-3009
 * (transferWithAuthorization) or the Permit2 witness signature per
 * `extra.assetTransferMethod`, and reads `nonces`/`allowance` over the
 * configured RPC when the sponsored EIP-2612 permit applies. All chain
 * interaction is read-only; nothing here ever sends a transaction.
 *
 * The signer must control the wallet's stored address: a row provisioned
 * under a different master secret would otherwise emit payments the funded
 * wallet can never settle. Mismatch refuses before signing — the throw
 * surfaces as wallet_unavailable.
 */
async function signTravelerPayment(
  travelerId: string,
  expectedAddress: Address,
  requirements: PaymentRequirements,
  extensions: Record<string, unknown>
) {
  const account = privateKeyToAccount(deriveAgentKey(travelerId));
  if (account.address !== expectedAddress) {
    console.error(
      `payment-auth: derived ${account.address} but stored wallet is ${expectedAddress} for traveler ${travelerId} — refusing to sign`
    );
    throw new Error("agent wallet key mismatch");
  }
  const scheme = new ExactEvmScheme(account, { rpcUrl: CONFIG.rpc });
  return scheme.createPaymentPayload(2, requirements, { extensions });
}

// POST /wallet/:traveler_id/payment-auth — turns a Booking 402's payment
// requirements into the signed X-PAYMENT value, paid from the Traveler's own
// Agent wallet (Traveler-pays Bookings, #56).
//
// The whole point of the endpoint is what it refuses to sign. It only ever
// signs a payment whose payTo is the configured Escrow vault in a configured
// X402_ASSETS token on the configured network — a stolen Bearer token can
// then do nothing worse than pay a real Booking, never sign a transfer to an
// arbitrary destination. `funded_at` is the verification-tier gate (ADR-0002
// relaxed for v1): an unfunded Traveler has nothing to pay with, so the gate
// doubles as the "wallet exists" precondition. Errors are small named codes
// Nomito translates for the Traveler — insufficient_balance names the wFIAT
// and the missing amount ("cargá X wARS").
router.post("/:traveler_id/payment-auth", async (c) => {
  const travelerId = c.req.param("traveler_id");
  const denied = await authorize(c, travelerId);
  if (denied) return denied;

  const input = parsePaymentAuthInput(await c.req.json().catch(() => null));
  if (!input) {
    return c.json({ error: "invalid_requirements" }, 400);
  }
  const req = input.requirements;
  if (req.network !== CAIP2) {
    return c.json({ error: "unsupported_network", network: CAIP2 }, 400);
  }
  // strict:false — address shape only; checksums are normalized by getAddress
  // below, so a valid-but-oddly-cased address (like the .env vault entry) is
  // never rejected for its casing.
  if (!isAddress(req.payTo, { strict: false }) || !isAddress(req.asset, { strict: false })) {
    return c.json({ error: "invalid_requirements" }, 400);
  }

  // ADR-0002's tier gate for paying: a first Funding is what proves the
  // Traveler (gov_id lands later). funded_at null → refuse before any
  // wallet work or signature exists.
  try {
    const { data: traveler, error } = await supabaseAdmin()
      .from("travelers")
      .select("funded_at")
      .eq("id", travelerId)
      .maybeSingle();
    if (error) throw error;
    if (!traveler?.funded_at) {
      return c.json({ error: "funding_required" }, 403);
    }
  } catch {
    return c.json({ error: "wallet_unavailable" }, 503);
  }

  // The only destination this endpoint ever signs for.
  const rawEscrow = process.env.ESCROW_ADDRESS?.trim();
  if (!rawEscrow || !isAddress(rawEscrow, { strict: false })) {
    return c.json({ error: "escrow_unavailable" }, 503);
  }
  const escrow = getAddress(rawEscrow);
  if (getAddress(req.payTo) !== escrow) {
    return c.json({ error: "destination_forbidden" }, 403);
  }

  // The only assets it ever signs in — the configured X402_ASSETS set.
  const token = ACCEPTED_TOKENS.find(
    (t) => t.address.toLowerCase() === req.asset.toLowerCase()
  );
  if (!token) {
    return c.json({ error: "unsupported_asset" }, 400);
  }

  // The Agent wallet comes into existence on the Traveler's first wallet
  // action — paying a Booking is one (ADR-0003's lazy provisioning).
  let wallet: Awaited<ReturnType<typeof provisionAgentWallet>>;
  try {
    wallet = await provisionAgentWallet(travelerId);
  } catch {
    return c.json({ error: "wallet_unavailable" }, 503);
  }

  const amount = BigInt(req.amount);
  let balance: bigint;
  try {
    balance = await publicClient.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.address as Address],
    });
  } catch {
    return c.json({ error: "rpc_unreachable" }, 502);
  }
  if (balance < amount) {
    const fiat = Object.values(COUNTRY_WFIAT).find(
      (w) => w.token === token.symbol
    )?.fiat;
    const tokenName = fiat ? `w${fiat}` : token.symbol.toUpperCase();
    return c.json(
      {
        error: "insufficient_balance",
        token: tokenName,
        currency: fiat ?? tokenName,
        required: formatUnits(amount, token.decimals),
        available: formatUnits(balance, token.decimals),
        missing: formatUnits(amount - balance, token.decimals),
      },
      409
    );
  }

  // Sign the canonical requirements — our own 402's shape: the token's real
  // EIP-712 domain and transfer method out of the table, never the caller's
  // `extra`. The signature binds payTo/asset/amount either way; this keeps
  // the echoed `accepted` identical to what the Booking route resolves.
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: CAIP2,
    asset: token.address,
    amount: req.amount,
    payTo: escrow,
    maxTimeoutSeconds: req.maxTimeoutSeconds,
    extra: {
      ...token.domain,
      ...(token.transferMethod === "permit2"
        ? { assetTransferMethod: "permit2" }
        : {}),
    },
  };
  const declaredExtensions = {
    ...(token.transferMethod === "permit2"
      ? PERMIT2_SPONSORED_EXTENSIONS
      : {}),
    ...(input.extensions ?? {}),
  };

  try {
    const signed = await signTravelerPayment(
      travelerId,
      wallet.address as Address,
      requirements,
      declaredExtensions
    );
    const payload = {
      x402Version: 2,
      ...(input.resource ? { resource: input.resource } : {}),
      accepted: requirements,
      payload: signed.payload,
      extensions: mergeExtensionEchoes(declaredExtensions, signed.extensions ?? {}),
    };
    // The header value the paid retry sends as PAYMENT-SIGNATURE / X-PAYMENT —
    // base64 of the v2 PaymentPayload, exactly what wrapFetchWithPayment emits.
    const xPayment = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64"
    );
    return c.json({ ok: true, x_payment: xPayment, payer: wallet.address });
  } catch {
    return c.json({ error: "wallet_unavailable" }, 503);
  }
});

export default router;
