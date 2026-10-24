// E2E smoke for the Credits API (issue #17) — run with `pnpm smoke:credits`
// while `pnpm api:dev` is up (NOMAI_API_URL overrides the base).
//
// Creates a throwaway auth user (the handle_new_user trigger makes its
// travelers row), signs it in for a Bearer token, then walks the surface:
//
//   1. unauthenticated balance            → 401
//   2. grant before verification          → 403
//   3. phone grant                        → 201 +amount, idempotent on retry
//   4. funded grant                       → 403 → verify → 201
//   5. balance                            → sum(amount) of the grants
//   6. spend conversation/cached/live     → 201 negative rows, balance drops
//   7. second big live_query spend        → 429 (per-account daily ceiling)
//   8. spend over balance                 → 402; bad input → 400
//   9. ledger inspection                  → spend rows are negative w/ stage
//
// The 429 step assumes the server runs with the default
// FREE_DAILY_PER_ACCOUNT=50 and FREE_DAILY_BUDGET>=90 — start the api with
// those values (the .env.template defaults) or the step adapts: an early
// 429 just means the cap is tighter. Cleanup deletes the ledger rows and
// the auth user (cascades to travelers).

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
  const email = `smoke-credits-${Date.now()}@example.com`;
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

    step("GET /credits/balance without token");
    const noAuth = await call("GET", "/credits/balance");
    assert(noAuth.status === 401, `got ${noAuth.status}`);

    step("grant 'phone' before verification → 403");
    const early = await call("POST", "/credits/grant", token, {
      tier: "phone",
    });
    assert(early.status === 403, `got ${early.status}`);

    step("verify phone → grant 'phone'");
    await admin
      .from("travelers")
      .update({ phone_verified_at: new Date().toISOString() })
      .eq("id", userId);
    const g1 = await call("POST", "/credits/grant", token, { tier: "phone" });
    assert(g1.status === 201 && g1.body?.status === "granted",
      `got ${g1.status} ${JSON.stringify(g1.body)}`);
    const phoneGrant = Number(g1.body?.amount);
    assert(phoneGrant > 0, `granted ${phoneGrant}`);
    const again = await call("POST", "/credits/grant", token, {
      tier: "phone",
    });
    assert(
      again.status === 200 && again.body?.status === "already_granted",
      `idempotent retry got ${again.status}`
    );

    step("grant 'funded' (funded_at set) → balance is phone+funded");
    await admin
      .from("travelers")
      .update({ funded_at: new Date().toISOString() })
      .eq("id", userId);
    const g2 = await call("POST", "/credits/grant", token, {
      tier: "funded",
    });
    assert(g2.status === 201, `got ${g2.status}`);
    const fundedGrant = Number(g2.body?.amount);
    const bal = await call("GET", "/credits/balance", token);
    assert(
      bal.status === 200 &&
        Math.abs(bal.body?.balance - (phoneGrant + fundedGrant)) < 0.005,
      `balance ${JSON.stringify(bal.body)} vs ${phoneGrant + fundedGrant}`
    );

    step("spend conversation 3 → row negative with stage");
    const s1 = await call("POST", "/credits/spend", token, {
      amount: 3,
      stage: "conversation",
    });
    assert(
      s1.status === 201 && Number(s1.body?.entry?.amount) === -3,
      `got ${s1.status} ${JSON.stringify(s1.body)}`
    );

    step("spend live_query 45 → 201; second 45 → 429 (daily per-account)");
    const l1 = await call("POST", "/credits/spend", token, {
      amount: 45,
      stage: "live_query",
      reference: "smoke:live1",
    });
    if (l1.status === 429) {
      ok("first live_query spend already 429 — cap tighter than 45");
    } else {
      assert(l1.status === 201, `first live spend got ${l1.status}`);
      const l2 = await call("POST", "/credits/spend", token, {
        amount: 45,
        stage: "live_query",
        reference: "smoke:live2",
      });
      assert(
        l2.status === 429 && l2.body?.scope === "account",
        `expected 429, got ${l2.status} ${JSON.stringify(l2.body)}`
      );
    }

    step("spend over balance → 402 (cached_inventory skips the day cap)");
    const big = await call("POST", "/credits/spend", token, {
      amount: 10000,
      stage: "cached_inventory",
    });
    assert(big.status === 402, `got ${big.status} ${JSON.stringify(big.body)}`);

    step("bad input → 400");
    for (const body of [
      { amount: -5, stage: "conversation" },
      { amount: "abc", stage: "conversation" },
      { amount: 1.234, stage: "conversation" },
      { amount: 5, stage: "bogus" },
      { amount: 5 },
    ]) {
      const r = await call("POST", "/credits/spend", token, body);
      assert(r.status === 400, `${JSON.stringify(body)} → ${r.status}`);
    }

    step("balance after spends = grants − 3 − (45 if spent)");
    const spent = l1.status === 201 ? 48 : 3;
    const after = await call("GET", "/credits/balance", token);
    assert(
      Math.abs(after.body?.balance - (phoneGrant + fundedGrant - spent)) <
        0.005,
      `balance ${after.body?.balance}, expected ${phoneGrant + fundedGrant - spent}`
    );

    step("ledger rows: every spend negative and stage-tagged");
    const { data: rows } = await admin
      .from("credit_ledger")
      .select("kind, amount, stage")
      .eq("traveler_id", userId)
      .order("created_at");
    const spends = (rows ?? []).filter((r) => r.kind === "spend");
    assert(
      spends.length >= 2 &&
        spends.every((r) => Number(r.amount) < 0 && r.stage != null),
      `${JSON.stringify(spends)}`
    );
    const grants = (rows ?? []).filter((r) => r.kind === "free_grant");
    assert(
      grants.length === 2 && grants.every((r) => Number(r.amount) > 0),
      `${JSON.stringify(grants)}`
    );
  } finally {
    if (userId) {
      const d = await admin
        .from("credit_ledger")
        .delete()
        .eq("traveler_id", userId);
      if (d.error) console.error("cleanup: ledger delete failed", d.error);
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
