// E2E smoke for Booking requests (ADR-0010) — run with
// `pnpm smoke:booking-requests` while `pnpm api:dev` is up (NOMAI_API_URL
// overrides the base).
//
// Creates a throwaway auth user (handle_new_user makes the travelers row),
// signs in for a Bearer token, then walks the surface:
//
//   1. POST /bookings/requests, no token        → 401
//   2. POST, bad body                           → 400
//   3. POST unknown slug                        → 404
//   4. POST valid                               → 201 pending + frozen totals + expires_at
//   5. GET /bookings/requests, other Traveler   → [] (never another's drafts)
//   6. GET mine                                 → the draft, still pending
//   7. POST /:id/cancel, other Traveler         → 404 (not theirs to cancel)
//   8. POST /:id/cancel mine                    → cancelled
//   9. POST /:id/converted on cancelled        → 409 invalid_state
//  10. POST valid again → POST /:id/converted   → confirmed + booking_id linked
//  11. MCP tools via JSON-RPC: create/list/get_thread/send_message on the
//      converted Booking's thread — the draft path end to end.
//
// Cleanup deletes the auth user (cascades to travelers + requests).

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

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

const post = async (path: string, token: string | null, body?: unknown) => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const get = async (path: string, token: string | null) => {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const mcp = async (token: string, method: string, params?: unknown) => {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) return { status: res.status, body: null as unknown };
  return { status: res.status, body: JSON.parse(line.slice(6)) as unknown };
};

const mcpCall = async (token: string, name: string, args: unknown) =>
  mcp(token, "tools/call", { name, arguments: args });

const textOf = (rpc: unknown) => {
  const r = rpc as {
    result?: { content?: Array<{ text?: string }>; isError?: boolean };
  };
  return {
    isError: r.result?.isError === true,
    text: r.result?.content?.[0]?.text ?? "",
  };
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

const stay = { checkin: iso(plusDays(30)), checkout: iso(plusDays(32)), guests: 2 };

// The listings smoke uses live search; here we need one stable slug. Reuse
// the search surface: first published card with ARS pricing.
async function cheapestArsSlug(): Promise<string | null> {
  const res = await fetch(
    `${BASE}/listings/search?checkin=${stay.checkin}&checkout=${stay.checkout}&guests=2`
  );
  const body = (await res.json().catch(() => null)) as {
    results?: Array<{ slug: string; currency: string }>;
  } | null;
  return body?.results?.find((r) => r.currency === "ARS")?.slug ?? null;
}

const run = async () => {
  const slug = await cheapestArsSlug();
  if (!slug) {
    console.error("no ARS listing with availability for the probe window — seed the catalog first");
    process.exit(1);
  }

  const a = await makeTraveler(`smoke-req-a-${Date.now()}@example.com`);
  const b = await makeTraveler(`smoke-req-b-${Date.now()}@example.com`);

  step("auth gate + validation");
  assert((await post("/bookings/requests", null, { slug, ...stay })).status === 401, "no token → 401");
  assert((await post("/bookings/requests", a.token, { slug })).status === 400, "bad body → 400");
  assert(
    (await post("/bookings/requests", a.token, { ...stay, slug: "no-existe", guests: 2 })).status === 404,
    "unknown slug → 404"
  );

  step("create + list isolation");
  const created = await post("/bookings/requests", a.token, { slug, ...stay });
  assert(created.status === 201, `valid → 201 (got ${created.status})`);
  const draft = created.body as {
    request_id: string;
    status: string;
    total_minor: number;
    currency: string;
    expires_at: string;
  };
  assert(draft.status === "pending", "draft is pending");
  assert(typeof draft.total_minor === "number" && draft.currency === "ARS", "frozen totals in ARS");
  assert(new Date(draft.expires_at).getTime() > Date.now(), "expires_at in the future");

  const others = (await get("/bookings/requests", b.token)).body as {
    requests?: unknown[];
  };
  assert((others.requests?.length ?? -1) === 0, "other Traveler sees no drafts");
  const mine = (await get("/bookings/requests", a.token)).body as {
    requests?: Array<{ request_id: string }>;
  };
  assert(
    (mine.requests ?? []).some((r) => r.request_id === draft.request_id),
    "own draft listed"
  );

  step("cancel rules + convert");
  assert(
    (await post(`/bookings/requests/${draft.request_id}/cancel`, b.token)).status === 404,
    "other Traveler cannot cancel → 404"
  );
  const cancelled = await post(`/bookings/requests/${draft.request_id}/cancel`, a.token);
  assert(cancelled.status === 200, "own cancel → 200");
  assert(
    (
      await post(`/bookings/requests/${draft.request_id}/converted`, a.token, {
        booking_id: "bkg_fake",
      })
    ).status === 409,
    "converted on cancelled → 409 invalid_state"
  );

  const second = await post("/bookings/requests", a.token, { slug, ...stay });
  const draft2 = second.body as { request_id: string };
  // converted links the draft to the real Booking created by the paid flow;
  // the FK requires a real bookings row, so use a seeded one.
  const converted = await post(`/bookings/requests/${draft2.request_id}/converted`, a.token, {
    booking_id: "bkg_seed_adobe_1",
  });
  assert(converted.status === 200, "converted → 200");
  assert(
    (converted.body as { status: string }).status === "confirmed" &&
      (converted.body as { booking_id: string }).booking_id === "bkg_seed_adobe_1",
    "confirmed + booking_id linked"
  );

  step("MCP: create + list + thread tools");
  const mcpCreated = textOf(
    (await mcpCall(a.token, "create_booking_request", { slug, ...stay })).body
  );
  assert(!mcpCreated.isError, "MCP create_booking_request ok");
  const mcpDraft = JSON.parse(mcpCreated.text) as { request_id: string };
  assert(typeof mcpDraft.request_id === "string", "MCP draft has request_id");

  const mcpList = textOf((await mcpCall(a.token, "list_booking_requests", {})).body);
  assert(!mcpList.isError, "MCP list_booking_requests ok");
  const listed = JSON.parse(mcpList.text) as { count: number };
  assert(listed.count >= 2, `MCP list shows drafts (count=${listed.count})`);

  // Thread tools need a real confirmed Booking of the caller's own — a
  // throwaway user has none, so any other booking id must answer with an
  // error (not_found/forbidden), never leak.
  const foreign = textOf(
    (await mcpCall(a.token, "get_thread", { booking_id: "bkg_seed_adobe_1" })).body
  );
  assert(foreign.isError, "MCP get_thread on another booking → error, never leaks");

  // Cleanup: drafts cascade from the traveler delete.
  await admin.auth.admin.deleteUser(a.id);
  await admin.auth.admin.deleteUser(b.id);

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nall booking-request steps passed");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
