// Local verification of the Escrow keeper (issue #69) — the whole send path
// on an in-process ganache chain, no real funds, no on-chain tx on any real
// network. Run:
//
//   pnpm smoke:keeper
//
// The API's keeper module runs IN this process against the real Supabase
// project: fixture business/property/listing/booking/payment rows (all ids
// `smk`-prefixed, deleted in `finally`) stand in for a Booking lifecycle —
// the charge row carries the ganache-deployed mock wFIAT's address, and the
// intents are inserted directly as pending release/refund payments.
//
// The chain is injected via setKeeperChain — the SAME makeViemKeeperChain
// the env path builds, pointed at the throwaway chain — and the release
// processor is stubbed via setReleaseProcessor so the smoke NEVER runs the
// real process_escrow_releases() against production bookings. Keeper runs
// are scoped with {bookingId} so a fixture can never touch a real row.
//
// The matrix it proves:
//   1. the route is closed without KEEPER_SECRET / a wrong Bearer → 401
//   2. dryRun resolves token/to/atomic exactly, claims nothing, sends nothing
//   3. a verified-Owner release moves the real Escrow vault's tokens on-chain,
//      lands the ERC-8021 attribution tag, and the row ends 'sent' + tx_hash
//   4. an unverified Owner is HELD (payout_unverified), nothing moves — and
//      the same row self-heals and sends once payout_verified_at lands
//   5. a business with no payout_address is HELD 'payout_missing'
//   6. a Cancellation refund returns to the charge's payer (the Traveler's
//      Agent wallet), never anywhere else
//   7. two concurrent keeper runs produce exactly one transfer per intent
//   8. insufficient vault balance → explicit retryable 'failed', and the
//      retry succeeds once the vault is topped up
//   9. an RPC failure mid-send → explicit retryable 'failed'
//  10. no OPS_WALLET_PRIVATE_KEY / no ESCROW_ADDRESS → explicit failure,
//      nothing claimed (rows stay 'pending')
//  11. a key that isn't the vault admin → admin_mismatch, nothing sent
//  12. stuck-row recovery: stale hash-less 'executing' requeues and sends in
//      the same run; recorded-hash rows are reconciled from receipts
//      (success → sent, reverted → failed, absent → left 'executing'),
//      and a fresh hash-less 'executing' row is never touched

import "dotenv/config";
import ganache from "ganache";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { verifyTx } from "@celo/attribution-tags";
import keeperApp, {
  makeViemKeeperChain,
  runKeeper,
  setKeeperChain,
  setReleaseProcessor,
  type KeeperChain,
} from "../src/keeper.js";
import { CONFIG } from "../src/x402.js";
import { compileAll } from "./escrow-lib.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env");
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Well-known dev keys (hardhat accounts #0/#1) — the smoke's "ops wallet"
// and a signer that is NOT the vault admin. They only exist inside the
// throwaway chain; the real OPS_WALLET_PRIVATE_KEY is never read.
const DEV_OPS_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const DEV_OUTSIDER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const TAG = process.env.CELO_ATTRIBUTION_TAG ?? "celo_40fb48026a9f";
const DECIMALS = 18; // SmokeARS — the wFIAT shape (no-bool transfer too)
const toAtomic = (minor: number | bigint) =>
  BigInt(minor) * 10n ** BigInt(DECIMALS - 6);

// Static recipients — ganache needs no key for them, they only hold tokens.
const OWNER_PAYOUT = getAddress("0x1111111111111111111111111111111111111111");
const TRAVELER = getAddress("0x3333333333333333333333333333333333333333");

let failures = 0;
const step = (name: string) => console.log(`\n▸ ${name}`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const assert = (cond: boolean, msg: string) => (cond ? ok(msg) : fail(msg));

// ---------------------------------------------------------------------------
// fixtures — service-role inserts; every id carries the run stamp and is
// deleted in `finally` (payments cascade with their booking).
// ---------------------------------------------------------------------------

const stamp = Date.now();
const fixture = {
  businesses: [] as string[],
  properties: [] as string[],
  listings: [] as string[],
  bookings: [] as string[],
};

async function fixtureListing(opts: {
  payout?: Address | null;
  verified?: boolean;
}) {
  const sfx = `${stamp}_${fixture.businesses.length}`;
  const busId = `bus_smk${sfx}`;
  const prpId = `prp_smk${sfx}`;
  const lstId = `lst_smk${sfx}`;
  const { error: e1 } = await admin.from("businesses").insert({
    id: busId,
    name: "Smoke Keeper Posada",
    slug: busId,
    payout_address: opts.payout ?? null,
    ...(opts.verified ? { payout_verified_at: new Date().toISOString() } : {}),
  });
  if (e1) throw e1;
  fixture.businesses.push(busId);
  const { error: e2 } = await admin.from("properties").insert({
    id: prpId,
    business_id: busId,
    name: "Smoke Keeper Posada",
    city: "Colonia",
    country_code: "AR",
    property_type: "posada",
    checkin_time: "14:00",
    checkout_time: "11:00",
    timezone: "America/Argentina/Buenos_Aires",
  });
  if (e2) throw e2;
  fixture.properties.push(prpId);
  const { error: e3 } = await admin.from("listings").insert({
    id: lstId,
    property_id: prpId,
    title: "Smoke Keeper Posada",
    slug: lstId,
    kind: "entire_place",
    status: "published",
    max_guests: 2,
    currency: "ARS",
    base_price_minor: 50_000_000_000,
  });
  if (e3) throw e3;
  fixture.listings.push(lstId);
  return { busId, lstId };
}

async function fixtureBooking(listing: string, escrow: Address) {
  const id = `bkg_smk${stamp}_${fixture.bookings.length}`;
  const { error } = await admin.from("bookings").insert({
    id,
    listing_id: listing,
    checkin: "2026-01-10",
    checkout: "2026-01-12",
    guests: 2,
    total_minor: 1_050_000,
    service_fee_minor: 50_000,
    currency: "ARS",
    status: "confirmed",
    escrow_status: "funded",
    escrow_address: escrow,
    cancel_deadline: "2026-01-05",
  });
  if (error) throw error;
  fixture.bookings.push(id);
  return id;
}

/** The Booking's settlement row — payer/asset/network are what the keeper
 * resolves the token and the refund destination from. */
async function fixtureCharge(
  booking: string,
  token: Address,
  payer: Address,
  vault: Address
) {
  const { error } = await admin.from("payments").insert({
    booking_id: booking,
    payer,
    pay_to: vault,
    amount_minor: 1_000_000,
    asset: token, // the real settlements store the contract address
    network: CONFIG.caip2,
    tx_hash: `0x${"ab".repeat(32)}`,
    facilitator_ref: booking,
    kind: "charge",
  });
  if (error) throw error;
}

async function fixtureIntent(
  booking: string,
  kind: "release" | "refund",
  amountMinor: number,
  extra: Record<string, unknown> = {}
) {
  const { data, error } = await admin
    .from("payments")
    .insert({
      booking_id: booking,
      pay_to: null, // resolved live at claim time — like a pre-verification write
      amount_minor: amountMinor,
      asset: "ARS", // intents store the fiat symbol, NOT the token address
      network: "celo",
      facilitator_ref: booking,
      kind,
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const payment = (id: string) =>
  admin.from("payments").select("*").eq("id", id).single();

async function cleanup() {
  for (const id of fixture.bookings)
    await admin.from("bookings").delete().eq("id", id); // payments cascade
  for (const id of fixture.listings)
    await admin.from("listings").delete().eq("id", id);
  for (const id of fixture.properties)
    await admin.from("properties").delete().eq("id", id);
  for (const id of fixture.businesses)
    await admin.from("businesses").delete().eq("id", id);
}

// ---------------------------------------------------------------------------

async function main() {
  const ops = privateKeyToAccount(DEV_OPS_KEY);
  const outsider = privateKeyToAccount(DEV_OUTSIDER_KEY);
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: {
      accounts: [
        { secretKey: DEV_OPS_KEY, balance: "0x56BC75E2D63100000" },
        { secretKey: DEV_OUTSIDER_KEY, balance: "0x56BC75E2D63100000" },
      ],
    },
  });

  // env saved for the failure tests that unset it.
  const envBackup = {
    OPS_WALLET_PRIVATE_KEY: process.env.OPS_WALLET_PRIVATE_KEY,
    ESCROW_ADDRESS: process.env.ESCROW_ADDRESS,
    KEEPER_SECRET: process.env.KEEPER_SECRET,
    KEEPER_RECEIPT_WAIT_MS: process.env.KEEPER_RECEIPT_WAIT_MS,
  };
  const restoreEnv = () => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  process.env.KEEPER_RECEIPT_WAIT_MS = "5000";

  try {
    const chainId = Number(await provider.request({ method: "eth_chainId" }));
    const ganacheChain = defineChain({
      id: chainId,
      name: "keeper-smoke",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [] } },
    });
    const client = createPublicClient({
      chain: ganacheChain,
      transport: custom(provider, { retryCount: 0 }),
    });
    const walletOf = (account: PrivateKeyAccount) =>
      createWalletClient({
        account,
        chain: ganacheChain,
        transport: custom(provider, { retryCount: 0 }),
      });
    const opsWallet = walletOf(ops);
    const outsiderWallet = walletOf(outsider);

    step("compile + deploy the real Escrow.sol and a mock wFIAT");
    const contracts = compileAll(["Escrow.sol", "test/LocalTokens.sol"]);
    const vaultAbi = contracts.EscrowVault.abi;
    const vaultHash = await opsWallet.sendTransaction({
      data: contracts.EscrowVault.bytecode,
    });
    const vaultAddr = (await client.waitForTransactionReceipt({
      hash: vaultHash,
    })).contractAddress as Address;
    const tokenHash = await outsiderWallet.sendTransaction({
      data: contracts.SmokeARS.bytecode,
    });
    const token = (await client.waitForTransactionReceipt({
      hash: tokenHash,
    })).contractAddress as Address;
    assert(
      Boolean(vaultAddr) && Boolean(token),
      `vault ${vaultAddr} token ${token}`
    );
    if (!vaultAddr || !token) throw new Error("deploy failed");

    // Fund the vault: a plain ERC-20 transfer — the x402 settle shape.
    const FUND = 1_000n * 10n ** BigInt(DECIMALS); // 1000 sARS
    await outsiderWallet.sendTransaction({
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [vaultAddr, FUND],
      }),
    });
    const balanceOf = (owner: Address) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      });
    assert((await balanceOf(vaultAddr)) === FUND, "vault funded");

    // The injected chain — same construction production builds on env vars.
    const chain = makeViemKeeperChain({
      client,
      wallet: opsWallet,
      vault: vaultAddr,
      tag: TAG,
    });
    const wrongChain = makeViemKeeperChain({
      client,
      wallet: outsiderWallet,
      vault: vaultAddr,
      tag: TAG,
    });
    setKeeperChain(chain);
    // Never touch production bookings: the release processor is stubbed.
    setReleaseProcessor(async () => ({ ok: true, released: [], intents: [] }));

    // -- 1. the route is closed ------------------------------------------------
    step("route auth: no KEEPER_SECRET / wrong Bearer → 401");
    delete process.env.KEEPER_SECRET;
    const closed = await keeperApp.request("/keeper", {
      method: "POST",
      headers: { authorization: "Bearer anything" },
    });
    assert(closed.status === 401, `KEEPER_SECRET unset → ${closed.status}`);
    process.env.KEEPER_SECRET = "smoke-secret";
    const wrong = await keeperApp.request("/keeper", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    assert(wrong.status === 401, `wrong Bearer → ${wrong.status}`);
    restoreEnv();

    // -- 2. a verified-Owner release ------------------------------------------
    step("verified-Owner release sends vault.transfer on-chain");
    // Every release fixture hangs off this VERIFIED business; the unverified
    // and missing-payout variants get their own listings below.
    const { lstId } = await fixtureListing({
      payout: OWNER_PAYOUT,
      verified: true,
    });
    const booking1 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking1, token, TRAVELER, vaultAddr);
    const intent1 = await fixtureIntent(booking1, "release", 500_000); // 0.5 sARS

    // The dry run also resolves the intents process_escrow_releases WOULD
    // post — the stub mirrors the RPC's resolved preview for booking1.
    setReleaseProcessor(async (dry) =>
      dry
        ? {
            ok: true,
            released: [booking1],
            intents: [
              {
                booking_id: booking1,
                payment_id: null,
                kind: "release",
                stage: "first",
                amount_minor: 400_000,
                outcome: "send" as const,
                to: OWNER_PAYOUT,
                charge_asset: token,
                charge_network: "eip155:42220",
                reason: null,
              },
            ],
          }
        : { ok: true, released: [], intents: [] }
    );
    const dry = await runKeeper({ dryRun: true, bookingId: booking1 });
    const d = (dry.intents as Record<string, unknown>[] | undefined)?.find(
      (i) => i.payment_id === intent1
    );
    assert(
      dry.dry_run === true &&
        d?.would === "send" &&
        getAddress(String(d.token)) === getAddress(token) &&
        getAddress(String(d.to)) === OWNER_PAYOUT &&
        d.atomic === toAtomic(500_000).toString(),
      `dryRun resolves send: ${JSON.stringify(d)}`
    );
    const dp = (dry.preview as Record<string, unknown>[] | undefined)?.find(
      (i) => i.booking_id === booking1 && i.payment_id === null
    );
    assert(
      dp?.would === "send" &&
        getAddress(String(dp.to)) === OWNER_PAYOUT &&
        getAddress(String(dp.token)) === getAddress(token) &&
        dp.atomic === toAtomic(400_000).toString(),
      `dryRun resolves the would-be intent: ${JSON.stringify(dp)}`
    );
    const dryRow = (await payment(intent1)).data;
    assert(
      dryRow?.status === "pending" && dryRow.tx_hash === null,
      "dryRun claimed/changed nothing"
    );
    setReleaseProcessor(async () => ({ ok: true, released: [], intents: [] }));

    const run1 = await runKeeper({ bookingId: booking1 });
    const e1 = run1.executed?.find((e) => e.payment_id === intent1);
    assert(
      run1.ok === true && typeof e1?.tx_hash === "string",
      `executed: ${JSON.stringify(run1)}`
    );
    const sentRow = (await payment(intent1)).data;
    assert(
      sentRow?.status === "sent" &&
        sentRow.tx_hash === e1?.tx_hash &&
        sentRow.sent_at !== null &&
        getAddress(sentRow.resolved_to ?? "") === OWNER_PAYOUT,
      `row 'sent' + tx_hash ${sentRow?.tx_hash}`
    );
    assert(
      (await balanceOf(OWNER_PAYOUT)) === toAtomic(500_000),
      `Owner got exactly ${formatUnits(toAtomic(500_000), DECIMALS)} sARS`
    );
    const attr = await verifyTx({ client, hash: e1!.tx_hash as Hex });
    assert(
      attr?.codes.includes(TAG) === true,
      `release tx tag: ${attr?.codes.join(", ") ?? "none"}`
    );

    // -- 3. unverified / missing payout -----------------------------------------
    step("unverified Owner → held, then self-heals once verified");
    const { lstId: lstUnverified } = await fixtureListing({
      payout: OWNER_PAYOUT,
    });
    const booking2 = await fixtureBooking(lstUnverified, vaultAddr);
    await fixtureCharge(booking2, token, TRAVELER, vaultAddr);
    const intent2 = await fixtureIntent(booking2, "release", 100_000);
    const balBefore = await balanceOf(OWNER_PAYOUT);
    const run2 = await runKeeper({ bookingId: booking2 });
    const h2 = run2.held?.find((h) => h.payment_id === intent2);
    assert(
      h2?.reason === "payout_unverified" &&
        (await balanceOf(OWNER_PAYOUT)) === balBefore,
      `held: ${JSON.stringify(h2)}`
    );
    assert(
      (await payment(intent2)).data?.status === "held",
      "row held, visible reason"
    );
    // Self-heal: verify the business → next run sends the same row.
    await admin
      .from("businesses")
      .update({ payout_verified_at: new Date().toISOString() })
      .eq("id", fixture.businesses.at(-1)!);
    const run2b = await runKeeper({ bookingId: booking2 });
    assert(
      run2b.executed?.some((e) => e.payment_id === intent2) === true,
      "verified later → the held row sends"
    );

    step("no payout_address at all → held 'payout_missing'");
    const { lstId: lstNoPayout } = await fixtureListing({ payout: null });
    const booking3 = await fixtureBooking(lstNoPayout, vaultAddr);
    await fixtureCharge(booking3, token, TRAVELER, vaultAddr);
    const intent3 = await fixtureIntent(booking3, "release", 100_000);
    const run3 = await runKeeper({ bookingId: booking3 });
    assert(
      run3.held?.some(
        (h) => h.payment_id === intent3 && h.reason === "payout_missing"
      ) === true,
      `held: ${JSON.stringify(run3.held)}`
    );

    // -- 4. cancellation refund ----------------------------------------------------
    step("Cancellation refund → back to the charge payer (Traveler wallet)");
    const booking4 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking4, token, TRAVELER, vaultAddr);
    const intent4 = await fixtureIntent(booking4, "refund", 200_000, {
      payer: vaultAddr, // refund corridor: escrow → payer
    });
    const travBefore = await balanceOf(TRAVELER);
    const run4 = await runKeeper({ bookingId: booking4 });
    assert(
      run4.executed?.some((e) => e.payment_id === intent4) === true &&
        (await balanceOf(TRAVELER)) === travBefore + toAtomic(200_000),
      `refund landed at the payer: ${JSON.stringify(run4.executed)}`
    );

    // -- 5. concurrency --------------------------------------------------------------
    step("two concurrent keeper runs → exactly one transfer per intent");
    const booking5 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking5, token, TRAVELER, vaultAddr);
    const i5a = await fixtureIntent(booking5, "release", 111_111);
    const i5b = await fixtureIntent(booking5, "refund", 222_222);
    const ownerBefore = await balanceOf(OWNER_PAYOUT);
    const [ra, rb] = await Promise.all([
      runKeeper({ bookingId: booking5 }),
      runKeeper({ bookingId: booking5 }),
    ]);
    // A failed claim leaves the row retryable — a third run flushes leftovers
    // so the assertion is about exactly-once, not about which run won.
    const rc = await runKeeper({ bookingId: booking5 });
    const ids = [
      ...(ra.executed ?? []),
      ...(rb.executed ?? []),
      ...(rc.executed ?? []),
    ].map((e) => e.payment_id);
    assert(
      new Set(ids).size === ids.length &&
        ids.includes(i5a) &&
        ids.includes(i5b),
      `one execution each: ${JSON.stringify(ids)}`
    );
    assert(
      (await balanceOf(OWNER_PAYOUT)) === ownerBefore + toAtomic(111_111) &&
        (await balanceOf(TRAVELER)) ===
          travBefore + toAtomic(200_000) + toAtomic(222_222),
      "balances moved exactly once"
    );

    // -- 6. insufficient vault balance ----------------------------------------------
    step("insufficient vault balance → explicit retryable failure");
    const booking6 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking6, token, TRAVELER, vaultAddr);
    const vaultBal = await balanceOf(vaultAddr);
    // One minor unit MORE than the vault holds — fails the precheck.
    const i6 = await fixtureIntent(
      booking6,
      "release",
      Number(vaultBal / 10n ** 12n) + 1
    );
    const run6 = await runKeeper({ bookingId: booking6 });
    const f6 = run6.failed?.find((f) => f.payment_id === i6);
    assert(
      f6?.error?.includes("vault_insufficient_balance") === true &&
        (await payment(i6)).data?.status === "failed",
      `failed retryable: ${f6?.error}`
    );
    // Top the vault up → the SAME row retries and succeeds.
    await outsiderWallet.sendTransaction({
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [vaultAddr, toAtomic(10_000_000)],
      }),
    });
    const run6b = await runKeeper({ bookingId: booking6 });
    assert(
      run6b.executed?.some((e) => e.payment_id === i6) === true,
      "topped up → the failed row sends"
    );

    // -- 7. send-path RPC failure ------------------------------------------------------
    step("send-path failure → explicit retryable 'failed'");
    const booking7 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking7, token, TRAVELER, vaultAddr);
    const i7 = await fixtureIntent(booking7, "release", 50_000);
    const broken: KeeperChain = {
      ...chain,
      signTransfer: async () => {
        throw new Error("simulated RPC failure");
      },
    };
    setKeeperChain(broken);
    const run7 = await runKeeper({ bookingId: booking7 });
    const f7 = run7.failed?.find((f) => f.payment_id === i7);
    assert(
      f7?.error?.includes("simulated RPC failure") === true &&
        (await payment(i7)).data?.status === "failed",
      `failed retryable: ${f7?.error}`
    );
    setKeeperChain(chain);
    const run7b = await runKeeper({ bookingId: booking7 });
    assert(
      run7b.executed?.some((e) => e.payment_id === i7) === true,
      "healthy sender → retry sends"
    );

    // -- 8. env failures ------------------------------------------------------------------
    step("no ops key / no vault configured → explicit failure, nothing claimed");
    const booking8 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking8, token, TRAVELER, vaultAddr);
    const i8 = await fixtureIntent(booking8, "release", 50_000);
    setKeeperChain(null); // fall through to the env path
    const savedKey = process.env.OPS_WALLET_PRIVATE_KEY;
    const savedVault = process.env.ESCROW_ADDRESS;
    delete process.env.OPS_WALLET_PRIVATE_KEY;
    const run8 = await runKeeper({ bookingId: booking8 });
    assert(
      run8.ok === false &&
        run8.failed?.some(
          (f) => f.payment_id === i8 && f.error === "ops_wallet_unavailable"
        ) === true &&
        (await payment(i8)).data?.status === "pending",
      `no key → ${run8.error}`
    );
    delete process.env.ESCROW_ADDRESS;
    if (savedKey) process.env.OPS_WALLET_PRIVATE_KEY = savedKey;
    const run8b = await runKeeper({ bookingId: booking8 });
    assert(
      run8b.failed?.some(
        (f) => f.payment_id === i8 && f.error === "escrow_unconfigured"
      ) === true,
      `no vault → ${run8b.error}`
    );
    if (savedVault) process.env.ESCROW_ADDRESS = savedVault;
    restoreEnv();
    setKeeperChain(chain);

    // -- 9. admin mismatch --------------------------------------------------------------------
    step("key that isn't the vault admin → admin_mismatch, nothing sent");
    const booking9 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking9, token, TRAVELER, vaultAddr);
    const i9 = await fixtureIntent(booking9, "release", 50_000);
    setKeeperChain(wrongChain); // signs with outsider, vault admin is ops
    const bal9 = await balanceOf(OWNER_PAYOUT);
    const run9 = await runKeeper({ bookingId: booking9 });
    assert(
      run9.ok === false &&
        run9.failed?.some(
          (f) => f.payment_id === i9 && f.error === "admin_mismatch"
        ) === true &&
        (await balanceOf(OWNER_PAYOUT)) === bal9 &&
        (await payment(i9)).data?.status === "pending",
      `admin_mismatch → ${run9.error}`
    );
    setKeeperChain(chain);
    const run9b = await runKeeper({ bookingId: booking9 });
    assert(
      run9b.executed?.some((e) => e.payment_id === i9) === true,
      "right admin → retry sends"
    );

    // -- 10. stuck-row recovery -----------------------------------------------------------------
    step("recovery: stale hash-less 'executing' requeues and sends same-run");
    const booking10 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking10, token, TRAVELER, vaultAddr);
    const i10 = await fixtureIntent(booking10, "release", 60_000, {
      status: "executing",
      executing_at: new Date(Date.now() - 900_000).toISOString(), // 15 min — stale
      resolved_to: OWNER_PAYOUT,
    });
    const run10 = await runKeeper({ bookingId: booking10 });
    assert(
      run10.requeued?.includes(i10) === true &&
        run10.executed?.some((e) => e.payment_id === i10) === true,
      "requeued → claimed → sent in one pass"
    );

    step("recovery: recorded hashes reconcile from receipts");
    const booking11 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking11, token, TRAVELER, vaultAddr);
    // a) a hash whose tx succeeded → settled sent (never resent)
    const goodTx = await outsiderWallet.sendTransaction({
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [TRAVELER, 1n],
      }),
    });
    const i11a = await fixtureIntent(booking11, "release", 70_000, {
      status: "executing",
      executing_at: new Date(Date.now() - 900_000).toISOString(),
      attempt_tx_hash: goodTx,
      resolved_to: OWNER_PAYOUT,
    });
    // b) a hash whose tx reverted → failed, retryable. sendRawTransaction
    //    bypasses viem's gas estimation (which refuses a reverting tx
    //    before it can ever have a hash); explicit gas + gasPrice skips the
    //    estimate and fixes the tx type.
    const revertedSigned = await outsiderWallet.signTransaction({
      to: vaultAddr,
      data: encodeFunctionData({
        abi: vaultAbi,
        functionName: "transfer",
        args: [token, TRAVELER, 1n],
      }),
      gas: 200_000n,
      gasPrice: await client.getGasPrice(),
    });
    const revertedHash = await client.sendRawTransaction({
      serializedTransaction: revertedSigned,
    });
    const revertedReceipt = await client.getTransactionReceipt({
      hash: revertedHash,
    });
    assert(
      revertedReceipt.status === "reverted",
      "fixture revert tx actually reverted on-chain"
    );
    const i11b = await fixtureIntent(booking11, "release", 70_000, {
      status: "executing",
      executing_at: new Date(Date.now() - 900_000).toISOString(),
      attempt_tx_hash: revertedHash,
      resolved_to: OWNER_PAYOUT,
    });
    // c) a hash that doesn't exist → left 'executing', never resent
    const ghostHash = keccak256("0xdeadbeef");
    const i11c = await fixtureIntent(booking11, "release", 70_000, {
      status: "executing",
      executing_at: new Date(Date.now() - 900_000).toISOString(),
      attempt_tx_hash: ghostHash,
      resolved_to: OWNER_PAYOUT,
    });
    // d) a FRESH hash-less executing row → untouched (could be a live send)
    const i11d = await fixtureIntent(booking11, "release", 70_000, {
      status: "executing",
      executing_at: new Date().toISOString(),
      resolved_to: OWNER_PAYOUT,
    });
    const run11 = await runKeeper({ bookingId: booking11 });
    const r11 = run11.recovered ?? [];
    assert(
      r11.some((r) => r.payment_id === i11a && r.outcome === "sent") &&
        (await payment(i11a)).data?.status === "sent" &&
        (await payment(i11a)).data?.tx_hash === goodTx,
      "landed hash → 'sent' from the receipt, no resend"
    );
    // The reverted attempt is reconciled to 'failed' — then the SAME run's
    // claim retries it (failed is a claim candidate, one retry per cycle)
    // and the well-formed send lands: 'sent' with a NEW hash, proving the
    // retry path and that nothing double-paid.
    const i11bRow = (await payment(i11b)).data;
    assert(
      r11.some((r) => r.payment_id === i11b && r.outcome === "reverted") &&
        i11bRow?.status === "sent" &&
        i11bRow.tx_hash !== revertedHash &&
        run11.executed?.some((e) => e.payment_id === i11b) === true,
      `reverted hash → reconciled, retried, sent with a new hash: row=${JSON.stringify(i11bRow)}`
    );
    assert(
      r11.some(
        (r) => r.payment_id === i11c && r.outcome === "awaiting_receipt"
      ) && (await payment(i11c)).data?.status === "executing",
      "absent hash → stays 'executing', never resent"
    );
    assert(
      (await payment(i11d)).data?.status === "executing",
      "fresh hash-less row untouched — could be a live send"
    );

    // -- 11. dry run never claims/sends ------------------------------------------------------
    step("dryRun claims nothing, sends nothing");
    const booking12 = await fixtureBooking(lstId, vaultAddr);
    await fixtureCharge(booking12, token, TRAVELER, vaultAddr);
    const i12 = await fixtureIntent(booking12, "release", 80_000);
    const vaultBefore = await balanceOf(vaultAddr);
    const run12 = await runKeeper({ dryRun: true, bookingId: booking12 });
    const i12row = (await payment(i12)).data;
    assert(
      run12.dry_run === true &&
        i12row?.status === "pending" &&
        i12row.executing_at === null &&
        (await balanceOf(vaultAddr)) === vaultBefore,
      "dryRun: row untouched, vault untouched"
    );

    console.log(
      failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`
    );
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    setKeeperChain(null);
    setReleaseProcessor(null);
    restoreEnv();
    await cleanup();
    await provider.disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
