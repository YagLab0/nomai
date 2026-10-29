// E2E smoke for Traveler-pays Bookings (issue #62) — run with
// `pnpm --filter agent smoke:book` while the API is up (`pnpm api:dev`,
// NOMAI_API_URL overrides the base). It drives the REAL agent code path:
// book_listing's session gate and apiPaidPost's
// book → 402 → payment-auth → paid-retry loop.
//
//   1. cheapest ARS stay: /listings/search?country=AR + detail + quote —
//      reports whether viajera's 100 wARS cover one real Booking
//   2. unauthenticated: book_listing with no session → no_traveler_session
//      (the tool refuses — no session, no payer, never the project wallet)
//   3. dry-run loop: real quote → real book → real 402 (payTo = vault,
//      asset = wARS) → real payment-auth → X-PAYMENT verified LOCALLY
//      (permit2 witness + sponsored EIP-2612 permit both recover to
//      viajera's Agent wallet) — then STOPS. The paid retry is never sent:
//      apiPaidPost aborts via its beforePaidRetry hook and reports dry_run.
//   4. insufficient_balance: funded throwaway Traveler with zero balance →
//      409 naming currency + missing ("te faltan X wARS")
//   5. funding_required: throwaway Traveler with funded_at null → 403
//      ("cargá tu saldo primero")
//
// Nothing here settles: the dry run aborts BEFORE the paid retry, the
// facilitator is never contacted, and no transaction is sent on any
// network.
//
// REAL RUN — operator only:
//   pnpm --filter agent smoke:book -- --confirm-mainnet
// sends the paid retry for real on mainnet (settles ~1.07 wARS from
// viajera's wallet into the vault and confirms a real Booking on the
// cheapest ARS stay), then asserts payments.payer / bookings.escrow_* via
// the DB. Never run it without reading the cost first.
//
// Env: apps/agent/.env loads itself via agent/lib/celo.ts (NOMAI_API_URL,
// X402_NETWORK). The fixtures need Supabase admin — read from
// apps/api/.env, loaded below; existing env vars win.

import { createClient } from "@supabase/supabase-js";
import { getAddress, recoverTypedDataAddress, type Address, type Hex } from "viem";

import { apiPaidPost, type PaidRetryAttempt } from "../agent/lib/nomai-api";
import { decodeJwtSub } from "../agent/lib/traveler-auth";
import bookListing from "../agent/tools/book_listing";

// Fixture management needs the API's service key — merge apps/api/.env
// without ever overriding what the agent env already set.
try {
  process.loadEnvFile(new URL("../../api/.env", import.meta.url));
} catch {
  // no api/.env — rely on the environment
}

const BASE = (process.env.NOMAI_API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  ""
);
const CONFIRM_MAINNET = process.argv.includes("--confirm-mainnet");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (apps/api/.env)");
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// signInWithPassword mutates client auth state — keep it off `admin`.
const signin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VIAJERA = {
  email: process.env.TU_TRAVELER_EMAIL ?? "viajera@nomai.dev",
  password: process.env.TU_TRAVELER_PASSWORD ?? "nomai123",
};
const VAULT = process.env.ESCROW_ADDRESS as Address | undefined;
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
const WARS = "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D" as const;
const MAINNET_CAIP2 = "eip155:42220";

// The typed-data shapes payment-auth's signatures bind — recomputed locally
// so the check needs nothing but viem (no facilitator, no chain).
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

let failures = 0;
const step = (name: string) => console.log(`\n▸ ${name}`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const assert = (cond: boolean, msg: string) => (cond ? ok(msg) : fail(msg));

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

interface SearchResult {
  slug: string;
  currency: string;
  nightly_minor: number;
  nightly_display: string;
}
interface ListingDetail {
  slug: string;
  currency: string;
  min_nights: number;
  max_nights: number | null;
  max_guests: number;
  occupied: string[];
  status: string;
}
interface Stay {
  slug: string;
  checkin: string;
  checkout: string;
  guests: number;
  total_minor: number;
  total_display: string;
  nights: number;
}

const getJson = async (path: string) => {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
};

/** Earliest bookable window of `nights` starting tomorrow, scanning ~120d. */
function findWindow(detail: ListingDetail): { checkin: string; checkout: string } | null {
  const taken = new Set(detail.occupied ?? []);
  const nights = Math.min(detail.min_nights, detail.max_nights ?? detail.min_nights);
  for (let offset = 1; offset <= 120; offset++) {
    const checkin = addDays(new Date(), offset);
    let free = true;
    for (let n = 0; n < nights; n++) {
      if (taken.has(isoDay(addDays(checkin, n)))) {
        free = false;
        break;
      }
    }
    if (!free) continue;
    return { checkin: isoDay(checkin), checkout: isoDay(addDays(checkin, nights)) };
  }
  return null;
}

/** Cheapest quotable ARS stay (1 guest, min_nights at the first free window). */
async function cheapestArsStay(): Promise<Stay | null> {
  const { body } = await getJson("/listings/search?country=AR");
  const slugs = ((body?.results ?? []) as SearchResult[])
    .filter((r) => r.currency === "ARS")
    .map((r) => r.slug);
  let best: Stay | null = null;
  for (const slug of slugs) {
    const { body: detail } = await getJson(`/listings/${slug}`);
    if (!detail || detail.status !== "published") continue;
    const window = findWindow(detail as ListingDetail);
    if (!window) continue;
    const { body: quote } = await getJson(
      `/listings/${slug}/quote?checkin=${window.checkin}&checkout=${window.checkout}&guests=1`
    );
    if (!quote?.total_minor) continue;
    const stay: Stay = {
      slug,
      ...window,
      guests: 1,
      total_minor: quote.total_minor,
      total_display: quote.total_display,
      nights: quote.nights_count,
    };
    if (!best || stay.total_minor < best.total_minor) best = stay;
  }
  return best;
}

interface Session {
  id: string;
  token: string;
}

async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await signin.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error(`no session for ${email}`);
  return { id: data.user.id, token: data.session.access_token };
}

async function makeTraveler(email: string): Promise<Session> {
  const password = `smoke-${Math.random().toString(36).slice(2)}A1!`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr || !created.user) throw cErr ?? new Error("no user");
  return signIn(email, password);
}

interface PaymentPayloadDecoded {
  x402Version: number;
  accepted: {
    scheme: string;
    network: string;
    asset: Address;
    amount: string;
    payTo: Address;
    extra?: Record<string, unknown>;
  };
  payload: {
    signature: Hex;
    permit2Authorization?: {
      from: Address;
      permitted: { token: Address; amount: string };
      spender: Address;
      nonce: string;
      deadline: string;
      witness: { to: Address; validAfter: string };
    };
  };
  extensions?: Record<string, { info?: unknown }>;
}

const decodeXPayment = (xPayment: string): PaymentPayloadDecoded =>
  JSON.parse(Buffer.from(xPayment, "base64").toString("utf8"));

/** Verify the X-PAYMENT payment-auth produced — locally, signatures only. */
async function verifyXPayment(attempt: PaidRetryAttempt, wallet: Address, amount: string) {
  const decoded = decodeXPayment(attempt.xPayment);
  assert(
    decoded.x402Version === 2 &&
      decoded.accepted.scheme === "exact" &&
      decoded.accepted.network === MAINNET_CAIP2 &&
      getAddress(decoded.accepted.payTo) === getAddress(VAULT as Address) &&
      getAddress(decoded.accepted.asset) === getAddress(WARS) &&
      decoded.accepted.amount === amount,
    `accepted binds vault + wARS + ${amount} (${JSON.stringify(decoded.accepted)})`
  );
  const auth = decoded.payload.permit2Authorization;
  const shapeOk =
    auth !== undefined &&
    getAddress(auth.from) === getAddress(wallet) &&
    getAddress(auth.permitted.token) === getAddress(WARS) &&
    auth.permitted.amount === amount &&
    getAddress(auth.witness.to) === getAddress(VAULT as Address) &&
    auth.witness.validAfter === "0";
  assert(shapeOk, `permit2Authorization: ${JSON.stringify(auth ?? "missing")}`);

  if (auth) {
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
      `permit2 witness signer recovers to Traveler wallet: ${recovered}`
    );
  }

  const permit = decoded.extensions?.eip2612GasSponsoring?.info as
    | {
        from: Address;
        asset: Address;
        spender: Address;
        amount: string;
        nonce: string;
        deadline: string;
        signature: Hex;
      }
    | undefined;
  assert(
    permit !== undefined &&
      getAddress(permit.from) === getAddress(wallet) &&
      getAddress(permit.asset) === getAddress(WARS) &&
      getAddress(permit.spender) === getAddress(PERMIT2) &&
      permit.amount === amount,
    `eip2612GasSponsoring.info present for ${amount}`
  );
  if (permit) {
    const recovered = await recoverTypedDataAddress({
      domain: {
        name: "Peso Argentino",
        version: "1",
        chainId: 42220,
        verifyingContract: getAddress(WARS),
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
      getAddress(recovered) === getAddress(wallet),
      `eip2612 permit signer recovers to Traveler wallet: ${recovered}`
    );
  }
}

async function main() {
  if (!VAULT) {
    console.error("ESCROW_ADDRESS must be set (apps/api/.env)");
    process.exit(1);
  }
  console.log(`api:        ${BASE}`);
  console.log(`escrow:     ${VAULT}`);
  console.log(`mode:       ${CONFIRM_MAINNET ? "CONFIRM-MAINNET — the paid retry goes on the wire" : "dry-run — stops before the paid retry"}`);

  const ids: string[] = [];
  try {
    step("sign in viajera (funded Traveler, 100 wARS)");
    const viajera = await signIn(VIAJERA.email, VIAJERA.password);
    const viajeraId = decodeJwtSub(viajera.token);
    assert(viajeraId === viajera.id, `traveler id ${viajeraId}`);
    const viajeraAuth = { token: viajera.token, travelerId: viajera.id };

    step("book_listing without a signed-in Traveler → no_traveler_session");
    const noSession = await bookListing.execute(
      { slug: "casa-de-dios-a1c1e0b3", checkin: "2026-11-10", checkout: "2026-11-11", guests: 1 },
      { session: { auth: { current: null } } } as never
    );
    assert(
      (noSession as { code?: string }).code === "no_traveler_session" &&
        (noSession as { status?: number }).status === 401,
      `refuses honestly, never pays from the project wallet: ${JSON.stringify(noSession)}`
    );

    step("cheapest ARS stay (search → detail → quote)");
    const stay = await cheapestArsStay();
    if (!stay) {
      fail("no quotable ARS listing found");
      return;
    }
    const totalWars = Number(stay.total_minor) / 1e6;
    ok(
      `${stay.slug} · ${stay.checkin}→${stay.checkout} (${stay.nights}n) · total ${stay.total_display} = ${totalWars} wARS — viajera's 100 wARS ${totalWars <= 100 ? "COVER it" : "do NOT cover it"}`
    );

    const bookPath = `/listings/${stay.slug}/book`;
    const bookBody = {
      checkin: stay.checkin,
      checkout: stay.checkout,
      guests: stay.guests,
      guest_ref: "smoke-book-traveler-pays",
    };

    step(`dry-run loop: book → 402 → payment-auth → abort before the paid retry`);
    const atomic = BigInt(stay.total_minor) * 10n ** 12n; // minor (1e-6) → 18-dec atomic
    let signed: PaidRetryAttempt | null = null;
    const dry = await apiPaidPost<Record<string, unknown>>(bookPath, bookBody, viajeraAuth, {
      beforePaidRetry: async (attempt) => {
        signed = attempt;
        console.log(`  would send: POST ${bookPath}`);
        console.log(`    authorization: Bearer <traveler token — redacted>`);
        console.log(`    payment-signature: <base64 v2 payload, ${attempt.xPayment.length} chars>`);
        console.log(`    body: ${JSON.stringify(bookBody)}`);
        await verifyXPayment(attempt, "0xD404961d4C4885dB42AFB7ecd5aBAC34070fF1E5", atomic.toString());
        return CONFIRM_MAINNET; // dry-run default: abort before anything can settle
      },
    });

    if (!CONFIRM_MAINNET) {
      const dryErr = dry.ok ? null : dry;
      assert(
        dryErr?.code === "dry_run" && signed !== null,
        `aborted dry_run with the signed payment in hand (code=${dryErr?.code})`
      );
    } else if (dry.ok) {
      const payment = dry.payment;
      assert(
        typeof payment?.transaction === "string" &&
          payment.transaction.startsWith("0x") &&
          getAddress(String(payment.payer)) ===
            getAddress("0xD404961d4C4885dB42AFB7ecd5aBAC34070fF1E5"),
        `settled: tx ${payment?.transaction} payer ${payment?.payer}`
      );
      const bookingId = (dry.data as { booking_id?: string }).booking_id;
      if (bookingId) {
        const { data: bkg } = await admin
          .from("bookings")
          .select("status, escrow_address, escrow_status, traveler_id")
          .eq("id", bookingId)
          .single();
        assert(
          bkg?.status === "confirmed" &&
            getAddress(String(bkg.escrow_address)) === getAddress(VAULT) &&
            bkg.escrow_status === "funded" &&
            bkg.traveler_id === viajera.id,
          `booking ${bookingId}: ${JSON.stringify(bkg)}`
        );
        const { data: pays } = await admin
          .from("payments")
          .select("payer, pay_to, amount_minor, asset, tx_hash")
          .eq("booking_id", bookingId);
        const pay = (pays ?? []).find((p) => p.tx_hash);
        assert(
          !!pay &&
            getAddress(String(pay.payer)) ===
              getAddress("0xD404961d4C4885dB42AFB7ecd5aBAC34070fF1E5") &&
            getAddress(String(pay.pay_to)) === getAddress(VAULT),
          `payments row: ${JSON.stringify(pay ?? pays)}`
        );
      }
    } else {
      const paidErr = dry.ok ? null : dry;
      fail(`paid retry failed: ${JSON.stringify({ error: paidErr?.error, code: paidErr?.code, status: paidErr?.status })}`);
    }

    step("unhappy paths (real code, zero spend)");
    const stamp = Date.now();
    // A real --confirm-mainnet run just took bookBody's nights: re-pick a free window.
    const fresh = CONFIRM_MAINNET ? await cheapestArsStay() : stay;
    if (!fresh) throw new Error("no free ARS window left for the unhappy paths");
    const unhappyPath = `/listings/${fresh.slug}/book`;
    const unhappyBody = { ...bookBody, checkin: fresh.checkin, checkout: fresh.checkout };

    const broke = await makeTraveler(`smoke-book-broke-${stamp}@example.com`);
    ids.push(broke.id);
    const { error: fundErr } = await admin
      .from("travelers")
      .update({ funded_at: new Date().toISOString() })
      .eq("id", broke.id)
      .is("funded_at", null);
    assert(!fundErr, `funded_at seeded for zero-balance Traveler`);
    const brokeRes = await apiPaidPost<Record<string, unknown>>(
      unhappyPath,
      unhappyBody,
      { token: broke.token, travelerId: broke.id },
      { beforePaidRetry: () => false }
    );
    const brokeErr = brokeRes.ok ? null : brokeRes;
    assert(
      brokeErr?.code === "insufficient_balance" &&
        brokeErr.details?.currency === "ARS" &&
        typeof brokeErr.details?.missing === "string" &&
        Number(brokeErr.details.missing) > 0 &&
        brokeErr.details?.available === "0",
      `zero balance → 409 insufficient_balance names currency + missing: ${JSON.stringify(brokeErr?.details)}`
    );

    const unfunded = await makeTraveler(`smoke-book-unfunded-${stamp}@example.com`);
    ids.push(unfunded.id);
    const unfundedRes = await apiPaidPost<Record<string, unknown>>(
      unhappyPath,
      unhappyBody,
      { token: unfunded.token, travelerId: unfunded.id },
      { beforePaidRetry: () => false }
    );
    const unfundedErr = unfundedRes.ok ? null : unfundedRes;
    assert(
      unfundedErr?.code === "funding_required" && unfundedErr.status === 403,
      `funded_at null → 403 funding_required ("cargá tu saldo primero"): ${JSON.stringify(unfundedErr?.error)}`
    );
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
