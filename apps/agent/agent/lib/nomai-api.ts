// HTTP client for the nomai listings API (apps/api). The Agent only ever
// talks to listings through this boundary — mock data today, Supabase later —
// so tools stay identical when the data layer changes underneath.

import { NETWORK_CAIP2, networkName, TOKENS } from "./celo";
import type { TravelerAuth } from "./traveler-auth";
import { readSettlementReceipt, type SettlementReceipt } from "./x402";

const BASE = () =>
  (process.env.NOMAI_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

// The Traveler's Supabase access token, sent as `Authorization: Bearer` on
// user-scoped routes (/usage/*, /wallet/* — Credits were retired by ADR-0005).
// The API verifies it with the Auth server and the verified user id IS the
// traveler id. Resolve the Traveler with
// travelerAuth(ctx.session.auth.current) from ./traveler-auth:
// the token the web chat forwarded with this turn, or NOMAI_TRAVELER_TOKEN as
// the dev override.
export const travelerAuthHeaders = (traveler: TravelerAuth): Record<string, string> => ({
  authorization: `Bearer ${traveler.token}`,
});

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string };

async function send<T>(
  path: string,
  init?: RequestInit,
  params?: Record<string, string | number | string[] | undefined>,
  fetchImpl: typeof fetch = fetch
): Promise<{ result: ApiResult<T>; res?: Response; body?: unknown }> {
  const url = new URL(`${BASE()}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, v);
    else url.searchParams.set(key, String(value));
  }

  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    return {
      result: {
        ok: false,
        status: 0,
        error: `cannot reach nomai api at ${BASE()}: ${(err as Error).message}`,
      },
    };
  }
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!res.ok) {
    return {
      res,
      body,
      result: {
        ok: false,
        status: res.status,
        error: body?.error ?? `HTTP ${res.status}`,
        code: body?.code,
      },
    };
  }
  return { res, body, result: { ok: true, data: body as T } };
}

const request = async <T>(...args: Parameters<typeof send<T>>) =>
  (await send<T>(...args)).result;

export const apiGet = <T>(
  path: string,
  params?: Record<string, string | number | string[] | undefined>,
  headers?: Record<string, string>
) => request<T>(path, headers ? { headers } : undefined, params);

const postInit = (
  body: unknown,
  headers?: Record<string, string>
): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

export const apiPost = <T>(path: string, body: unknown, headers?: Record<string, string>) =>
  request<T>(path, postInit(body, headers));

export type PaidApiResult<T> =
  | { ok: true; data: T; payment: SettlementReceipt | null }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
      payment: SettlementReceipt | null;
      /** Extra fields the API error carried — e.g. insufficient_balance's
       *  token/currency/required/available/missing, or a dry_run's would-be
       *  retry under `attempt`. Passed through to the tool result. */
      details?: Record<string, unknown>;
    };

// ── Traveler-pays x402 (issue #62) ──────────────────────────────────────────
// A Booking's 402 is paid FROM THE TRAVELER'S AGENT WALLET, never from the
// project wallet: the API's POST /wallet/:traveler_id/payment-auth signs the
// requirements with the Traveler's custodial key, and the paid retry settles
// on-chain with payer = the Traveler. Funds land in the shared Escrow vault,
// not the Owner. The Traveler's Bearer rides every hop — the book route's
// precheck verifies it (and links the Booking via p_traveler_id) and
// payment-auth only signs for the Bearer owner.
//
// The project-wallet buyer (paymentFetch in ./x402) stays for pay_endpoint —
// it is NOT a fallback here: a Booking can only ever be paid by a Traveler.

/** One accepts[] entry from the 402 — what payment-auth takes as `requirements`. */
interface AcceptedRequirement {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

/** The 402's requirements document — the PAYMENT-REQUIRED header decodes to it
 *  (v2 puts it in the header; some responses repeat it in the JSON body). */
interface PaymentRequiredDoc {
  resource?: { url: string; description?: string; mimeType?: string };
  accepts?: AcceptedRequirement[];
  extensions?: Record<string, unknown>;
}

/** What payment-auth returns on success. */
interface PaymentAuthOk {
  ok: boolean;
  x_payment?: string;
  payer?: string;
}

export interface PaidRetryAttempt {
  /** The accepts entry picked from the 402 and signed by payment-auth. */
  requirements: AcceptedRequirement;
  /** The PAYMENT-SIGNATURE header value — the signed payment payload. */
  xPayment: string;
  /** The Traveler's Agent wallet, per payment-auth. */
  payer?: string;
}

export interface PaidPostHooks {
  /** Called right before the paid retry hits the wire. Returning false aborts
   *  BEFORE anything can settle — the smoke's dry run uses it to print the
   *  would-be payment; the result comes back code "dry_run". */
  beforePaidRetry?: (attempt: PaidRetryAttempt) => boolean | Promise<boolean>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The requirements document off a 402 response: PAYMENT-REQUIRED header
 *  first (canonical on v2), JSON body as fallback. */
function paymentRequiredFrom(res: Response | undefined, body: unknown): PaymentRequiredDoc | null {
  const raw = res?.headers.get("payment-required");
  if (raw) {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as PaymentRequiredDoc;
    } catch {
      return null;
    }
  }
  return isRecord(body) && Array.isArray(body.accepts)
    ? (body as PaymentRequiredDoc)
    : null;
}

/** The accepts entry to pay: `exact` on the configured Celo network, preferring
 *  a facilitator-known asset. The book route advertises exactly the Lodging's
 *  settlement asset — its own wFIAT — so nothing here names a token: wARS,
 *  wBRL, USDC all flow through the same pick. */
function pickRequirement(accepts: AcceptedRequirement[] | undefined): AcceptedRequirement | null {
  const network = networkName();
  const caip2 = NETWORK_CAIP2[network];
  const candidates = (accepts ?? []).filter(
    (a) => isRecord(a) && a.scheme === "exact" && a.network === caip2
  );
  if (candidates.length === 0) return null;
  return (
    candidates.find((a) =>
      Object.values(TOKENS[network]).some(
        (t) => t.address.toLowerCase() === String(a.asset).toLowerCase()
      )
    ) ?? candidates[0]
  );
}

const paymentFailed = (status: number, error: string, detail?: string): PaidApiResult<never> => ({
  ok: false,
  status,
  error,
  code: "payment_failed",
  payment: null,
  details: detail ? { payment_auth_error: detail } : undefined,
});

// POST to the x402-gated Booking route, paying the 402 from the TRAVELER'S
// Agent wallet (payment-auth signs — the API holds the key, never us). The
// settlement receipt (PAYMENT-RESPONSE: tx hash, payer, network) comes back
// as `payment`. Failures are honest codes: insufficient_balance (409, with
// details naming currency/missing), funding_required (403), unauthorized /
// forbidden on the Bearer, payment_failed for every other signing or
// settlement failure — never a fake confirmation.
export async function apiPaidPost<T>(
  path: string,
  body: unknown,
  traveler: TravelerAuth,
  hooks?: PaidPostHooks
): Promise<PaidApiResult<T>> {
  const authHeaders = travelerAuthHeaders(traveler);

  const first = await send<T>(path, postInit(body, authHeaders));
  if (first.result.ok) {
    // A paid route answering without payment — pass through untouched.
    const payment = first.res ? readSettlementReceipt(first.res) : null;
    return { ...first.result, payment };
  }
  if (first.result.status !== 402) {
    // Domain answers (400/404/409, 401 on a bad Bearer, 503
    // escrow_unconfigured) pass through with their code untouched.
    return { ...first.result, payment: null };
  }

  // The 402 advertises the Lodging's settlement asset — pick the entry the
  // API resolved for our network (the Lodging's wFIAT, or USDC for USD).
  const requiredDoc = paymentRequiredFrom(first.res, first.body);
  const requirements = pickRequirement(requiredDoc?.accepts);
  if (!requirements) {
    return paymentFailed(
      402,
      `the API's 402 advertised no payable requirement on ${NETWORK_CAIP2[networkName()]}`
    );
  }

  // payment-auth: the API signs with the Traveler's custodial key — it only
  // ever signs payTo = the Escrow vault in a configured asset, for the
  // Bearer owner.
  const auth = await send<PaymentAuthOk>(
    `/wallet/${encodeURIComponent(traveler.travelerId)}/payment-auth`,
    postInit(
      {
        requirements,
        extensions: requiredDoc?.extensions,
        resource: requiredDoc?.resource,
      },
      authHeaders
    )
  );
  if (!auth.result.ok) {
    const authBody = isRecord(auth.body) ? auth.body : {};
    const apiError = typeof authBody.error === "string" ? authBody.error : auth.result.error;
    if (auth.result.status === 409 && apiError === "insufficient_balance") {
      // Names the wFIAT and the missing amount — Nomito turns it into
      // "te faltan X wARS, cargá desde Tu saldo".
      const { error: _e, ...fields } = authBody;
      return {
        ok: false,
        status: 409,
        error: "insufficient_balance",
        code: "insufficient_balance",
        payment: null,
        details: fields,
      };
    }
    if (auth.result.status === 403 && apiError === "funding_required") {
      return {
        ok: false,
        status: 403,
        error: "funding_required",
        code: "funding_required",
        payment: null,
      };
    }
    if (auth.result.status === 401 || (auth.result.status === 403 && apiError === "forbidden")) {
      // The Bearer stopped verifying between the two calls (or belongs to
      // another Traveler) — a session problem, not a payment one. The API's
      // auth errors carry no `code` field; the error name doubles as it.
      return {
        ok: false,
        status: auth.result.status,
        error: apiError,
        code: apiError,
        payment: null,
      };
    }
    // destination_forbidden / unsupported_asset / invalid_requirements /
    // unsupported_network / escrow_unavailable / wallet_unavailable /
    // rpc_unreachable: the payment could not be authorized — payment_failed,
    // no retry loop.
    return paymentFailed(
      auth.result.status,
      `payment authorization failed: ${apiError}`,
      apiError
    );
  }

  const { x_payment: xPayment, payer } = auth.result.data;
  if (!xPayment) {
    return paymentFailed(0, "payment-auth returned no X-PAYMENT");
  }

  // The smoke aborts here — after a real signature, before any settle.
  if (hooks?.beforePaidRetry && !(await hooks.beforePaidRetry({ requirements, xPayment, payer }))) {
    return {
      ok: false,
      status: 402,
      error: "dry run — the paid retry was not sent",
      code: "dry_run",
      payment: null,
      details: { attempt: { requirements, xPayment, payer } },
    };
  }

  // The paid retry: PAYMENT-SIGNATURE is the only header the v2 middleware
  // reads (X-PAYMENT is v1). The Bearer rides again — the handler re-verifies
  // it for the p_traveler_id link after the payment verifies.
  const retry = await send<T>(
    path,
    postInit(body, { ...authHeaders, "payment-signature": xPayment })
  );
  const payment = retry.res ? readSettlementReceipt(retry.res) : null;
  if (retry.result.ok) return { ...retry.result, payment };
  // Still 402 after the paid retry: the facilitator rejected the payment
  // (insufficient balance raced, expired authorization, settlement error).
  if (retry.result.status === 402) {
    return {
      ...retry.result,
      error:
        retry.result.error === "HTTP 402"
          ? "x402 payment was not accepted — the Traveler's Agent wallet may be unfunded or settlement failed"
          : retry.result.error,
      code: retry.result.code ?? "payment_failed",
      payment,
    };
  }
  return { ...retry.result, payment };
}
