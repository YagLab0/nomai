// E2E smoke for the Agent wallet API (issues #33 and #39) — run with
// `pnpm smoke:wallet` while `pnpm api:dev` is up (NOMAI_API_URL overrides
// the base).
//
// Creates two throwaway auth users (the handle_new_user trigger makes their
// travelers rows), signs them in for Bearer tokens, then walks the surface:
//
//   1. fresh Traveler                     → no agent_wallets row yet
//   2. GET /wallet/:id without a token    → 401
//   3. GET /wallet/:id with B's token     → 403 (never A's wallet)
//   4. first GET with A's own token       → one row; the balance answer
//      depends on the network the api:dev instance runs: mainnet lists every
//      wFIAT with its decimal-string amount, testnet has no wFIAT and answers
//      currency_unavailable — an error, never a zero.
//   5. repeat + two parallel GETs         → same address, still one row
//   6. a second API on mainnet pointed at a stub RPC (X402_RPC): zero
//      balances → funded_at stays null; first positive wFIAT → funded_at
//      marked; later reads never rewrite it; a pre-seeded funded_at survives;
//      stub down → rpc_unreachable
//   7. a second API spawned without AGENT_WALLET_MASTER_SECRET
//      → wallet_unavailable, no row
//
// Extra instances spawn the API itself on the next ports: unsetting an env
// var is not enough (dotenv would reload it from .env), so children get
// explicit overrides — AGENT_WALLET_MASTER_SECRET="", X402_NETWORK=mainnet,
// X402_RPC=<stub>. Cleanup deletes the wallet rows and both auth users
// (cascades to travelers).

import { createClient } from "@supabase/supabase-js";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import "dotenv/config";
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
// signInWithPassword mutates the client's auth state — every later .from()
// call would send the USER token and fall under RLS. Keep sign-in on its
// own client so `admin` stays service-role for data ops and cleanup.
const signin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Spawned API instances for the missing-secret / mainnet+stub-RPC /
// forced-testnet cases: same code, consecutive ports.
const API_DIR = fileURLToPath(new URL("..", import.meta.url));
const BASE_PORT = Number(new URL(BASE).port || 3001);

let failures = 0;
const step = (name: string) => console.log(`\n▸ ${name}`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const assert = (cond: boolean, msg: string) => (cond ? ok(msg) : fail(msg));

const call = async (
  method: string,
  path: string,
  token?: string,
  base = BASE
) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const walletRows = (travelerId: string) =>
  admin
    .from("agent_wallets")
    .select("id, address, network")
    .eq("traveler_id", travelerId);

const fundedAt = async (travelerId: string): Promise<string | null> => {
  const { data } = await admin
    .from("travelers")
    .select("funded_at")
    .eq("id", travelerId)
    .single();
  return data?.funded_at ?? null;
};

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
 * Minimal JSON-RPC stub: eth_call answers balanceOf per token address from a
 * mutable map, everything the API doesn't need gets a JSON-RPC error. Only
 * what a wFIAT balance read touches is implemented.
 */
function startRpcStub(balances: Map<string, bigint>) {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const answer = (msg: { id?: unknown; method?: string; params?: unknown }) => {
        if (msg.method === "eth_chainId") {
          return { jsonrpc: "2.0", id: msg.id ?? null, result: "0xa4ec" };
        }
        if (msg.method === "eth_call") {
          const to = String(
            (msg.params as [{ to?: string }] | undefined)?.[0]?.to ?? ""
          ).toLowerCase();
          const value = balances.get(to) ?? 0n;
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

const balanceOf = (body: { balances?: { currency?: string; amount?: string }[] } | null, currency: string) =>
  body?.balances?.find((b) => b.currency === currency)?.amount;

async function main() {
  const stamp = Date.now();
  const ids: string[] = [];

  try {
    step("create throwaway travelers");
    const a = await makeTraveler(`smoke-wallet-${stamp}@example.com`);
    ids.push(a.id);
    const b = await makeTraveler(`smoke-wallet-b-${stamp}@example.com`);
    ids.push(b.id);
    ok(`travelers ${a.id}, ${b.id}`);

    step("fresh traveler has no agent_wallets row");
    const before = await walletRows(a.id);
    assert(
      !before.error && (before.data ?? []).length === 0,
      `rows: ${JSON.stringify(before.data ?? before.error)}`
    );

    step("GET /wallet/:a without token → 401");
    const noAuth = await call("GET", `/wallet/${a.id}`);
    assert(noAuth.status === 401, `got ${noAuth.status}`);

    step("GET /wallet/:a with B's token → 403");
    const wrong = await call("GET", `/wallet/${a.id}`, b.token);
    assert(wrong.status === 403, `got ${wrong.status}`);

    // Which network the api:dev instance is running decides the balance shape.
    const free = await call("GET", "/free");
    const baseNetwork = free.body?.network as string | undefined;

    step(`first GET with A's token → provisions row (${baseNetwork} shape)`);
    const first = await call("GET", `/wallet/${a.id}`, a.token);
    const address = first.body?.address ?? "";
    assert(
      /^0x[0-9a-fA-F]{40}$/.test(address),
      `address ${address || "(missing)"}`
    );
    if (baseNetwork === "testnet") {
      assert(
        first.status === 404 && first.body?.error === "currency_unavailable",
        `testnet: got ${first.status} ${JSON.stringify(first.body)}`
      );
    } else {
      assert(
        first.status === 200 &&
          first.body?.ok === true &&
          Array.isArray(first.body?.balances) &&
          first.body.balances.length > 0 &&
          first.body.balances.every(
            (x: { amount?: unknown }) => typeof x.amount === "string"
          ),
        `mainnet: got ${first.status} ${JSON.stringify(first.body)}`
      );
    }
    const afterFirst = await walletRows(a.id);
    assert(
      (afterFirst.data ?? []).length === 1 &&
        afterFirst.data![0].address === address,
      `rows: ${JSON.stringify(afterFirst.data ?? afterFirst.error)}`
    );

    step("repeat + parallel GETs → same address, still one row");
    const again = await call("GET", `/wallet/${a.id}`, a.token);
    assert(
      again.body?.address === address,
      `repeat got ${again.status} ${JSON.stringify(again.body)}`
    );
    const [p1, p2] = await Promise.all([
      call("GET", `/wallet/${a.id}`, a.token),
      call("GET", `/wallet/${a.id}`, a.token),
    ]);
    assert(
      p1.body?.address === address && p2.body?.address === address,
      `parallel got ${p1.status}/${p2.status}`
    );
    const afterParallel = await walletRows(a.id);
    assert(
      (afterParallel.data ?? []).length === 1,
      `${afterParallel.data?.length ?? "?"} rows after parallel GETs`
    );

    // -- mainnet instance on a stub RPC: deterministic wFIAT balances --------
    step("mainnet api on stub RPC → wFIAT list, funded_at flow");
    const stubBalances = new Map<string, bigint>();
    const stub = await startRpcStub(stubBalances);
    const stubPort = BASE_PORT + 2;
    const stubBase = `http://localhost:${stubPort}`;
    const mainnet = await spawnApi(stubPort, {
      X402_NETWORK: "mainnet",
      X402_RPC: `http://localhost:${stub.port}`,
    });
    try {
      const setBalance = (token: keyof typeof X402.mainnet.tokens, v: bigint) =>
        stubBalances.set(X402.mainnet.tokens[token].address.toLowerCase(), v);

      await admin
        .from("travelers")
        .update({ country_code: "AR" })
        .eq("id", b.id);

      step("stub: all wFIAT at zero → list of six, funded_at stays null");
      const zero = await call("GET", `/wallet/${b.id}`, b.token, stubBase);
      assert(
        zero.status === 200 &&
          zero.body?.ok === true &&
          Array.isArray(zero.body?.balances) &&
          zero.body.balances.length === 6 &&
          zero.body.balances.every(
            (x: { amount?: string; currency?: string; country?: string }) =>
              typeof x.amount === "string" &&
              typeof x.currency === "string" &&
              typeof x.country === "string" &&
              Number(x.amount) === 0
          ),
        `got ${zero.status} ${JSON.stringify(zero.body)}`
      );
      assert(
        zero.body?.country_code === "AR",
        `country_code ${JSON.stringify(zero.body?.country_code)}`
      );
      assert((await fundedAt(b.id)) === null, "funded_at still null at zero");

      step("stub: first positive wFIAT → amount + funded_at marked");
      setBalance("wars", 1234_500_000_000_000_000_000n); // 1234.5 wARS
      const funded = await call("GET", `/wallet/${b.id}`, b.token, stubBase);
      assert(
        funded.status === 200 && balanceOf(funded.body, "ARS") === "1234.5",
        `ARS balance ${JSON.stringify(balanceOf(funded.body, "ARS"))}`
      );
      const marked = await fundedAt(b.id);
      assert(marked !== null, `funded_at marked: ${marked}`);

      step("stub: later reads never rewrite funded_at");
      setBalance("wars", 999_000_000_000_000_000_000n);
      await call("GET", `/wallet/${b.id}`, b.token, stubBase);
      assert(
        (await fundedAt(b.id)) === marked,
        `funded_at unchanged: ${await fundedAt(b.id)}`
      );

      step("stub: a pre-seeded funded_at survives a positive read");
      const seeded = "2020-01-02T03:04:05.000Z";
      await admin.from("travelers").update({ funded_at: seeded }).eq("id", a.id);
      const seededRead = await call("GET", `/wallet/${a.id}`, a.token, stubBase);
      assert(
        seededRead.status === 200 && balanceOf(seededRead.body, "ARS") === "999",
        `got ${seededRead.status} ${JSON.stringify(seededRead.body)}`
      );
      assert(
        new Date((await fundedAt(a.id)) ?? "").toISOString() === seeded,
        `funded_at preserved: ${await fundedAt(a.id)}`
      );
      assert(
        seededRead.body?.country_code === null,
        `no country needed: ${JSON.stringify(seededRead.body?.country_code)}`
      );

      step("stub: RPC down → rpc_unreachable, never a zero");
      stub.close();
      const down = await call("GET", `/wallet/${b.id}`, b.token, stubBase);
      assert(
        down.status === 502 && down.body?.error === "rpc_unreachable",
        `got ${down.status} ${JSON.stringify(down.body)}`
      );
    } finally {
      mainnet.kill();
      stub.close();
    }

    // -- testnet has no wFIAT: currency_unavailable ---------------------------
    if (baseNetwork !== "testnet") {
      step("forced testnet api → currency_unavailable");
      const testnetPort = BASE_PORT + 3;
      const testnetBase = `http://localhost:${testnetPort}`;
      const testnet = await spawnApi(testnetPort, { X402_NETWORK: "testnet" });
      try {
        const res = await call("GET", `/wallet/${a.id}`, a.token, testnetBase);
        assert(
          res.status === 404 && res.body?.error === "currency_unavailable",
          `got ${res.status} ${JSON.stringify(res.body)}`
        );
      } finally {
        testnet.kill();
      }
    }

    step(`API without AGENT_WALLET_MASTER_SECRET (:${BASE_PORT + 1}) → wallet_unavailable`);
    const nosecret = await spawnApi(BASE_PORT + 1, {
      AGENT_WALLET_MASTER_SECRET: "",
    });
    try {
      // A fresh traveler: the failed instance must not create a wallet row.
      const c = await makeTraveler(`smoke-wallet-c-${stamp}@example.com`);
      ids.push(c.id);
      const res = await call(
        "GET",
        `/wallet/${c.id}`,
        c.token,
        `http://localhost:${BASE_PORT + 1}`
      );
      assert(
        res.status === 503 && res.body?.error === "wallet_unavailable",
        `got ${res.status} ${JSON.stringify(res.body)}`
      );
      const rowsC = await walletRows(c.id);
      assert(
        (rowsC.data ?? []).length === 0,
        `no row for traveler C (${rowsC.data?.length ?? "?"})`
      );
    } finally {
      nosecret.kill();
    }
  } finally {
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
