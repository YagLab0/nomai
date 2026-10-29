// E2E smoke for POST /wallet/:traveler_id/payment-auth (issue #60) — run with
// `pnpm smoke:payment-auth` while `pnpm api:dev` is up (NOMAI_API_URL
// overrides the base). viajera@nomai.dev (nomai123) covers the cases that need
// a real funded row; the signing paths run on spawned API instances pointed
// at a selector-aware RPC stub so they need no real funds.
//
//   1. no token                                   → 401
//   2. throwaway Traveler's token on her path     → 403
//   3. malformed bodies                           → 400 invalid_requirements
//      (+ foreign network → unsupported_network)
//   4. funded_at null                             → 403 funding_required,
//      and NO agent_wallets row is minted on the refusal
//   5. payTo != the Escrow vault                  → 403 destination_forbidden
//      — the endpoint can never sign to an arbitrary address
//   6. asset outside X402_ASSETS (wBRL, USDC)     → 400 unsupported_asset
//   7. amount > viajera's real wARS balance       → 409 insufficient_balance
//      naming token/currency/required/available/missing
//   8. happy path on the stub-RPC mainnet instance (fresh throwaway Traveler,
//      funded_at seeded): 200 + a well-formed X-PAYMENT — Permit2 witness
//      signature and the sponsored EIP-2612 permit BOTH recover to the
//      Traveler's provisioned Agent wallet
//   9. same on a forced-testnet instance (USDC)   → the EIP-3009
//      transferWithAuthorization branch, recovered likewise
//  10. agent_wallets row rewritten to an address the derived key does not
//      control                                    → 503 wallet_unavailable
//      (never sign for a wallet the key doesn't own)
//  11. spawned variants: ESCROW_ADDRESS unset     → 503 escrow_unavailable;
//      AGENT_WALLET_MASTER_SECRET unset           → 503 wallet_unavailable.
//
// Nothing here ever settles: signature checks are local recoverTypedDataAddress
// calls only — the facilitator is never contacted, and no transaction is sent
// on any network.

import { createClient } from "@supabase/supabase-js";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import {
  getAddress,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { X402 } from "../src/x402.js";

const BASE = (process.env.NOMAI_API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  ""
);
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
// client so `admin` stays service-role for data checks and cleanup.
const signin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const API_DIR = fileURLToPath(new URL("..", import.meta.url));
const BASE_PORT = Number(new URL(BASE).port || 3001);

// The seeded funded Traveler — see scripts/seed-test-users.mjs / AGENTS.md.
const VIAJERA = {
  email: process.env.TU_TRAVELER_EMAIL ?? "viajera@nomai.dev",
  password: process.env.TU_TRAVELER_PASSWORD ?? "nomai123",
};
const VAULT = process.env.ESCROW_ADDRESS as Address | undefined;
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
const WARS = X402.mainnet.tokens.wars;
const SEPOLIA_USDC = X402.testnet.tokens.usdc;
const MAINNET_CAIP2 = X402.mainnet.caip2;
const SEPOLIA_CAIP2 = X402.testnet.caip2;

// The typed-data shapes the endpoint's signatures bind — the same tables the
// @x402/evm scheme signs with. Recomputed locally so the smoke needs nothing
// but viem to verify them.
const permit2WitnessTypes = {
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "Witness" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  Witness: [
    { name: "to", type: "address" },
    { name: "validAfter", type: "uint256" },
  ],
} as const;
const eip2612PermitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
const eip3009Types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

let failures = 0;
const step = (name: string) => console.log(`\n▸ ${name}`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const assert = (cond: boolean, msg: string) => (cond ? ok(msg) : fail(msg));

const call = async (
  path: string,
  token: string | undefined,
  body?: unknown,
  base = BASE
) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const walletRows = (travelerId: string) =>
  admin
    .from("agent_wallets")
    .select("id, address, network")
    .eq("traveler_id", travelerId);

async function makeTraveler(email: string) {
  const password = `smoke-${Math.random().toString(36).slice(2)}A1!`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr || !created.user) throw cErr ?? new Error("no user");
  const { data: session, error: sErr } = await signin.auth.signInWithPassword({
    email,
    password,
  });
  if (sErr || !session.session) throw sErr ?? new Error("no session");
  return { id: created.user.id, token: session.session.access_token };
}

/** Boots another API instance on `port` with `env` overrides; waits for /free. */
async function spawnApi(
  port: number,
  env: Record<string, string>
): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts"],
    {
      cwd: API_DIR,
      env: { ...process.env, PORT: String(port), ...env },
      stdio: ["ignore", "inherit", "inherit"],
    }
  );
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const res = await fetch(`http://localhost:${port}/free`).catch(() => null);
    if (res?.ok) return child;
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill();
  throw new Error(`api on :${port} did not come up`);
}

/**
 * Selector-aware JSON-RPC stub for eth_call: balanceOf answers from a mutable
 * per-token map, allowance stays 0 (so the sponsored EIP-2612 permit is
 * signed), nonces returns 0 — the only reads the payment-auth signing path
 * performs. Everything else gets a JSON-RPC error.
 */
function startRpcStub(balances: Map<string, bigint>) {
  const answer = (msg: { id?: unknown; method?: string; params?: unknown }) => {
    if (msg.method === "eth_chainId") {
      return { jsonrpc: "2.0", id: msg.id ?? null, result: "0xa4ec" };
    }
    if (msg.method === "eth_call") {
      const call = (msg.params as [{ to?: string; data?: string }] | undefined)?.[0];
      const to = String(call?.to ?? "").toLowerCase();
      const selector = String(call?.data ?? "").slice(0, 10).toLowerCase();
      let value = 0n;
      if (selector === "0x70a08231") value = balances.get(to) ?? 0n; // balanceOf
      // 0xdd62ed3e allowance → 0; 0x7ecebe00 nonces → 0; anything else → 0
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: `0x${value.toString(16).padStart(64, "0")}`,
      };
    }
    return {
      jsonrpc: "2.0",
      id: msg.id ?? null,
      error: { code: -32601, message: `stub: ${msg.method} unsupported` },
    };
  };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(raw) as unknown;
        const msgs = Array.isArray(parsed) ? parsed : [parsed];
        const results = msgs.map(answer);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(Array.isArray(parsed) ? results : results[0]));
      } catch {
        res.statusCode = 400;
        res.end();
      }
    });
  });
  return new Promise<{ port: number; close: () => void }>((resolve) => {
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => server.close() });
    });
  });
}

/** A valid requirements entry for a mainnet API (wARS → the vault). */
const warsRequirements = (amountAtomic: bigint, overrides = {}) => ({
  scheme: "exact",
  network: MAINNET_CAIP2,
  asset: WARS.address,
  amount: amountAtomic.toString(),
  payTo: VAULT,
  maxTimeoutSeconds: 300,
  extra: {
    name: WARS.domain.name,
    version: WARS.domain.version,
    assetTransferMethod: "permit2",
  },
  ...overrides,
});

interface Permit2Authorization {
  from: Address;
  permitted: { token: Address; amount: string };
  spender: Address;
  nonce: string;
  deadline: string;
  witness: { to: Address; validAfter: string };
}

interface Eip3009Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

interface Eip2612Info {
  from: Address;
  asset: Address;
  spender: Address;
  amount: string;
  nonce: string;
  deadline: string;
  signature: Hex;
  version: string;
}

interface PaymentPayloadDecoded {
  x402Version: number;
  resource?: { url: string };
  accepted: {
    scheme: string;
    network: string;
    asset: Address;
    amount: string;
    payTo: Address;
    maxTimeoutSeconds: number;
    extra: Record<string, unknown>;
  };
  payload: {
    signature: Hex;
    permit2Authorization?: Permit2Authorization;
    authorization?: Eip3009Authorization;
  };
  extensions?: Record<string, { info?: unknown }>;
}

const decodeXPayment = (xPayment: string): PaymentPayloadDecoded =>
  JSON.parse(Buffer.from(xPayment, "base64").toString("utf8"));

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** Shared asserts on the decoded X-PAYMENT envelope + the permit2 signatures. */
async function assertPermit2Payload(
  xPayment: string,
  wallet: Address,
  amountAtomic: bigint
) {
  const decoded = decodeXPayment(xPayment);
  assert(
    decoded.x402Version === 2 &&
      decoded.accepted.scheme === "exact" &&
      decoded.accepted.network === MAINNET_CAIP2 &&
      getAddress(decoded.accepted.payTo) === getAddress(VAULT as Address) &&
      getAddress(decoded.accepted.asset) === getAddress(WARS.address) &&
      decoded.accepted.amount === amountAtomic.toString() &&
      decoded.accepted.extra?.assetTransferMethod === "permit2",
    `accepted: ${JSON.stringify(decoded.accepted)}`
  );

  const auth = decoded.payload.permit2Authorization;
  const authOk =
    auth !== undefined &&
    getAddress(auth.from) === getAddress(wallet) &&
    getAddress(auth.permitted.token) === getAddress(WARS.address) &&
    auth.permitted.amount === amountAtomic.toString() &&
    getAddress(auth.witness.to) === getAddress(VAULT as Address) &&
    auth.witness.validAfter === "0";
  assert(authOk, `permit2Authorization: ${JSON.stringify(auth ?? "missing")}`);

  if (auth) {
    // Local recovery — the ONLY signature check, no facilitator, no tx.
    const recovered = await recoverTypedDataAddress({
      domain: { name: "Permit2", chainId: 42220, verifyingContract: PERMIT2 },
      types: permit2WitnessTypes,
      primaryType: "PermitWitnessTransferFrom",
      message: {
        permitted: {
          token: getAddress(auth.permitted.token),
          amount: BigInt(auth.permitted.amount),
        },
        spender: getAddress(auth.spender),
        nonce: BigInt(auth.nonce),
        deadline: BigInt(auth.deadline),
        witness: {
          to: getAddress(auth.witness.to),
          validAfter: BigInt(auth.witness.validAfter),
        },
      },
      signature: decoded.payload.signature,
    });
    assert(
      getAddress(recovered) === getAddress(wallet),
      `witness signer recovered: ${recovered}`
    );
  }

  const permit = decoded.extensions?.eip2612GasSponsoring?.info as
    | Eip2612Info
    | undefined;
  assert(
    permit !== undefined &&
      getAddress(permit.from) === getAddress(wallet) &&
      getAddress(permit.asset) === getAddress(WARS.address) &&
      getAddress(permit.spender) === getAddress(PERMIT2) &&
      permit.amount === amountAtomic.toString(),
    `eip2612GasSponsoring.info: ${JSON.stringify(permit ?? "missing")}`
  );
  if (permit) {
    const recoveredPermit = await recoverTypedDataAddress({
      domain: {
        name: WARS.domain.name,
        version: WARS.domain.version,
        chainId: 42220,
        verifyingContract: getAddress(WARS.address),
      },
      types: eip2612PermitTypes,
      primaryType: "Permit",
      message: {
        owner: getAddress(permit.from),
        spender: getAddress(permit.spender),
        value: BigInt(permit.amount),
        nonce: BigInt(permit.nonce),
        deadline: BigInt(permit.deadline),
      },
      signature: permit.signature,
    });
    assert(
      getAddress(recoveredPermit) === getAddress(wallet),
      `permit signer recovered: ${recoveredPermit}`
    );
  }
}

async function main() {
  if (!VAULT) {
    console.error("ESCROW_ADDRESS must be set in .env");
    process.exit(1);
  }
  const ids: string[] = [];
  const children: ChildProcess[] = [];
  const stubs: (() => void)[] = [];

  try {
    step("sign in viajera (funded) + create a throwaway Traveler");
    const { data: vSess, error: vErr } = await signin.auth.signInWithPassword({
      email: VIAJERA.email,
      password: VIAJERA.password,
    });
    if (vErr || !vSess.session) {
      throw vErr ?? new Error(`cannot sign in ${VIAJERA.email}`);
    }
    const viajera = {
      id: vSess.user.id,
      token: vSess.session.access_token,
    };
    const viajeraWallet = (await walletRows(viajera.id)).data?.[0]?.address;
    ok(`viajera ${viajera.id}, wallet ${viajeraWallet ?? "(unprovisioned)"}`);
    const stamp = Date.now();
    const other = await makeTraveler(`smoke-payauth-${stamp}@example.com`);
    ids.push(other.id);

    const amount = 100n * 10n ** 18n; // 100 wARS
    const reqs = warsRequirements(amount);
    const payAuth = (
      t: string | undefined,
      id = viajera.id,
      body?: unknown,
      base?: string
    ) =>
      call(
        `/wallet/${id}/payment-auth`,
        t,
        body ?? { requirements: reqs },
        base
      );

    step("no token → 401");
    const noAuth = await payAuth(undefined);
    assert(noAuth.status === 401, `got ${noAuth.status}`);

    step("another Traveler's token on viajera's path → 403");
    const wrong = await payAuth(other.token);
    assert(wrong.status === 403, `got ${wrong.status}`);

    step("malformed bodies → 400 invalid_requirements / unsupported_network");
    for (const [label, body] of [
      ["empty", {}],
      ["no scheme", { requirements: { ...reqs, scheme: "upto" } }],
      ["bad amount", { requirements: { ...reqs, amount: "abc" } }],
      ["zero amount", { requirements: { ...reqs, amount: "0" } }],
      ["bad payTo", { requirements: { ...reqs, payTo: "not-an-address" } }],
    ] as const) {
      const res = await payAuth(viajera.token, viajera.id, body);
      assert(
        res.status === 400 && res.body?.error === "invalid_requirements",
        `${label}: got ${res.status} ${JSON.stringify(res.body)}`
      );
    }
    const wrongNet = await payAuth(viajera.token, viajera.id, {
      requirements: { ...reqs, network: "eip155:8453" },
    });
    assert(
      wrongNet.status === 400 && wrongNet.body?.error === "unsupported_network",
      `foreign network: got ${wrongNet.status} ${JSON.stringify(wrongNet.body)}`
    );

    step("unfunded Traveler → 403 funding_required, no wallet row minted");
    const unfunded = await call(`/wallet/${other.id}/payment-auth`, other.token, {
      requirements: reqs,
    });
    assert(
      unfunded.status === 403 && unfunded.body?.error === "funding_required",
      `got ${unfunded.status} ${JSON.stringify(unfunded.body)}`
    );
    assert(
      ((await walletRows(other.id)).data ?? []).length === 0,
      "no agent_wallets row on the refusal"
    );

    step("payTo != Escrow vault → 403 destination_forbidden");
    const badDest = await payAuth(viajera.token, viajera.id, {
      requirements: { ...reqs, payTo: viajeraWallet },
    });
    assert(
      badDest.status === 403 && badDest.body?.error === "destination_forbidden",
      `got ${badDest.status} ${JSON.stringify(badDest.body)}`
    );

    step("asset outside X402_ASSETS → 400 unsupported_asset");
    for (const token of [
      X402.mainnet.tokens.wbrl.address,
      X402.mainnet.tokens.usdc.address,
    ]) {
      const res = await payAuth(viajera.token, viajera.id, {
        requirements: { ...reqs, asset: token },
      });
      assert(
        res.status === 400 && res.body?.error === "unsupported_asset",
        `${token}: got ${res.status} ${JSON.stringify(res.body)}`
      );
    }

    step("amount > real wARS balance → 409 insufficient_balance names the wFIAT");
    const huge = await payAuth(viajera.token, viajera.id, {
      requirements: warsRequirements(10n ** 30n),
    });
    assert(
      huge.status === 409 &&
        huge.body?.error === "insufficient_balance" &&
        huge.body?.token === "wARS" &&
        huge.body?.currency === "ARS" &&
        huge.body?.required === "1000000000000" &&
        typeof huge.body?.available === "string" &&
        typeof huge.body?.missing === "string",
      `got ${huge.status} ${JSON.stringify(huge.body)}`
    );

    // -- the signing paths: a funded throwaway on stub-RPC instances ---------
    step("seed funded_at for the throwaway Traveler");
    const { error: fundErr } = await admin
      .from("travelers")
      .update({ funded_at: new Date().toISOString() })
      .eq("id", other.id)
      .is("funded_at", null);
    assert(!fundErr, `funded_at seeded${fundErr ? `: ${fundErr.message}` : ""}`);

    const stubBalances = new Map<string, bigint>([
      [WARS.address.toLowerCase(), 1_000n * 10n ** 18n],
      [SEPOLIA_USDC.address.toLowerCase(), 10_000_000n],
    ]);
    const stub = await startRpcStub(stubBalances);
    stubs.push(stub.close);

    step("mainnet api on stub RPC → permit2 happy path");
    const stubPort = BASE_PORT + 4;
    const stubBase = `http://localhost:${stubPort}`;
    const mainnet = await spawnApi(stubPort, {
      X402_NETWORK: "mainnet",
      X402_RPC: `http://localhost:${stub.port}`,
    });
    children.push(mainnet);
    const happy = await payAuth(other.token, other.id, undefined, stubBase);
    const xp = happy.body?.x_payment as string | undefined;
    assert(
      happy.status === 200 && typeof xp === "string" && xp.length > 0,
      `got ${happy.status} ${JSON.stringify(happy.body)}`
    );
    const otherRows = await walletRows(other.id);
    const otherWallet = otherRows.data?.[0]?.address as Address | undefined;
    assert(
      otherRows.data?.length === 1 && otherWallet !== undefined,
      `wallet row: ${JSON.stringify(otherRows.data)}`
    );
    if (xp && otherWallet) {
      assert(
        getAddress((happy.body?.payer as Address) ?? ZERO) ===
          getAddress(otherWallet),
        `payer ${JSON.stringify(happy.body?.payer)}`
      );
      await assertPermit2Payload(xp, otherWallet, amount);
    }

    step("forced-testnet api on stub RPC → eip3009 happy path (USDC)");
    const testnetPort = BASE_PORT + 5;
    const testnetBase = `http://localhost:${testnetPort}`;
    const testnet = await spawnApi(testnetPort, {
      X402_NETWORK: "testnet",
      X402_ASSETS: "usdc",
      X402_RPC: `http://localhost:${stub.port}`,
    });
    children.push(testnet);
    const usdcAmount = 5_000_000n; // 5 USDC < the stubbed 10
    const usdc = await payAuth(
      other.token,
      other.id,
      {
        requirements: {
          scheme: "exact",
          network: SEPOLIA_CAIP2,
          asset: SEPOLIA_USDC.address,
          amount: usdcAmount.toString(),
          payTo: VAULT,
          maxTimeoutSeconds: 300,
          extra: { ...SEPOLIA_USDC.domain },
        },
      },
      testnetBase
    );
    const usdcXp = usdc.body?.x_payment as string | undefined;
    assert(
      usdc.status === 200 && typeof usdcXp === "string" && usdcXp.length > 0,
      `got ${usdc.status} ${JSON.stringify(usdc.body)}`
    );
    if (usdcXp && otherWallet) {
      const decoded = decodeXPayment(usdcXp);
      const auth = decoded.payload.authorization;
      assert(
        decoded.x402Version === 2 &&
          auth !== undefined &&
          getAddress(auth.from) === getAddress(otherWallet) &&
          getAddress(auth.to) === getAddress(VAULT as Address) &&
          auth.value === usdcAmount.toString(),
        `authorization: ${JSON.stringify(auth ?? "missing")}`
      );
      if (auth) {
        const recovered = await recoverTypedDataAddress({
          domain: {
            name: SEPOLIA_USDC.domain.name,
            version: SEPOLIA_USDC.domain.version,
            chainId: 11142220,
            verifyingContract: getAddress(SEPOLIA_USDC.address),
          },
          types: eip3009Types,
          primaryType: "TransferWithAuthorization",
          message: {
            from: getAddress(auth.from),
            to: getAddress(auth.to),
            value: BigInt(auth.value),
            validAfter: BigInt(auth.validAfter),
            validBefore: BigInt(auth.validBefore),
            nonce: auth.nonce,
          },
          signature: decoded.payload.signature,
        });
        assert(
          getAddress(recovered) === getAddress(otherWallet),
          `eip3009 signer recovered: ${recovered}`
        );
      }
    }

    step("stored row rewritten → 503 wallet_unavailable (never sign for another wallet)");
    const foreign = "0x000000000000000000000000000000000000dEaD";
    await admin
      .from("agent_wallets")
      .update({ address: foreign })
      .eq("traveler_id", other.id);
    const mismatch = await payAuth(
      other.token,
      other.id,
      undefined,
      stubBase
    );
    assert(
      mismatch.status === 503 && mismatch.body?.error === "wallet_unavailable",
      `got ${mismatch.status} ${JSON.stringify(mismatch.body)}`
    );

    // -- spawned variants: missing env knobs -------------------------------
    step("API without ESCROW_ADDRESS → 503 escrow_unavailable");
    const noEscrow = await spawnApi(BASE_PORT + 6, { ESCROW_ADDRESS: "" });
    children.push(noEscrow);
    const noEscrowRes = await payAuth(
      viajera.token,
      viajera.id,
      { requirements: reqs },
      `http://localhost:${BASE_PORT + 6}`
    );
    assert(
      noEscrowRes.status === 503 &&
        noEscrowRes.body?.error === "escrow_unavailable",
      `got ${noEscrowRes.status} ${JSON.stringify(noEscrowRes.body)}`
    );

    step("API without AGENT_WALLET_MASTER_SECRET → 503 wallet_unavailable");
    const noSecret = await spawnApi(BASE_PORT + 7, {
      AGENT_WALLET_MASTER_SECRET: "",
    });
    children.push(noSecret);
    const noSecretRes = await payAuth(
      viajera.token,
      viajera.id,
      { requirements: reqs },
      `http://localhost:${BASE_PORT + 7}`
    );
    assert(
      noSecretRes.status === 503 &&
        noSecretRes.body?.error === "wallet_unavailable",
      `got ${noSecretRes.status} ${JSON.stringify(noSecretRes.body)}`
    );
  } finally {
    for (const child of children) child.kill();
    for (const close of stubs) close();
    for (const id of ids) {
      await admin.from("agent_wallets").delete().eq("traveler_id", id);
      await admin.auth.admin.deleteUser(id); // cascades to travelers
    }
    if (ids.length) console.log(`\ncleanup: ${ids.length} traveler(s) removed`);
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
