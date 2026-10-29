// Owner payout — the Ripio deposit-address verification flow (issue #68).
// ADR-0006 pays the Owner out of Escrow to this address, and the keeper
// (#69) only releases to a verified one.
//
// A Ripio deposit address can NOT sign — it's an exchange account, not a
// wallet the Owner holds keys for — so proof is a test deposit:
//
//   PUT    /owners/payout          stores the address (service_role RPC —
//                                  PostgREST writes are closed by column
//                                  grants), stamping payout_address_set_at
//   POST   /owners/payout/verify   sends a small unique random amount
//                                  (0.11–0.99, 2 decimals) of the Owner's
//                                  wFIAT from the ops wallet, attribution-
//                                  tagged like every ops tx, and opens a
//                                  payout_verifications row
//   POST   /owners/payout/confirm  checks the amount the Owner reports Ripio
//                                  credited; a match stamps
//                                  payout_verified_at — 3 misses void it
//   GET    /owners/payout          address, verified_at and the latest
//                                  verification — never the expected amount
//
// A deposit is only ever sent to an address stamped payout_address_set_at —
// that stamp can only come from set_payout_address, so the seeded
// placeholders can't be sent money. One deposit per business per 24 h and
// an explicit ops_float_insufficient when the ops wallet can't cover it;
// both are re-checked atomically inside start_payout_verification before
// the row exists.
//
// Network: X402_NETWORK, same as wallet.ts — wFIAT exists on mainnet only.
// The sender is injectable (setPayoutSender) so smokes run the SAME viem
// send path on ganache without real funds. PAYOUT_TOKEN_ADDRESS/_DECIMALS
// point the resolved wFIAT at a mock token there — never set them in prod.

import { randomInt } from "node:crypto";
import { Hono, type Context } from "hono";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withAttribution } from "@celo/attribution-tags";
import { bearerToken, supabaseAdmin, travelerIdFrom } from "./auth.js";
import { CONFIG, COUNTRY_WFIAT, FIAT_WFIAT, type TokenDef } from "./x402.js";

const payout = new Hono();

/** Pending verifications last a day — matching the resend cooldown. */
const VERIFY_TTL_SECONDS = 86_400;
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// The sender — one ERC-20 transfer, waited to a successful receipt.
// ---------------------------------------------------------------------------

export interface PayoutSender {
  /** ERC-20 transfer of `atomic` units of `token` to `to`; resolves the hash
   *  once mined successfully and throws on a reverted receipt — nothing
   *  returns early as "sent". */
  sendTestDeposit(token: TokenDef, to: Address, atomic: bigint): Promise<Hex>;
  /** The ops wallet's on-chain balance of `token` — the float check. */
  float(token: TokenDef): Promise<bigint>;
}

type ReadClient = Pick<
  ReturnType<typeof createPublicClient>,
  "readContract" | "waitForTransactionReceipt"
>;
interface SendWallet {
  account: { address: Address };
  sendTransaction(args: { to: Address; data: Hex }): Promise<Hex>;
}

/**
 * The single send path — the smoke injects this same construction pointed at
 * ganache, production builds it on the configured chain with the ops key.
 */
export function makeViemPayoutSender(deps: {
  client: ReadClient;
  wallet: SendWallet;
}): PayoutSender {
  const { client, wallet } = deps;
  return {
    float(token) {
      return client.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [wallet.account.address],
      });
    },
    async sendTestDeposit(token, to, atomic) {
      const hash = await wallet.sendTransaction({
        to: token.address,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [to, atomic],
        }),
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`test deposit reverted — status ${receipt.status}`);
      }
      return hash;
    },
  };
}

class OpsWalletUnavailable extends Error {
  constructor(cause: string) {
    super(cause);
    this.name = "OpsWalletUnavailable";
  }
}

let injectedSender: PayoutSender | null = null;
let defaultSender: PayoutSender | null = null;

/** Test hook — smokes inject a ganache-backed sender; null restores the ops default. */
export function setPayoutSender(sender: PayoutSender | null): void {
  injectedSender = sender;
}

/**
 * The ops wallet: OPS_WALLET_PRIVATE_KEY on the configured chain, with the
 * CELO_ATTRIBUTION_TAG appended to calldata on every send (ERC-8021, same as
 * the escrow scripts — untagged sends are refused outright).
 */
function opsSender(): PayoutSender {
  if (injectedSender) return injectedSender;
  if (defaultSender) return defaultSender;
  const raw = process.env.OPS_WALLET_PRIVATE_KEY?.trim();
  const key = raw ? (raw.startsWith("0x") ? raw : `0x${raw}`) : null;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new OpsWalletUnavailable("OPS_WALLET_PRIVATE_KEY is not a 32-byte hex key");
  }
  const tag = process.env.CELO_ATTRIBUTION_TAG?.trim();
  if (!tag?.startsWith("celo_")) {
    throw new OpsWalletUnavailable(
      "CELO_ATTRIBUTION_TAG is not set — refusing to send untagged transactions"
    );
  }
  const transport = http(CONFIG.rpc);
  defaultSender = makeViemPayoutSender({
    client: createPublicClient({ chain: CONFIG.chain, transport }),
    wallet: createWalletClient({
      account: privateKeyToAccount(key as Hex),
      chain: CONFIG.chain,
      transport,
    }).extend(withAttribution(tag)),
  });
  return defaultSender;
}

// ---------------------------------------------------------------------------
// resolution helpers
// ---------------------------------------------------------------------------

export const BURN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  // the seed's obvious placeholder — sending to it burns the deposit.
  "0x0000000000000000000000000000000000000001",
]);

/** A checksummable Celo address, minus the zero/placeholder addresses. */
function parsePayoutAddress(raw: unknown): Address | null {
  const s = String(raw ?? "").trim();
  // strict:false — getAddress normalizes casing; a valid lowercase paste is
  // never rejected for its checksum.
  if (!isAddress(s, { strict: false })) return null;
  if (BURN_ADDRESSES.has(s.toLowerCase())) return null;
  return getAddress(s);
}

/**
 * The wFIAT a currency verifies in on this network (X402 table). Smoke-only
 * overrides: PAYOUT_TOKEN_ADDRESS points the resolved token at a mock ERC-20
 * (a ganache deploy); PAYOUT_TOKEN_DECIMALS overrides its decimals.
 */
function payoutTokenFor(currency: string): { symbol: string; def: TokenDef } | null {
  const symbol = FIAT_WFIAT[currency];
  const def = symbol ? CONFIG.tokens[symbol] : undefined;
  if (!symbol || !def) return null;
  const override = process.env.PAYOUT_TOKEN_ADDRESS?.trim();
  if (override && isAddress(override)) {
    const decimals = Number(process.env.PAYOUT_TOKEN_DECIMALS);
    return {
      symbol,
      def: {
        ...def,
        address: getAddress(override),
        decimals:
          Number.isInteger(decimals) && decimals > 0 ? decimals : def.decimals,
      },
    };
  }
  return { symbol, def };
}

/**
 * The Owner's currency: the wFIAT of their newest live (non-archived)
 * Lodging's currency — what they actually charge in. A business with no
 * listings falls back to its newest property's country via COUNTRY_WFIAT —
 * listings.currency is set from that same table at publish time, so the two
 * paths can't disagree on fiat. UYU has no wFIAT (same gap as the Booking
 * charge): verification answers currency_unavailable there.
 */
async function ownerCurrency(
  admin: ReturnType<typeof supabaseAdmin>,
  businessId: string
): Promise<string | null> {
  const { data: listing, error: lErr } = await admin
    .from("listings")
    .select("currency, property:properties!inner(business_id)")
    .eq("property.business_id", businessId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lErr) throw lErr;
  if (listing?.currency) return listing.currency.toUpperCase();

  const { data: property, error: pErr } = await admin
    .from("properties")
    .select("country_code")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pErr) throw pErr;
  const code = property?.country_code?.toUpperCase();
  return code ? (COUNTRY_WFIAT[code]?.fiat ?? null) : null;
}

/** A verified Owner, or the 401 Response to return. */
async function ownerAuth(c: Context, error: string) {
  const token = bearerToken(c);
  const userId = token ? await travelerIdFrom(c) : null;
  if (!token || !userId) return { response: c.json({ error }, 401) } as const;
  return { userId } as const;
}

const dayAgo = () => new Date(Date.now() - 24 * 3_600_000).toISOString();

/** The {ok, error:{code,message}} contract the payout RPCs return. */
interface PayoutRpcResult {
  ok?: boolean;
  payout_address?: string | null;
  payout_verified_at?: string | null;
  verified_at?: string;
  verification?: { id?: string; expires_at?: string };
  error?: {
    code?: string;
    message?: string;
    expires_at?: string;
    retry_at?: string;
    attempts_left?: number;
  };
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

/**
 * PUT /owners/payout — body {address}. Validates and stores the Owner's
 * Ripio deposit address through set_payout_address (service_role) — the
 * only writer now that column grants closed PostgREST. The trigger clears
 * payout_verified_at and cancels pending verifications when the address
 * actually changes, so a re-save of the same address keeps a verification.
 */
payout.put("/payout", async (c) => {
  try {
    const who = await ownerAuth(c, "Iniciá sesión para cargar tu dirección de cobro.");
    if ("response" in who) return who.response;
    const body = (await c.req.json().catch(() => ({}))) as { address?: unknown };
    const address = parsePayoutAddress(body?.address);
    if (!address) {
      return c.json({ error: "invalid_address" }, 400);
    }
    const { data: result, error } = await supabaseAdmin().rpc("set_payout_address", {
      p_user_id: who.userId,
      p_address: address,
    });
    const typed = result as PayoutRpcResult | null;
    if (error) return c.json({ error: error.message }, 500);
    if (typed?.ok === false) {
      const code = typed.error?.code;
      return c.json(
        { error: code === "forbidden" ? "forbidden" : "invalid_address" },
        code === "forbidden" ? 403 : 400
      );
    }
    return c.json({
      ok: true,
      address: typed?.payout_address ?? address,
      verified_at: typed?.payout_verified_at ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /owners/payout/verify — sends the test deposit. The row is opened
 * BEFORE the send (start_payout_verification re-checks the limits), stamped
 * with the tx hash after the receipt lands green, and cancelled if the send
 * fails — a cancelled row never eats the 24 h cooldown.
 */
payout.post("/payout/verify", async (c) => {
  try {
    const who = await ownerAuth(c, "Iniciá sesión para verificar tu dirección de cobro.");
    if ("response" in who) return who.response;
    const { userId } = who;
    const admin = supabaseAdmin();

    const { data: business, error: busErr } = await admin
      .from("businesses")
      .select("id, payout_address, payout_address_set_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (busErr) return c.json({ error: busErr.message }, 500);
    if (!business) {
      return c.json({ error: "Primero registrá tu negocio en /owners/join." }, 403);
    }
    const address = parsePayoutAddress(business.payout_address);
    // The stamp is the proof the address came through PUT — a placeholder or
    // a hand-set value never gets a deposit.
    if (!address || !business.payout_address_set_at) {
      return c.json({ error: "payout_address_unset" }, 409);
    }

    const currency = await ownerCurrency(admin, business.id).catch(() => null);
    const token = currency ? payoutTokenFor(currency) : null;
    if (!currency || !token) {
      return c.json({ error: "currency_unavailable", currency }, 404);
    }

    // Advisory pre-checks — the RPC re-runs them atomically before the row
    // exists; checking here first answers the friendly code BEFORE a row is
    // opened (and, for cooldown, before the ops wallet is even read).
    const { data: pending } = await admin
      .from("payout_verifications")
      .select("id, expires_at")
      .eq("business_id", business.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (pending) {
      return c.json(
        { error: "verification_pending", expires_at: pending.expires_at },
        409
      );
    }
    const { data: sent } = await admin
      .from("payout_verifications")
      .select("created_at")
      .eq("business_id", business.id)
      .not("tx_hash", "is", null)
      .gt("created_at", dayAgo())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sent) {
      return c.json(
        {
          error: "verification_cooldown",
          retry_at: new Date(
            new Date(sent.created_at).getTime() + 24 * 3_600_000
          ).toISOString(),
        },
        429
      );
    }

    // The unique random amount — 0.11–0.99 with 2 decimals: big enough that
    // Ripio shows it, small enough that the float covers thousands of runs.
    const atomic = parseUnits(
      (randomInt(11, 100) / 100).toFixed(2),
      token.def.decimals
    );

    let sender: PayoutSender;
    try {
      sender = opsSender();
    } catch (err) {
      if (err instanceof OpsWalletUnavailable) {
        console.error(`payout verify: ${err.message}`);
        return c.json({ error: "ops_wallet_unavailable" }, 503);
      }
      throw err;
    }

    let float: bigint;
    try {
      float = await sender.float(token.def);
    } catch {
      return c.json({ error: "rpc_unreachable" }, 502);
    }
    if (float < atomic) {
      // Explicit refusal — nothing is opened and nothing is sent.
      console.error(
        `payout verify: ops float ${float} < ${atomic} ${token.symbol} — top up the ops wallet`
      );
      return c.json(
        { error: "ops_float_insufficient", token: token.symbol, currency },
        503
      );
    }

    const { data: opened, error: openErr } = await admin.rpc(
      "start_payout_verification",
      {
        p_user_id: userId,
        p_address: address,
        p_token: token.symbol,
        p_currency: currency,
        p_amount_atomic: atomic.toString(),
        p_ttl_seconds: VERIFY_TTL_SECONDS,
      }
    );
    if (openErr) return c.json({ error: "internal" }, 500);
    const openedTyped = opened as PayoutRpcResult | null;
    if (openedTyped?.ok === false) {
      const rpcError = openedTyped.error ?? {};
      const code = rpcError.code;
      if (code === "verification_pending") {
        return c.json(
          { error: code, expires_at: rpcError.expires_at },
          409
        );
      }
      if (code === "verification_cooldown") {
        return c.json(
          { error: code, retry_at: rpcError.retry_at },
          429
        );
      }
      if (code === "forbidden") return c.json({ error: code }, 403);
      // address_changed — the stored address moved mid-request.
      return c.json({ error: code ?? "verification_rejected" }, 409);
    }

    const verificationId = openedTyped?.verification?.id;
    const expiresAt = openedTyped?.verification?.expires_at;

    let hash: Hex;
    try {
      hash = await sender.sendTestDeposit(token.def, address, atomic);
    } catch (err) {
      // Nothing landed on-chain — the row is cancelled, not left pending.
      console.error(
        `payout verify: deposit send failed for business ${business.id}`,
        err
      );
      if (verificationId) {
        await admin
          .from("payout_verifications")
          .update({ status: "cancelled" })
          .eq("id", verificationId);
      }
      return c.json({ error: "send_failed" }, 502);
    }

    if (verificationId) {
      const { error: stampErr } = await admin
        .from("payout_verifications")
        .update({ tx_hash: hash })
        .eq("id", verificationId);
      if (stampErr) {
        // The money DID go out — the row carries no hash and the 24 h
        // cooldown won't count it. Loud for ops reconciliation.
        console.error(
          `payout verify: CRITICAL — deposit sent (${hash}) but tx_hash write failed for verification ${verificationId}: ${stampErr.message}`
        );
      }
    }

    return c.json({
      ok: true,
      verification: {
        id: verificationId,
        token: token.symbol,
        currency,
        tx_hash: hash,
        expires_at: expiresAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /owners/payout/confirm — body {amount}: what the Owner sees credited
 * in Ripio (dot or comma decimals — "0.37" / "0,37"). Exact match verifies;
 * each miss spends an attempt and the third voids the verification.
 */
payout.post("/payout/confirm", async (c) => {
  try {
    const who = await ownerAuth(c, "Iniciá sesión para confirmar tu dirección de cobro.");
    if ("response" in who) return who.response;
    const { userId } = who;
    const admin = supabaseAdmin();

    const { data: business, error: busErr } = await admin
      .from("businesses")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (busErr) return c.json({ error: busErr.message }, 500);
    if (!business) {
      return c.json({ error: "Primero registrá tu negocio en /owners/join." }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as { amount?: unknown } | null;
    const rawAmount = String(body?.amount ?? "").trim().replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(rawAmount) || Number(rawAmount) <= 0) {
      return c.json({ error: "invalid_amount" }, 400);
    }

    const { data: ver } = await admin
      .from("payout_verifications")
      .select("id, token, expires_at")
      .eq("business_id", business.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ver) {
      return c.json({ error: "no_pending_verification" }, 409);
    }
    // Decimals resolve the same way as at start: the smoke's token override
    // applies to whatever wFIAT the row recorded.
    const decimals =
      process.env.PAYOUT_TOKEN_ADDRESS?.trim() &&
      Number.isInteger(Number(process.env.PAYOUT_TOKEN_DECIMALS)) &&
      Number(process.env.PAYOUT_TOKEN_DECIMALS) > 0
        ? Number(process.env.PAYOUT_TOKEN_DECIMALS)
        : CONFIG.tokens[ver.token]?.decimals;
    if (!decimals) {
      return c.json({ error: "currency_unavailable" }, 404);
    }
    const atomic = parseUnits(rawAmount, decimals);

    const { data: result, error } = await admin.rpc("confirm_payout_verification", {
      p_user_id: userId,
      p_amount_atomic: atomic.toString(),
    });
    const typed = result as PayoutRpcResult | null;
    if (error) return c.json({ error: error.message }, 500);
    if (typed?.ok === true) {
      return c.json({ ok: true, verified_at: typed.verified_at ?? null });
    }
    const code = typed?.error?.code;
    switch (code) {
      case "amount_mismatch":
        return c.json({ error: code, attempts_left: typed?.error?.attempts_left }, 422);
      case "verification_failed":
        return c.json({ error: code, attempts_left: 0 }, 422);
      case "verification_expired":
        return c.json({ error: code }, 410);
      case "forbidden":
        return c.json({ error: code }, 403);
      default:
        return c.json({ error: code ?? "no_pending_verification" }, 409);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /owners/payout — the verification state for the dashboard: the stored
 * address, when it was verified, and the latest verification's public
 * fields (status, token, currency, tx_hash, attempts left, expires_at).
 * The expected amount is never selected — it can't reach a client.
 */
payout.get("/payout", async (c) => {
  try {
    const who = await ownerAuth(c, "Iniciá sesión para ver tu dirección de cobro.");
    if ("response" in who) return who.response;
    const { userId } = who;
    const admin = supabaseAdmin();

    const { data: business, error: busErr } = await admin
      .from("businesses")
      .select("id, payout_address, payout_address_set_at, payout_verified_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (busErr) return c.json({ error: busErr.message }, 500);
    if (!business) {
      return c.json({ error: "Primero registrá tu negocio en /owners/join." }, 403);
    }

    const { data: ver, error: verErr } = await admin
      .from("payout_verifications")
      .select("id, token, currency, tx_hash, attempts, status, expires_at, created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verErr) return c.json({ error: verErr.message }, 500);

    let status = ver?.status ?? null;
    if (ver && status === "pending" && ver.expires_at <= new Date().toISOString()) {
      // Lazy sweep — the next start/confirm would mark it too.
      status = "expired";
      await admin
        .from("payout_verifications")
        .update({ status: "expired" })
        .eq("id", ver.id)
        .eq("status", "pending");
    }

    return c.json({
      ok: true,
      network: CONFIG.name,
      explorer: CONFIG.explorer,
      address: business.payout_address,
      address_set_at: business.payout_address_set_at,
      verified_at: business.payout_verified_at,
      verification: ver
        ? {
            id: ver.id,
            status,
            token: ver.token,
            currency: ver.currency,
            tx_hash: ver.tx_hash,
            attempts_left:
              status === "pending"
                ? Math.max(0, MAX_ATTEMPTS - ver.attempts)
                : 0,
            expires_at: ver.expires_at,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return c.json({ error: message }, 500);
  }
});

export default payout;
