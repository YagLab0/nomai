// Local verification of the Owner payout flow (issue #68) — the whole
// lifecycle on an in-process ganache chain, no real funds, no on-chain tx on
// any real network. Run:
//
//   pnpm smoke:payout
//
// The API's payout module runs IN this process against the real Supabase
// project (fixture Owner user + business, cleaned up in `finally`), while the
// sender is injected — the SAME makeViemPayoutSender the ops path uses,
// pointed at the throwaway chain via a viem custom transport, with the real
// CELO_ATTRIBUTION_TAG (falling back to the project's code) appended exactly
// like production. PAYOUT_TOKEN_ADDRESS/_DECIMALS point the wFIAT the route
// resolves (ARS → wars) at a compiled-in-script mock ERC-20 — 18 decimals,
// the wFIAT shape.
//
// The matrix it proves:
//   1. PUT /owners/payout stores a checksummed address; zero/placeholder and
//      malformed addresses are refused before anything is written
//   2. POST /owners/payout/verify sends an ERC-20 transfer of the resolved
//      wFIAT to the stored address — attribution tag in the calldata — and
//      opens a pending verification; the moved amount is exactly the
//      expected one (read via service role — it is never served to clients)
//   3. a second verify while pending → 409 verification_pending
//   4. GET /owners/payout shows the pending state + attempts left — and no
//      response ever contains the expected amount
//   5. two wrong confirms → 422 amount_mismatch, attempts_left 2 then 1
//   6. the right amount verifies → payout_verified_at is stamped
//   7. re-saving the SAME address keeps the verification; a NEW address
//      clears payout_verified_at and cancels the pending row
//   8. on a fresh verification, three wrong confirms → the third answers
//      422 verification_failed
//   9. the 24 h one-per-business limit → 429 verification_cooldown
//  10. an ops wallet that can't cover the amount → 503
//      ops_float_insufficient — no row opened, no tx sent
//  11. a send that fails → 502 send_failed, the row is cancelled, and a
//      cancelled verification does NOT burn the 24 h cooldown

import "dotenv/config";
import ganache from "ganache";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTx, withAttribution } from "@celo/attribution-tags";
import payout, {
  makeViemPayoutSender,
  setPayoutSender,
  type PayoutSender,
} from "../src/payout.js";
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
// signInWithPassword mutates the client's auth state — keep it on its own
// client so `admin` stays service-role for fixtures and checks.
const signin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Well-known dev key (hardhat account #0) — the smoke's "ops wallet". It
// only exists inside the throwaway chain; the real key is never read.
const DEV_OPS_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TAG = process.env.CELO_ATTRIBUTION_TAG ?? "celo_40fb48026a9f";
const TOKEN_DECIMALS = 18;

let failures = 0;
const step = (name: string) => console.log(`\n▸ ${name}`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const assert = (cond: boolean, msg: string) => (cond ? ok(msg) : fail(msg));

/** In-process calls against the real routers (mounted under /owners). */
const call = async (
  path: string,
  token: string | undefined,
  method: string,
  body?: unknown
) => {
  const res = await payout.request(path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

/** No response may leak the expected deposit — key or digits. */
const assertNoAmountLeak = (body: unknown, expectedAtomic: bigint | null) => {
  const raw = JSON.stringify(body ?? {});
  assert(
    !raw.includes("amount_atomic") &&
      (expectedAtomic === null || !raw.includes(expectedAtomic.toString())),
    "no expected amount in the response"
  );
};

/** The fixture's stored verification row (service role CAN read it). */
const latestVerification = (businessId: string) =>
  admin
    .from("payout_verifications")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

async function main() {
  const ops = privateKeyToAccount(DEV_OPS_KEY);
  const recipient = getAddress(
    "0x1111111111111111111111111111111111111111"
  );
  const recipient2 = getAddress(
    "0x2222222222222222222222222222222222222222"
  );

  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: {
      accounts: [{ secretKey: DEV_OPS_KEY, balance: "0x56BC75E2D63100000" }],
    },
  });

  // Fixture bookkeeping for the finally{} cleanup.
  let fixtureUserId: string | null = null;
  let fixtureBusinessId: string | null = null;
  let fixturePropertyId: string | null = null;
  let fixtureListingId: string | null = null;

  try {
    const chainId = Number(await provider.request({ method: "eth_chainId" }));
    const chain = defineChain({
      id: chainId,
      name: "payout-smoke",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [] } },
    });
    const client = createPublicClient({
      chain,
      transport: custom(provider, { retryCount: 0 }),
    });
    // The injected sender: the same construction the ops path uses, on the
    // throwaway chain — tag included, so the deposit tx carries it like any
    // ops transaction.
    const wallet = createWalletClient({
      account: ops,
      chain,
      transport: custom(provider, { retryCount: 0 }),
    }).extend(withAttribution(TAG));
    const sender = makeViemPayoutSender({ client, wallet });

    step("compile + deploy the mock wFIAT on ganache");
    const contracts = compileAll(["test/LocalTokens.sol"]);
    assert(Boolean(contracts.SmokeARS?.bytecode), "SmokeARS compiled");
    const deployHash = await wallet.sendTransaction({
      data: contracts.SmokeARS.bytecode,
    });
    const deployReceipt = await client.waitForTransactionReceipt({
      hash: deployHash,
    });
    const tokenAddress = deployReceipt.contractAddress as Address;
    assert(
      deployReceipt.status === "success" && Boolean(tokenAddress),
      `mock wFIAT at ${tokenAddress ?? "?"}`
    );

    // The route resolves ARS → wars → these env overrides land it on the
    // mock instead of the real token address. Read at request time.
    process.env.PAYOUT_TOKEN_ADDRESS = tokenAddress;
    process.env.PAYOUT_TOKEN_DECIMALS = String(TOKEN_DECIMALS);
    setPayoutSender(sender);

    const balanceOf = async (owner: Address): Promise<bigint> =>
      BigInt(
        String(
          await client.readContract({
            address: tokenAddress,
            abi: contracts.SmokeARS.abi,
            functionName: "balanceOf",
            args: [owner],
          })
        )
      );

    // -- fixture: a real Owner user + business + property + listing ---------
    step("fixture: throwaway Owner + business + AR listing");
    const stamp = Date.now();
    const password = `smoke-${Math.random().toString(36).slice(2)}A1!`;
    const email = `smoke-payout-${stamp}@example.com`;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr || !created.user) throw cErr ?? new Error("no fixture user");
    fixtureUserId = created.user.id;
    const { data: session, error: sErr } =
      await signin.auth.signInWithPassword({ email, password });
    if (sErr || !session.session) throw sErr ?? new Error("no fixture session");
    const token = session.session.access_token;
    ok(`owner ${fixtureUserId}`);

    const busId = `bus_smoke${stamp}`;
    const prpId = `prp_smoke${stamp}`;
    const lstId = `lst_smoke${stamp}`;
    fixtureBusinessId = busId;
    fixturePropertyId = prpId;
    fixtureListingId = lstId;
    const { error: busErr } = await admin.from("businesses").insert({
      id: busId,
      name: "Smoke Posada",
      slug: busId,
      user_id: fixtureUserId,
    });
    if (busErr) throw busErr;
    const { error: prpErr } = await admin.from("properties").insert({
      id: prpId,
      business_id: busId,
      name: "Smoke Posada",
      city: "Colonia",
      country_code: "AR",
      property_type: "posada",
      checkin_time: "14:00",
      checkout_time: "11:00",
      timezone: "America/Argentina/Buenos_Aires",
    });
    if (prpErr) throw prpErr;
    const { error: lstErr } = await admin.from("listings").insert({
      id: lstId,
      property_id: prpId,
      title: "Smoke Posada",
      slug: lstId,
      kind: "entire_place",
      status: "published",
      max_guests: 2,
      currency: "ARS",
      base_price_minor: 50_000_000_000,
    });
    if (lstErr) throw lstErr;
    ok(`business ${busId} + published ARS listing`);

    // -- 1. PUT the address --------------------------------------------------
    step("PUT /owners/payout stores a checksummed address");
    const bad = await call("/payout", token, "PUT", { address: "0x1234" });
    assert(
      bad.status === 400 && bad.body?.error === "invalid_address",
      `malformed → ${bad.status} ${JSON.stringify(bad.body)}`
    );
    for (const a of [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000001",
    ]) {
      const res = await call("/payout", token, "PUT", { address: a });
      assert(
        res.status === 400 && res.body?.error === "invalid_address",
        `placeholder ${a.slice(0, 12)}… → ${res.status}`
      );
    }
    const noAuth = await call("/payout", undefined, "PUT", {
      address: recipient,
    });
    assert(noAuth.status === 401, `no token → ${noAuth.status}`);
    // A lowercase paste must be accepted and stored checksummed.
    const put = await call("/payout", token, "PUT", {
      address: recipient.toLowerCase(),
    });
    assert(
      put.status === 200 &&
        getAddress(put.body?.address) === recipient &&
        put.body?.verified_at === null,
      `stored ${put.body?.address} (${put.status})`
    );

    // -- 2. start the verification -------------------------------------------
    step("POST /owners/payout/verify sends the test deposit");
    const verify = await call("/payout/verify", token, "POST");
    const txHash = verify.body?.verification?.tx_hash as Hex | undefined;
    assert(
      verify.status === 200 && typeof txHash === "string" && txHash.startsWith("0x"),
      `deposit sent: ${txHash ?? JSON.stringify(verify.body)}`
    );
    const row = (await latestVerification(busId)).data;
    assert(
      row?.status === "pending" && row.tx_hash === txHash && row.attempts === 0,
      `pending row: ${row?.status} tx ${row?.tx_hash}`
    );
    const expectedAtomic = BigInt(Math.trunc(Number(row?.amount_atomic ?? 0)));
    assert(
      expectedAtomic >= 11n * 10n ** 16n && expectedAtomic <= 99n * 10n ** 16n,
      `expected amount in the 0.11–0.99 band (${formatUnits(expectedAtomic, TOKEN_DECIMALS)})`
    );
    const recipBal = await balanceOf(recipient);
    assert(
      recipBal === expectedAtomic,
      `recipient holds exactly the deposit (${formatUnits(recipBal, TOKEN_DECIMALS)})`
    );
    if (txHash) {
      const attr = await verifyTx({ client, hash: txHash });
      assert(
        attr?.codes.includes(TAG) === true,
        `deposit tx tag: ${attr?.codes.join(", ") ?? "none"}`
      );
    }

    step("second verify while pending → 409 verification_pending");
    const again = await call("/payout/verify", token, "POST");
    assert(
      again.status === 409 && again.body?.error === "verification_pending",
      `got ${again.status} ${JSON.stringify(again.body)}`
    );

    step("GET /owners/payout shows pending — never the amount");
    const status1 = await call("/payout", token, "GET");
    assert(
      status1.status === 200 &&
        getAddress(status1.body?.address) === recipient &&
        status1.body?.verified_at === null &&
        status1.body?.verification?.status === "pending" &&
        status1.body?.verification?.attempts_left === 3 &&
        status1.body?.verification?.token === "wars" &&
        status1.body?.verification?.currency === "ARS" &&
        status1.body?.verification?.tx_hash === txHash,
      `status: ${JSON.stringify(status1.body)}`
    );
    assertNoAmountLeak(status1.body, expectedAtomic);
    assertNoAmountLeak(verify.body, expectedAtomic);

    // -- 3. confirm ----------------------------------------------------------
    step("two wrong confirms → 422 amount_mismatch, attempts 2 → 1");
    const miss1 = await call("/payout/confirm", token, "POST", { amount: "9.99" });
    assert(
      miss1.status === 422 &&
        miss1.body?.error === "amount_mismatch" &&
        miss1.body?.attempts_left === 2,
      `miss 1: ${miss1.status} ${JSON.stringify(miss1.body)}`
    );
    const miss2 = await call("/payout/confirm", token, "POST", { amount: "8,88" });
    assert(
      miss2.status === 422 &&
        miss2.body?.error === "amount_mismatch" &&
        miss2.body?.attempts_left === 1,
      `miss 2 (comma decimals): ${miss2.status} ${JSON.stringify(miss2.body)}`
    );

    step("right amount → verified");
    const expected = formatUnits(expectedAtomic, TOKEN_DECIMALS);
    const hit = await call("/payout/confirm", token, "POST", { amount: expected });
    assert(
      hit.status === 200 && typeof hit.body?.verified_at === "string",
      `confirmed ${expected}: ${hit.status} ${JSON.stringify(hit.body)}`
    );
    const status2 = await call("/payout", token, "GET");
    const stampEq = (a: unknown, b: unknown) =>
      typeof a === "string" &&
      typeof b === "string" &&
      new Date(a).getTime() === new Date(b).getTime();
    assert(
      stampEq(status2.body?.verified_at, hit.body?.verified_at) &&
        status2.body?.verification?.status === "verified",
      `GET verified_at stamped: ${status2.body?.verified_at}`
    );
    const biz1 = await admin
      .from("businesses")
      .select("payout_verified_at")
      .eq("id", busId)
      .single();
    assert(
      stampEq(biz1.data?.payout_verified_at, hit.body?.verified_at),
      "businesses.payout_verified_at stamped"
    );
    const noPending = await call("/payout/confirm", token, "POST", {
      amount: expected,
    });
    assert(
      noPending.status === 409 &&
        noPending.body?.error === "no_pending_verification",
      `confirm after verify → ${noPending.status}`
    );

    // -- 4. address changes reset --------------------------------------------
    step("re-saving the SAME address keeps verification; a new one resets");
    const rePut = await call("/payout", token, "PUT", { address: recipient });
    assert(
      rePut.status === 200 && stampEq(rePut.body?.verified_at, hit.body?.verified_at),
      `same address keeps verified_at (${rePut.body?.verified_at})`
    );
    const change = await call("/payout", token, "PUT", { address: recipient2 });
    assert(
      change.status === 200 && change.body?.verified_at === null,
      `new address clears verified_at (${change.status})`
    );
    const status3 = await call("/payout", token, "GET");
    assert(
      status3.body?.verified_at === null &&
        getAddress(status3.body?.address) === recipient2,
      `GET after change: ${JSON.stringify(status3.body)}`
    );
    const cancelled = (await latestVerification(busId)).data;
    assert(
      cancelled?.status === "verified" || cancelled?.status === "cancelled",
      `old row left pending? got ${cancelled?.status}`
    );

    // -- 5. the 24 h limit -----------------------------------------------------
    step("verify again within 24 h → 429 verification_cooldown");
    // Per business, stricter than the issue's per-address phrasing — an
    // Owner cycling addresses would bypass a per-address limit entirely.
    const cooldown = await call("/payout/verify", token, "POST");
    assert(
      cooldown.status === 429 &&
        cooldown.body?.error === "verification_cooldown" &&
        typeof cooldown.body?.retry_at === "string",
      `got ${cooldown.status} ${JSON.stringify(cooldown.body)}`
    );

    // Age the fixture rows past the gates (a fixture-only convenience — like
    // seeding funded_at) so the rest of the matrix can run.
    const ageRows = () =>
      admin
        .from("payout_verifications")
        .update({ created_at: aged24, expires_at: aged24 })
        .eq("business_id", busId);
    const aged24 = new Date(Date.now() - 2 * 86_400_000).toISOString();

    // -- 6. three misses void the verification --------------------------------
    step("fresh verification → three wrong confirms → verification_failed");
    await ageRows();
    const verify2 = await call("/payout/verify", token, "POST");
    assert(
      verify2.status === 200 && verify2.body?.verification?.id,
      `second deposit: ${verify2.body?.verification?.tx_hash}`
    );
    const row2 = (await latestVerification(busId)).data;
    assert(
      row2?.address === recipient2 && row2.status === "pending",
      "row tracks the NEW address"
    );
    const missA = await call("/payout/confirm", token, "POST", { amount: "9.99" });
    const missB = await call("/payout/confirm", token, "POST", { amount: "9.99" });
    const missC = await call("/payout/confirm", token, "POST", { amount: "9.99" });
    assert(
      missA.body?.attempts_left === 2 &&
        missB.body?.attempts_left === 1 &&
        missC.status === 422 &&
        missC.body?.error === "verification_failed" &&
        missC.body?.attempts_left === 0,
      `3rd miss → ${missC.status} ${JSON.stringify(missC.body)}`
    );

    // -- 7. insufficient ops float ---------------------------------------------
    step("ops wallet can't cover → 503 ops_float_insufficient, nothing sent");
    await ageRows();
    const drySender: PayoutSender = {
      ...sender,
      float: async () => 0n,
    };
    setPayoutSender(drySender);
    const before = await balanceOf(recipient2);
    const rowsBefore = (
      await admin
        .from("payout_verifications")
        .select("id", { count: "exact", head: true })
        .eq("business_id", busId)
    ).count;
    const dry = await call("/payout/verify", token, "POST");
    assert(
      dry.status === 503 && dry.body?.error === "ops_float_insufficient",
      `got ${dry.status} ${JSON.stringify(dry.body)}`
    );
    const after = await balanceOf(recipient2);
    const rowsAfter = (
      await admin
        .from("payout_verifications")
        .select("id", { count: "exact", head: true })
        .eq("business_id", busId)
    ).count;
    assert(
      after === before && rowsAfter === rowsBefore,
      "no tx sent and no verification row opened"
    );

    // -- 8. a failed send cancels, not burns ------------------------------------
    step("a send failure → 502 send_failed, row cancelled, no cooldown");
    setPayoutSender({
      ...sender,
      sendTestDeposit: async () => {
        throw new Error("simulated RPC failure");
      },
    });
    const failed = await call("/payout/verify", token, "POST");
    assert(
      failed.status === 502 && failed.body?.error === "send_failed",
      `got ${failed.status} ${JSON.stringify(failed.body)}`
    );
    const cancelledRow = (await latestVerification(busId)).data;
    assert(
      cancelledRow?.status === "cancelled" && cancelledRow.tx_hash === null,
      `row cancelled: ${cancelledRow?.status}`
    );
    setPayoutSender(sender);
    const verify3 = await call("/payout/verify", token, "POST");
    assert(
      verify3.status === 200 && verify3.body?.verification?.tx_hash,
      `cancelled rows don't burn the cooldown — next verify sends (${
        verify3.body?.verification?.tx_hash
      })`
    );
    const row3 = (await latestVerification(busId)).data;
    assert(
      row3?.status === "pending" && row3.tx_hash === verify3.body?.verification?.tx_hash,
      `fresh pending row opened (${row3?.status})`
    );

    console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`);
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    setPayoutSender(null);
    delete process.env.PAYOUT_TOKEN_ADDRESS;
    delete process.env.PAYOUT_TOKEN_DECIMALS;
    // Fixture cleanup — verification rows, then the business tree, then auth.
    if (fixtureBusinessId) {
      await admin
        .from("payout_verifications")
        .delete()
        .eq("business_id", fixtureBusinessId);
    }
    if (fixtureListingId) {
      await admin.from("listings").delete().eq("id", fixtureListingId);
    }
    if (fixturePropertyId) {
      await admin.from("properties").delete().eq("id", fixturePropertyId);
    }
    if (fixtureBusinessId) {
      await admin.from("businesses").delete().eq("id", fixtureBusinessId);
    }
    if (fixtureUserId) {
      await admin.auth.admin.deleteUser(fixtureUserId);
    }
    await provider.disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
