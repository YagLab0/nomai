// Escrow keeper — POST /internal/keeper (ADR-0006, issue #69).
//
// Ops-only: a cron job (or a manual curl) triggers one cycle:
//
//   1. process_escrow_releases() — the DB half: advances the Escrow
//      lifecycle (funded → partially_released → released) and posts the
//      release/refund intent rows into `payments`.
//   2. recover_escrow_intents() — reconciles rows stuck in 'executing' by a
//      crashed run: requeues provably-never-broadcast ones and receipt-
//      checks broadcast ones (see the migration header for the state
//      machine).
//   3. claim_escrow_intents() — atomically claims each intent (one row, one
//      keeper run, `for update skip locked`) and resolves its destination:
//      releases go to the Owner's payout_address ONLY when payout_verified_
//      at is set (#68); refunds go back to the charge row's payer — the
//      Traveler's Agent wallet. Unresolvable rows land 'held' with the
//      reason.
//   4. For every claimed row the keeper sends vault.transfer(token, to,
//      amount) — signed by OPS_WALLET_PRIVATE_KEY, which must equal the
//      vault's admin() or nothing is sent — with the ERC-8021 attribution
//      tag appended to the calldata. The tx is signed FIRST, its hash
//      recorded on the row BEFORE broadcast, then sent raw and receipt-
//      waited. That order is what makes a crashed run safe to retry: a row
//      with an attempt hash is reconciled from the chain, never resent
//      blind.
//
// Token and amount: the token is the Booking's charge asset (release intents
// store the fiat symbol, e.g. 'ARS' — the charge carries the real contract
// address and network); amount_minor is the 10^-6 domain, converted to
// atomic units exactly like toAtomic in book-payment.ts. The vault must
// hold enough of that token or the row fails 'vault_insufficient_balance'
// — explicit and retryable.
//
// dryRun (`POST /internal/keeper?dryRun` or body {"dryRun": true}) computes
// and returns exactly what a real run would mark, claim and send — token,
// to, amount, booking — without writing anything or broadcasting.
//
// Auth: `Authorization: Bearer <KEEPER_SECRET>`. KEEPER_SECRET unset → every
// call is 401 (the endpoint is off, never open).
//
// The chain side is injectable (setKeeperChain) so the smoke runs the SAME
// viem sign/broadcast path on ganache without real funds — like
// setPayoutSender in payout.ts. The release processor is likewise
// injectable (setReleaseProcessor) so the smoke can skip the real
// process_escrow_releases() — it would otherwise post intents for the
// production bookings it finds funded past their Cancellation deadline.

import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  keccak256,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toDataSuffix } from "@celo/attribution-tags";
import { supabaseAdmin } from "./auth.js";
import { processEscrowReleases } from "./data/supabase.js";
import { BURN_ADDRESSES } from "./payout.js";
import { CONFIG } from "./x402.js";

const keeper = new Hono();

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// ---------------------------------------------------------------------------
// The vault ABI surface the keeper needs — the real contract is compiled in
// the ops scripts; only transfer()/admin() are called here.
// ---------------------------------------------------------------------------

const VAULT_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "admin",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const satisfies Abi;

const ERC20_MIN_ABI = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ---------------------------------------------------------------------------
// KeeperChain — every on-chain touch, injectable for the ganache smoke.
// ---------------------------------------------------------------------------

export interface KeeperChain {
  /** The signing account — must equal the vault's admin() before any send. */
  readonly account: Address;
  /** The Escrow vault sends target (ESCROW_ADDRESS). */
  readonly vault: Address;
  /** vault.admin() on-chain. */
  vaultAdmin(): Promise<Address>;
  /** ERC-20 balanceOf — the vault-balance precheck. */
  balanceOf(token: Address, owner: Address): Promise<bigint>;
  /** ERC-20 decimals() — fallback when the address isn't in the asset table. */
  decimalsOf(token: Address): Promise<number>;
  /**
   * Sign vault.transfer(token, to, atomic) WITH the attribution tag in the
   * calldata; returns the signed tx and its future hash. NOTHING is
   * broadcast — the hash exists before the tx could, which is what makes a
   * crashed run reconcilable.
   */
  signTransfer(
    token: Address,
    to: Address,
    atomic: bigint
  ): Promise<{ hash: Hex; signed: Hex }>;
  /** Broadcast a previously signed tx. */
  broadcast(signed: Hex): Promise<Hex>;
  /** Mined-receipt status; null = not found / still pending. */
  receiptStatus(hash: Hex): Promise<"success" | "reverted" | null>;
}

type ReadClient = Pick<
  ReturnType<typeof createPublicClient>,
  "readContract" | "getTransactionReceipt" | "sendRawTransaction"
>;
interface SignWallet {
  account: { address: Address };
  /** Fills nonce + fee fields + gas estimate — a transfer that would revert
   * throws here, before anything is signed or broadcast. */
  prepareTransactionRequest(args: {
    to: Address;
    data: Hex;
  }): Promise<Record<string, unknown>>;
  signTransaction(
    args: Record<string, unknown> & { to: Address; data: Hex }
  ): Promise<Hex>;
}

/**
 * The single send path — the smoke injects this same construction pointed at
 * ganache; production builds it on the configured chain with the ops key.
 * The tag is appended to the calldata directly (withAttribution only hooks
 * sendTransaction/writeContract, not signTransaction — the hash-before-
 * broadcast flow signs manually, so the suffix is added by hand).
 */
export function makeViemKeeperChain(deps: {
  client: ReadClient;
  wallet: SignWallet;
  vault: Address;
  tag: string;
}): KeeperChain {
  const { client, wallet, vault, tag } = deps;
  return {
    account: wallet.account.address,
    vault,
    async vaultAdmin() {
      return client.readContract({
        address: vault,
        abi: VAULT_ABI,
        functionName: "admin",
      }) as Promise<Address>;
    },
    balanceOf(token, owner) {
      return client.readContract({
        address: token,
        abi: ERC20_MIN_ABI,
        functionName: "balanceOf",
        args: [owner],
      });
    },
    async decimalsOf(token) {
      return Number(
        await client.readContract({
          address: token,
          abi: ERC20_MIN_ABI,
          functionName: "decimals",
        })
      );
    },
    async signTransfer(token, to, atomic) {
      const data = (
        encodeFunctionData({
          abi: VAULT_ABI,
          functionName: "transfer",
          args: [token, to, atomic],
        }) + toDataSuffix(tag).slice(2)
      ) as Hex;
      // prepare first: bare {to,data} has no fee type viem can infer, and
      // the gas estimate is a free would-it-revert check before signing.
      const prepared = await wallet.prepareTransactionRequest({
        to: vault,
        data,
      });
      const signed = await wallet.signTransaction({ ...prepared, to: vault, data });
      return { hash: keccak256(signed), signed };
    },
    async broadcast(signed) {
      return client.sendRawTransaction({ serializedTransaction: signed });
    },
    async receiptStatus(hash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return receipt.status === "success" ? "success" : "reverted";
      } catch {
        return null;
      }
    },
  };
}

export class KeeperUnavailable extends Error {
  constructor(
    readonly code:
      | "ops_wallet_unavailable"
      | "escrow_unconfigured"
      | "attribution_tag_missing"
      | "admin_mismatch",
    message: string
  ) {
    super(message);
    this.name = "KeeperUnavailable";
  }
}

let injectedChain: KeeperChain | null = null;
let defaultChain: KeeperChain | null = null;

/** Test hook — the smoke injects a ganache-backed chain; null restores env. */
export function setKeeperChain(chain: KeeperChain | null): void {
  injectedChain = chain;
}

/**
 * The ops-wallet chain: OPS_WALLET_PRIVATE_KEY on the configured network,
 * ESCROW_ADDRESS as the vault, CELO_ATTRIBUTION_TAG appended to calldata on
 * every send (untagged sends are refused outright — like escrow-lib.ts).
 * The key is read from the environment and never logged.
 */
export function keeperChain(): KeeperChain {
  if (injectedChain) return injectedChain;
  if (defaultChain) return defaultChain;
  const rawVault = process.env.ESCROW_ADDRESS?.trim();
  // non-strict: the deployed vault's env value predates checksum discipline
  // (mixed case, wrong EIP-55 casing) — getAddress normalizes it; the
  // vault.admin() read is the ground truth anyway.
  if (!rawVault || !isAddress(rawVault, { strict: false })) {
    throw new KeeperUnavailable(
      "escrow_unconfigured",
      "ESCROW_ADDRESS is not set or invalid — no Escrow vault to release from"
    );
  }
  const raw = process.env.OPS_WALLET_PRIVATE_KEY?.trim();
  const key = raw ? (raw.startsWith("0x") ? raw : `0x${raw}`) : null;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new KeeperUnavailable(
      "ops_wallet_unavailable",
      "OPS_WALLET_PRIVATE_KEY is not a 32-byte hex key"
    );
  }
  const tag = process.env.CELO_ATTRIBUTION_TAG?.trim();
  if (!tag?.startsWith("celo_")) {
    throw new KeeperUnavailable(
      "attribution_tag_missing",
      "CELO_ATTRIBUTION_TAG is not set — refusing to send untagged transactions"
    );
  }
  const transport = http(CONFIG.rpc);
  const client = createPublicClient({ chain: CONFIG.chain, transport });
  defaultChain = makeViemKeeperChain({
    client,
    wallet: createWalletClient({
      account: privateKeyToAccount(key as Hex),
      chain: CONFIG.chain,
      transport,
    }),
    vault: getAddress(rawVault),
    tag,
  });
  return defaultChain;
}

// ---------------------------------------------------------------------------
// The release processor — injectable so the smoke never runs the real
// process_escrow_releases() against production bookings.
// ---------------------------------------------------------------------------

export interface CreatedIntent {
  booking_id: string;
  payment_id: string | null;
  kind: string;
  stage?: string;
  amount_minor: number;
  // Dry-run only: the release processor resolves each would-be intent through
  // resolve_escrow_intent — the same lookup claim_escrow_intents uses — so the
  // report says where the release would land, not just that a row would post.
  outcome?: "send" | "held";
  to?: string | null;
  charge_asset?: string | null;
  charge_network?: string | null;
  reason?: string | null;
}
export interface ReleaseProcessorResult {
  ok: boolean;
  released?: string[];
  intents?: CreatedIntent[];
  dry_run?: boolean;
}
export type ReleaseProcessor = (
  dryRun: boolean
) => Promise<ReleaseProcessorResult>;

let injectedProcessor: ReleaseProcessor | null = null;
export function setReleaseProcessor(fn: ReleaseProcessor | null): void {
  injectedProcessor = fn;
}
const releaseProcessor: ReleaseProcessor = (dryRun) =>
  injectedProcessor ? injectedProcessor(dryRun) : processEscrowReleases(dryRun);

// ---------------------------------------------------------------------------
// RPC contracts (supabase/migrations/20261029170000_keeper_intent_execution.sql)
// ---------------------------------------------------------------------------

interface ClaimedIntent {
  payment_id: string;
  booking_id: string;
  kind: "release" | "refund";
  amount_minor: number;
  currency: string | null;
  outcome: "send" | "held";
  to: string | null;
  charge_asset: string | null;
  charge_network: string | null;
  reason: string | null;
}

interface AwaitingIntent {
  payment_id: string;
  booking_id: string;
  kind: string;
  amount_minor: number;
  resolved_to: string | null;
  resolved_token: string | null;
  resolved_network: string | null;
  attempt_tx_hash: string;
  executing_at: string;
}

interface RecoverResult {
  requeued?: string[];
  awaiting?: AwaitingIntent[];
}

// ---------------------------------------------------------------------------
// token resolution — the charge asset is a contract address for real
// settlements; the legacy sepolia rows stored a symbol ('usdc'). Symbols
// resolve through the active network's asset table; anything else is held.
// ---------------------------------------------------------------------------

const decimalsCache = new Map<string, number>();

async function resolveToken(
  chain: KeeperChain,
  chargeAsset: string | null
): Promise<{ token: Address; decimals: number } | { error: string }> {
  const raw = chargeAsset?.trim();
  if (!raw) return { error: "charge_asset_missing" };
  let token: Address | null = null;
  if (ADDR_RE.test(raw)) {
    token = getAddress(raw);
  } else {
    const def = CONFIG.tokens[raw.toLowerCase()];
    if (def) token = def.address;
  }
  if (!token) return { error: `unknown_asset:${raw}` };

  const tableDecimals = Object.values(CONFIG.tokens).find(
    (t) => t.address.toLowerCase() === token!.toLowerCase()
  )?.decimals;
  if (tableDecimals !== undefined) return { token, decimals: tableDecimals };

  const key = token.toLowerCase();
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return { token, decimals: cached };
  const decimals = await chain.decimalsOf(token);
  decimalsCache.set(key, decimals);
  return { token, decimals };
}

/** The chain the charge settled on must be the one this keeper serves —
 *  a sepolia charge must never pull funds out of the mainnet vault. */
function networkMatches(chargeNetwork: string | null): boolean {
  const n = chargeNetwork?.trim();
  return n === CONFIG.caip2 || n === CONFIG.name;
}

/** amount_minor (10^-6 domain) → token atomic units — same as toAtomic. */
function toAtomic(amountMinor: number | bigint, decimals: number): bigint {
  return BigInt(amountMinor) * 10n ** BigInt(decimals - 6);
}

// ---------------------------------------------------------------------------
// the cycle
// ---------------------------------------------------------------------------

interface ExecutedRow {
  payment_id: string;
  booking_id: string;
  kind: string;
  to: string;
  token: string;
  amount_minor: number;
  atomic: string;
  tx_hash: string;
}
interface HeldRow {
  payment_id: string;
  booking_id: string;
  kind: string;
  reason: string;
}
interface FailedRow {
  payment_id: string;
  booking_id: string;
  kind: string;
  error: string;
}

async function claimIntents(
  dryRun: boolean,
  bookingId?: string
): Promise<ClaimedIntent[]> {
  const { data, error } = await supabaseAdmin().rpc("claim_escrow_intents", {
    p_limit: 50,
    p_dry_run: dryRun,
    p_booking_id: bookingId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as ClaimedIntent[];
}

async function settleIntent(
  paymentId: string,
  outcome: "sent" | "held" | "failed",
  txHash?: string,
  error?: string
): Promise<void> {
  const { data, error: rpcErr } = await supabaseAdmin().rpc(
    "settle_escrow_intent",
    {
      p_payment_id: paymentId,
      p_outcome: outcome,
      p_tx_hash: txHash,
      p_error: error,
    }
  );
  const r = data as { ok?: boolean } | null;
  if (rpcErr || r?.ok !== true) {
    // The money may already have moved — a lost 'sent' write is the
    // dangerous case: the row would retry and double-pay. It can't: the
    // row stays 'executing' with the attempt hash recorded, and the next
    // run's recovery finalizes it from the receipt. Loud for ops either way.
    console.error(
      `keeper: CRITICAL — settle_escrow_intent(${paymentId}, ${outcome}) failed:`,
      rpcErr?.message ?? JSON.stringify(data)
    );
  }
}

/**
 * Pre-send evaluation shared by the real path and the dry run: token,
 * destination and network checks. A `held` outcome means the row can never
 * send under this configuration — a `failed` outcome means it can't send
 * right now (retryable).
 */
async function evaluateIntent(
  chain: KeeperChain | null,
  intent: ClaimedIntent,
  atomic: bigint | null
): Promise<
  | { ok: true; token: Address; decimals: number; atomic: bigint }
  | { ok: false; outcome: "held" | "failed"; reason: string }
> {
  if (!intent.to || !ADDR_RE.test(intent.to)) {
    return { ok: false, outcome: "held", reason: "invalid_destination" };
  }
  if (BURN_ADDRESSES.has(intent.to.toLowerCase())) {
    return { ok: false, outcome: "held", reason: "invalid_destination" };
  }
  if (!networkMatches(intent.charge_network)) {
    return {
      ok: false,
      outcome: "held",
      reason: `network_mismatch:${intent.charge_network ?? "none"}`,
    };
  }
  if (atomic !== null && atomic <= 0n) {
    return { ok: false, outcome: "held", reason: "invalid_amount" };
  }
  if (chain) {
    const t = await resolveToken(chain, intent.charge_asset);
    if ("error" in t) return { ok: false, outcome: "held", reason: t.error };
    if (t.decimals < 6) {
      return { ok: false, outcome: "held", reason: "unsupported_decimals" };
    }
    const amount = atomic ?? toAtomic(intent.amount_minor, t.decimals);
    if (amount <= 0n) {
      return { ok: false, outcome: "held", reason: "invalid_amount" };
    }
    return { ok: true, token: t.token, decimals: t.decimals, atomic: amount };
  }
  return { ok: false, outcome: "failed", reason: "chain_unavailable" };
}

export interface KeeperRunResult {
  ok: boolean;
  dry_run?: boolean;
  released?: string[];
  intents?: CreatedIntent[];
  requeued?: string[];
  recovered?: {
    payment_id: string;
    booking_id: string;
    tx_hash: string;
    outcome: "sent" | "reverted" | "awaiting_receipt";
  }[];
  executed?: ExecutedRow[];
  held?: HeldRow[];
  failed?: FailedRow[];
  preview?: unknown;
  config?: {
    network: string;
    caip2: string;
    vault: string | null;
    account: string | null;
    sender_ok: boolean;
    sender_error: string | null;
  };
  error?: string;
}

async function recoverIntents(
  chain: KeeperChain | null,
  dryRun: boolean
): Promise<Pick<KeeperRunResult, "requeued" | "recovered">> {
  const { data, error } = await supabaseAdmin().rpc("recover_escrow_intents", {
    p_stale_seconds: 600,
    p_dry_run: dryRun,
  });
  if (error) throw error;
  const r = (data ?? {}) as RecoverResult;
  const recovered: NonNullable<KeeperRunResult["recovered"]> = [];
  for (const row of r.awaiting ?? []) {
    if (!chain) {
      recovered.push({
        payment_id: row.payment_id,
        booking_id: row.booking_id,
        tx_hash: row.attempt_tx_hash,
        outcome: "awaiting_receipt",
      });
      continue;
    }
    const status = await chain.receiptStatus(
      row.attempt_tx_hash as Hex
    );
    if (status === "success") {
      // Broadcast confirmed — finalize without ever resending.
      await settleIntent(row.payment_id, "sent", row.attempt_tx_hash);
      recovered.push({
        payment_id: row.payment_id,
        booking_id: row.booking_id,
        tx_hash: row.attempt_tx_hash,
        outcome: "sent",
      });
    } else if (status === "reverted") {
      await settleIntent(
        row.payment_id,
        "failed",
        undefined,
        "transfer_reverted — the broadcast tx failed on-chain"
      );
      recovered.push({
        payment_id: row.payment_id,
        booking_id: row.booking_id,
        tx_hash: row.attempt_tx_hash,
        outcome: "reverted",
      });
    } else {
      // No receipt: possibly in flight, possibly never broadcast. NEVER
      // resent — the hash is on the row for the operator to reconcile.
      recovered.push({
        payment_id: row.payment_id,
        booking_id: row.booking_id,
        tx_hash: row.attempt_tx_hash,
        outcome: "awaiting_receipt",
      });
    }
  }
  return { requeued: r.requeued ?? [], recovered };
}

/**
 * One keeper cycle — everything POST /internal/keeper does, callable
 * directly by the smoke (which injects the chain + release processor).
 */
export async function runKeeper(opts: {
  dryRun?: boolean;
  bookingId?: string;
}): Promise<KeeperRunResult> {
  const dryRun = opts.dryRun === true;
  const releases = await releaseProcessor(dryRun);

  // Peek without claiming: is there sendable work this run? (dry-run is also
  // the only claim call in dry mode — it IS the report.) The recovery peek
  // matters twice: 'executing' rows carrying an attempt hash need the chain
  // for a receipt check, and a stale hash-less row will be REQUEUED by the
  // real recovery — it only becomes claimable after that, so the chain
  // decision and the sendable gate must look at post-recovery state.
  const peek = await claimIntents(true, opts.bookingId);
  const recoveryPeek = await recoverIntents(null, true);
  const mightSend =
    peek.some((i) => i.outcome === "send") ||
    // Dry-run only: the intents the release processor WOULD post are sendable
    // too — the report must reflect the signer/admin/balance checks a real
    // run would face, or the first run's pre-flight is blind.
    (releases.intents ?? []).some((i) => i.outcome === "send") ||
    (recoveryPeek.requeued ?? []).length > 0;
  const needsReceiptCheck = (recoveryPeek.recovered ?? []).length > 0;

  // Build the chain only when something could actually move or need a
  // receipt read. A keeper with no ops key still advances the bookkeeping
  // and reports held rows — but the moment a send is due, a missing key is
  // an explicit failure, never silent.
  let chain: KeeperChain | null = null;
  let chainError: KeeperUnavailable | null = null;
  if (mightSend || needsReceiptCheck) {
    try {
      chain = keeperChain();
    } catch (err) {
      chainError =
        err instanceof KeeperUnavailable
          ? err
          : new KeeperUnavailable(
              "ops_wallet_unavailable",
              err instanceof Error ? err.message : String(err)
            );
      chain = null;
    }
  }

  // The signing key must control the vault — checked before anything
  // sendable is claimed; a mismatch refuses the sends (recovery's receipt
  // reads still work: they don't need the signer).
  if (chain && mightSend) {
    try {
      const admin = await chain.vaultAdmin();
      if (getAddress(admin) !== getAddress(chain.account)) {
        chainError = new KeeperUnavailable(
          "admin_mismatch",
          `the ops key derives to ${chain.account} but the vault's admin is ` +
            `${admin} — refusing to send a call that would revert`
        );
      }
    } catch (err) {
      chainError = new KeeperUnavailable(
        "ops_wallet_unavailable",
        `vault.admin() read failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const recovery = await recoverIntents(chain, dryRun);
  // Post-recovery, requeued rows are claimable again — the sendable gate
  // sees the world as the real claim will. (In dry mode nothing was
  // requeued, so the earlier peek already is the accurate report.)
  const sendable = dryRun
    ? peek.some((i) => i.outcome === "send")
    : (await claimIntents(true, opts.bookingId)).some(
        (i) => i.outcome === "send"
      );

  if (dryRun) {
    const recoveryReport = recovery;
    // One evaluation for existing intents (peek) and for the intents this
    // run WOULD post (releases.intents) — the operator sees exactly where
    // each would send, or why it would hold, before running for real.
    const evaluateForReport = async (i: ClaimedIntent) => {
      if (i.outcome === "held") return { would: "held" as const };
      let atomic: bigint | null = null;
      if (chain) {
        const t = await resolveToken(chain, i.charge_asset).catch(() => null);
        if (t && !("error" in t) && t.decimals >= 6) {
          atomic = toAtomic(i.amount_minor, t.decimals);
        }
      }
      const verdict = await evaluateIntent(chain, i, atomic).catch((err) => ({
        ok: false as const,
        outcome: "failed" as const,
        reason: err instanceof Error ? err.message : String(err),
      }));
      return verdict.ok
        ? {
            would: "send" as const,
            token: verdict.token,
            decimals: verdict.decimals,
            atomic: verdict.atomic.toString(),
            vault_balance_ok: chain
              ? await chain
                  .balanceOf(verdict.token, chain.vault)
                  .then((b) => b >= verdict.atomic)
                  .catch(() => null)
              : null,
          }
        : { would: verdict.outcome, reason: verdict.reason };
    };
    const intents = [];
    for (const i of peek) {
      intents.push({ ...i, ...(await evaluateForReport(i)) });
    }
    const preview = [];
    for (const p of releases.intents ?? []) {
      preview.push({
        ...p,
        ...(await evaluateForReport({
          payment_id: p.payment_id ?? "",
          booking_id: p.booking_id,
          kind: p.kind as ClaimedIntent["kind"],
          amount_minor: p.amount_minor,
          currency: null,
          outcome: p.outcome === "send" ? "send" : "held",
          to: p.to ?? null,
          charge_asset: p.charge_asset ?? null,
          charge_network: p.charge_network ?? null,
          reason: p.reason ?? null,
        })),
      });
    }
    return {
      ok: true,
      dry_run: true,
      released: releases.released,
      intents,
      preview,
      requeued: recoveryReport.requeued,
      recovered: recoveryReport.recovered,
      config: {
        network: CONFIG.name,
        caip2: CONFIG.caip2,
        vault: chain?.vault ?? process.env.ESCROW_ADDRESS ?? null,
        account: chain?.account ?? null,
        sender_ok: chain !== null && chainError === null,
        sender_error: chainError?.message ?? null,
      },
    };
  }

  if (sendable && chainError) {
    // A send is due but the sender can't sign/match — explicit failure,
    // nothing was claimed, every row stays pending (retryable).
    return {
      ok: false,
      error: chainError.message,
      released: releases.released,
      intents: releases.intents,
      requeued: recovery.requeued,
      recovered: recovery.recovered,
      executed: [],
      held: [],
      failed: peek.map((i) => ({
        payment_id: i.payment_id,
        booking_id: i.booking_id,
        kind: i.kind,
        error:
          i.outcome === "send" ? chainError!.code : (i.reason ?? "held"),
      })),
    };
  }

  const claimed = await claimIntents(false, opts.bookingId);
  const executed: ExecutedRow[] = [];
  const held: HeldRow[] = [];
  const failed: FailedRow[] = [];

  for (const intent of claimed) {
    if (intent.outcome === "held") {
      held.push({
        payment_id: intent.payment_id,
        booking_id: intent.booking_id,
        kind: intent.kind,
        reason: intent.reason ?? "held",
      });
      continue;
    }
    const fail = async (error: string) => {
      await settleIntent(intent.payment_id, "failed", undefined, error);
      failed.push({
        payment_id: intent.payment_id,
        booking_id: intent.booking_id,
        kind: intent.kind,
        error,
      });
    };
    const hold = async (reason: string) => {
      await settleIntent(intent.payment_id, "held", undefined, reason);
      held.push({
        payment_id: intent.payment_id,
        booking_id: intent.booking_id,
        kind: intent.kind,
        reason,
      });
    };

    try {
      const verdict = await evaluateIntent(chain, intent, null);
      if (!verdict.ok) {
        if (verdict.outcome === "held") await hold(verdict.reason);
        else await fail(verdict.reason);
        continue;
      }
      const { token, atomic } = verdict;

      // The vault must actually hold the token — an explicit failure rather
      // than a tx that would revert.
      const balance = await chain!.balanceOf(token, chain!.vault);
      if (balance < atomic) {
        await fail(
          `vault_insufficient_balance: holds ${balance} < ${atomic} of ${token}`
        );
        continue;
      }

      // Sign → record the hash → broadcast → receipt. The hash is on the row
      // before the tx can exist, so a crash after this point is reconciled
      // from the chain, never resent blind.
      const { hash, signed } = await chain!.signTransfer(
        token,
        getAddress(intent.to!),
        atomic
      );
      const { data: recorded } = await supabaseAdmin().rpc(
        "record_escrow_attempt",
        { p_payment_id: intent.payment_id, p_tx_hash: hash }
      );
      if ((recorded as { ok?: boolean } | null)?.ok !== true) {
        // Refusing to broadcast is always safe — but settling 'failed' is
        // not: 'not_executing' can mean ANOTHER attempt's hash already sits
        // on the row (a crashed run's, or a requeue race). Marking failed
        // would make it retryable while that earlier tx may still land —
        // the double-pay path. Leave 'executing': recovery reconciles the
        // recorded hash (or requeues once stale and hash-less).
        failed.push({
          payment_id: intent.payment_id,
          booking_id: intent.booking_id,
          kind: intent.kind,
          error: `attempt_conflict:${hash} — attempt hash not recorded; left 'executing' for recovery`,
        });
        continue;
      }
      try {
        await chain!.broadcast(signed);
      } catch (broadcastErr) {
        // The tx may or may not have propagated — the hash is recorded, so
        // the row stays 'executing' and the next run's recovery reconciles
        // from the receipt. NOT settled failed: resending could double-pay.
        failed.push({
          payment_id: intent.payment_id,
          booking_id: intent.booking_id,
          kind: intent.kind,
          error: `broadcast_uncertain:${hash} — ${broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr)}`,
        });
        continue;
      }
      // The receipt won't be mined instantly on a real chain — poll briefly
      // (KEEPER_RECEIPT_WAIT_MS, default 30 s); still nothing → the row
      // stays 'executing' and a later run's recovery finalizes it.
      const receiptWait = Number(
        process.env.KEEPER_RECEIPT_WAIT_MS ?? 30_000
      );
      const deadline = Date.now() + receiptWait;
      let status = await chain!.receiptStatus(hash);
      while (status === null && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2_000));
        status = await chain!.receiptStatus(hash);
      }
      if (status === "success") {
        await settleIntent(intent.payment_id, "sent", hash);
        executed.push({
          payment_id: intent.payment_id,
          booking_id: intent.booking_id,
          kind: intent.kind,
          to: intent.to!,
          token,
          amount_minor: intent.amount_minor,
          atomic: atomic.toString(),
          tx_hash: hash,
        });
      } else if (status === "reverted") {
        await fail("transfer_reverted — the vault refused the transfer");
      } else {
        // Broadcast but no receipt yet — leave 'executing'; the next run
        // finalizes from the receipt.
        failed.push({
          payment_id: intent.payment_id,
          booking_id: intent.booking_id,
          kind: intent.kind,
          error: `awaiting_receipt:${hash}`,
        });
      }
    } catch (err) {
      await fail(err instanceof Error ? err.message : String(err));
    }
  }

  return {
    ok: true,
    released: releases.released,
    intents: releases.intents,
    requeued: recovery.requeued,
    recovered: recovery.recovered,
    executed,
    held,
    failed,
  };
}

// ---------------------------------------------------------------------------
// route
// ---------------------------------------------------------------------------

function authorized(header: string | undefined): boolean {
  const secret = process.env.KEEPER_SECRET;
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!secret || !m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

keeper.post("/keeper", async (c) => {
  if (!authorized(c.req.header("authorization")))
    return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    dryRun?: unknown;
    dry_run?: unknown;
    booking_id?: unknown;
  } | null;
  const dryRun =
    c.req.query("dryRun") === "true" ||
    c.req.query("dry_run") === "true" ||
    body?.dryRun === true ||
    body?.dry_run === true;
  const bookingId =
    typeof body?.booking_id === "string" ? body.booking_id : undefined;
  try {
    const result = await runKeeper({ dryRun, bookingId });
    return c.json(result, result.ok === false ? 502 : 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("keeper: run failed", err);
    return c.json({ ok: false, error: message }, 502);
  }
});

export default keeper;
