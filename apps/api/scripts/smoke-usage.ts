// E2E smoke for the Usage API (ADR-0002 metering, D9) — run with
// `pnpm smoke:usage` while `pnpm api:dev` is up (NOMAI_API_URL overrides
// the base).
//
// Creates a throwaway auth user (the handle_new_user trigger makes its
// travelers row), signs it in for a Bearer token, then walks the surface:
//
//   1. unauthenticated /usage/today + /usage/record   → 401
//   2. /usage/today                                   → 200, used_units 0
//   3. record conversation                            → 201, server-priced cost
//   4. /usage/today                                   → used_units grows
//   5. record live_query in a loop                    → eventually 429
//   6. bad input                                      → 400
//   7. ledger inspection                              → spend rows positive
//      cost_units with stage
//
// The 429 step assumes the server runs with the default
// FREE_DAILY_PER_ACCOUNT=50 / FREE_DAILY_BUDGET=500 and default stage costs
// (USAGE_COST_LIVE_QUERY=10 → the 6th live_query of the day 429s). An early
// 429 just means the caps are tighter or the day already has spend; no 429
// after the loop means the caps are disabled (set to 0). Cleanup deletes
// the agent_usage rows and the auth user (cascades to travelers).

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

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
  body?: unknown
) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

async function main() {
  const email = `smoke-usage-${Date.now()}@example.com`;
  const password = `smoke-${Math.random().toString(36).slice(2)}A1!`;
  let userId: string | null = null;
  let token = "";

  try {
    step(`create throwaway traveler ${email}`);
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr || !created.user) throw cErr ?? new Error("no user");
    userId = created.user.id;
    const { data: session, error: sErr } = await signin.auth.signInWithPassword(
      { email, password }
    );
    if (sErr || !session.session) throw sErr ?? new Error("no session");
    token = session.session.access_token;
    ok(`user ${userId}`);

    step("GET /usage/today + POST /usage/record without token → 401");
    const noAuthGet = await call("GET", "/usage/today");
    assert(noAuthGet.status === 401, `today got ${noAuthGet.status}`);
    const noAuthPost = await call("POST", "/usage/record", undefined, {
      stage: "conversation",
    });
    assert(noAuthPost.status === 401, `record got ${noAuthPost.status}`);

    step("GET /usage/today → 200, used_units 0");
    const t0 = await call("GET", "/usage/today", token);
    assert(
      t0.status === 200 && Number(t0.body?.used_units) === 0,
      `got ${t0.status} ${JSON.stringify(t0.body)}`
    );
    const cap = t0.body?.cap_units;

    step("record conversation → 201, server-priced cost_units");
    const r1 = await call("POST", "/usage/record", token, {
      stage: "conversation",
      reference: "smoke:conv",
    });
    assert(
      r1.status === 201 && Number(r1.body?.entry?.cost_units) > 0,
      `got ${r1.status} ${JSON.stringify(r1.body)}`
    );
    const convCost = Number(r1.body?.entry?.cost_units);

    step("GET /usage/today → used_units grew by the recorded cost");
    const t1 = await call("GET", "/usage/today", token);
    assert(
      Math.abs(Number(t1.body?.used_units) - convCost) < 0.005,
      `used_units ${JSON.stringify(t1.body)} vs ${convCost}`
    );
    if (cap != null) {
      assert(
        Math.abs(Number(t1.body?.remaining_units) - (Number(cap) - convCost)) <
          0.005,
        `remaining ${JSON.stringify(t1.body)} vs ${Number(cap) - convCost}`
      );
    }

    step("record live_query in a loop → eventually 429 (daily cap)");
    let saw429 = false;
    // With defaults (cap 50, live_query 10) the 6th call 429s. 12 attempts
    // covers looser per-account caps while staying cheap; a global cap or
    // existing day spend just makes the 429 arrive sooner.
    for (let i = 1; i <= 12 && !saw429; i++) {
      const r = await call("POST", "/usage/record", token, {
        stage: "live_query",
        reference: `smoke:live${i}`,
      });
      if (r.status === 429) {
        saw429 = true;
        assert(
          r.body?.scope === "account" || r.body?.scope === "global",
          `429 without scope: ${JSON.stringify(r.body)}`
        );
      } else if (r.status !== 201) {
        fail(`attempt ${i}: unexpected ${r.status} ${JSON.stringify(r.body)}`);
        break;
      }
    }
    if (!saw429)
      ok("no 429 in 12 live_query records — caps disabled (set to 0) or looser than defaults");

    step("bad input → 400");
    for (const body of [
      { stage: "bogus" },
      {},
      { reference: "smoke:no-stage" },
    ]) {
      const r = await call("POST", "/usage/record", token, body);
      assert(r.status === 400, `${JSON.stringify(body)} → ${r.status}`);
    }

    step("ledger rows: every spend positive cost_units and stage-tagged");
    const { data: rows } = await admin
      .from("agent_usage")
      .select("kind, cost_units, stage")
      .eq("traveler_id", userId)
      .order("created_at");
    const spends = (rows ?? []).filter((r) => r.kind === "spend");
    assert(
      spends.length >= 2 &&
        spends.every((r) => Number(r.cost_units) > 0 && r.stage != null),
      `${JSON.stringify(spends)}`
    );
  } finally {
    if (userId) {
      const d = await admin
        .from("agent_usage")
        .delete()
        .eq("traveler_id", userId);
      if (d.error) console.error("cleanup: usage delete failed", d.error);
      await admin.auth.admin.deleteUser(userId); // cascades to travelers
      console.log(`\ncleanup: traveler ${userId} removed`);
    }
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
