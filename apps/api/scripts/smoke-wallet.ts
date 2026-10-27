// E2E smoke for the Agent wallet API (issue #33) — run with `pnpm smoke:wallet`
// while `pnpm api:dev` is up (NOMAI_API_URL overrides the base).
//
// Creates two throwaway auth users (the handle_new_user trigger makes their
// travelers rows), signs them in for Bearer tokens, then walks the surface:
//
//   1. fresh Traveler                     → no agent_wallets row yet
//   2. GET /wallet/:id without a token    → 401
//   3. GET /wallet/:id with B's token     → 403 (never A's wallet)
//   4. first GET with A's own token       → one row, address + configured network
//   5. repeat + two parallel GETs         → same address, still one row
//   6. a second API spawned without AGENT_WALLET_MASTER_SECRET
//      → wallet_unavailable, no row
//
// Step 6 spawns the API itself on the next port: unsetting the env var is not
// enough (dotenv would reload it from .env), so the child gets
// AGENT_WALLET_MASTER_SECRET="" — defined-but-empty, which derivation rejects
// the same as missing. Cleanup deletes the wallet rows and both auth users
// (cascades to travelers).

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { CONFIG } from "../src/x402.js";

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

// The second API instance for the missing-secret case: same code, one port up.
const API_DIR = fileURLToPath(new URL("..", import.meta.url));
const NOSECRET_PORT = Number(new URL(BASE).port || 3001) + 1;
const NOSECRET_BASE = `http://localhost:${NOSECRET_PORT}`;

let failures = 0;
const step = (name: string) => console.log(`\n▸ ${name}`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const assert = (cond: boolean, msg: string) => (cond ? ok(msg) : fail(msg));

const call = async (method: string, path: string, token?: string) => {
  const res = await fetch(`${BASE}${path}`, {
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

    step("first GET with A's token → one row, address + configured network");
    const first = await call("GET", `/wallet/${a.id}`, a.token);
    assert(
      first.status === 200 && first.body?.ok === true,
      `got ${first.status} ${JSON.stringify(first.body)}`
    );
    const address = first.body?.address ?? "";
    assert(
      /^0x[0-9a-fA-F]{40}$/.test(address),
      `address ${address || "(missing)"}`
    );
    assert(
      first.body?.network === CONFIG.name,
      `network ${first.body?.network} vs configured ${CONFIG.name}`
    );
    assert(
      typeof first.body?.balance === "string",
      `balance ${JSON.stringify(first.body?.balance)}`
    );
    const afterFirst = await walletRows(a.id);
    assert(
      (afterFirst.data ?? []).length === 1 &&
        afterFirst.data![0].address === address &&
        afterFirst.data![0].network === CONFIG.name,
      `rows: ${JSON.stringify(afterFirst.data ?? afterFirst.error)}`
    );

    step("repeat + parallel GETs → same address, still one row");
    const again = await call("GET", `/wallet/${a.id}`, a.token);
    assert(
      again.status === 200 && again.body?.address === address,
      `repeat got ${again.status} ${JSON.stringify(again.body)}`
    );
    const [p1, p2] = await Promise.all([
      call("GET", `/wallet/${a.id}`, a.token),
      call("GET", `/wallet/${a.id}`, a.token),
    ]);
    assert(
      p1.status === 200 &&
        p2.status === 200 &&
        p1.body?.address === address &&
        p2.body?.address === address,
      `parallel got ${p1.status}/${p2.status}`
    );
    const afterParallel = await walletRows(a.id);
    assert(
      (afterParallel.data ?? []).length === 1,
      `${afterParallel.data?.length ?? "?"} rows after parallel GETs`
    );

    step(`API without AGENT_WALLET_MASTER_SECRET (:${NOSECRET_PORT}) → wallet_unavailable`);
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/index.ts"],
      {
        cwd: API_DIR,
        env: {
          ...process.env,
          PORT: String(NOSECRET_PORT),
          AGENT_WALLET_MASTER_SECRET: "",
        },
        stdio: ["ignore", "inherit", "inherit"],
      }
    );
    try {
      const deadline = Date.now() + 30_000;
      let up = false;
      while (Date.now() < deadline) {
        const res = await fetch(`${NOSECRET_BASE}/free`).catch(() => null);
        if (res?.ok) {
          up = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      assert(up, `no-secret api on :${NOSECRET_PORT} is up`);

      if (up) {
        const res = await fetch(`${NOSECRET_BASE}/wallet/${b.id}`, {
          headers: { authorization: `Bearer ${b.token}` },
        });
        const body = await res.json().catch(() => null);
        assert(
          res.status === 503 && body?.error === "wallet_unavailable",
          `got ${res.status} ${JSON.stringify(body)}`
        );
        const rowsB = await walletRows(b.id);
        assert(
          (rowsB.data ?? []).length === 0,
          `no row for traveler B (${rowsB.data?.length ?? "?"})`
        );
      }
    } finally {
      child.kill();
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
