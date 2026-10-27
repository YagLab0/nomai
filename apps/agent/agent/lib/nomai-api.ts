// HTTP client for the nomai listings API (apps/api). The Agent only ever
// talks to listings through this boundary — mock data today, Supabase later —
// so tools stay identical when the data layer changes underneath.

import type { TravelerAuth } from "./traveler-auth";
import { paymentFetch, readSettlementReceipt, type SettlementReceipt } from "./x402";

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

/** Thrown by the paying fetch when the x402 payment itself cannot be built. */
class PaymentError extends Error {}

async function send<T>(
  path: string,
  init?: RequestInit,
  params?: Record<string, string | number | string[] | undefined>,
  fetchImpl: typeof fetch = fetch
): Promise<{ result: ApiResult<T>; res?: Response }> {
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
    if (err instanceof PaymentError) throw err;
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
      result: {
        ok: false,
        status: res.status,
        error: body?.error ?? `HTTP ${res.status}`,
        code: body?.code,
      },
    };
  }
  return { res, result: { ok: true, data: body as T } };
}

const request = async <T>(...args: Parameters<typeof send<T>>) =>
  (await send<T>(...args)).result;

export const apiGet = <T>(
  path: string,
  params?: Record<string, string | number | string[] | undefined>,
  headers?: Record<string, string>
) => request<T>(path, headers ? { headers } : undefined, params);

const postInit = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const apiPost = <T>(path: string, body: unknown) => request<T>(path, postInit(body));

export type PaidApiResult<T> =
  | { ok: true; data: T; payment: SettlementReceipt | null }
  | { ok: false; status: number; error: string; code?: string; payment: SettlementReceipt | null };

// POST to an x402-gated route, paying the 402 from the agent wallet. The
// settlement receipt (PAYMENT-RESPONSE: tx hash, payer, network) comes back
// as `payment`. Wallet/signing failures (no CELO_PRIVATE_KEY, unfunded wallet,
// rejected settlement) come back as ok:false with code "payment_failed" —
// never as a success.
export async function apiPaidPost<T>(path: string, body: unknown): Promise<PaidApiResult<T>> {
  let payFetch: typeof fetch;
  try {
    payFetch = paymentFetch();
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: `agent wallet unavailable: ${(err as Error).message}`,
      code: "payment_failed",
      payment: null,
    };
  }

  // wrapFetchWithPayment throws when it cannot build the payment (e.g. no
  // matching scheme, signing error) — that is a payment failure, not a
  // network one.
  const wrapped: typeof fetch = async (input, init) => {
    try {
      return await payFetch(input, init);
    } catch (err) {
      // undici reports an unreachable host as TypeError("fetch failed").
      if (err instanceof TypeError) throw err;
      throw new PaymentError((err as Error).message);
    }
  };

  try {
    const { result, res } = await send<T>(path, postInit(body), undefined, wrapped);
    const payment = res ? readSettlementReceipt(res) : null;
    if (result.ok) return { ...result, payment };
    // Still 402 after the paid retry: the facilitator rejected the payment
    // (insufficient balance, expired authorization, settlement error).
    if (result.status === 402) {
      return {
        ...result,
        error:
          result.error === "HTTP 402"
            ? "x402 payment was not accepted — the agent wallet may be unfunded or settlement failed"
            : result.error,
        code: result.code ?? "payment_failed",
        payment,
      };
    }
    return { ...result, payment };
  } catch (err) {
    if (!(err instanceof PaymentError)) throw err;
    return {
      ok: false,
      status: 402,
      error: `x402 payment failed: ${err.message}`,
      code: "payment_failed",
      payment: null,
    };
  }
}
