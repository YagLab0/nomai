/**
 * Server-side x402 paid-booking runner for the web (ADR-0010 confirm step).
 *
 * The Traveler's "Confirmar y pagar" click lands here with the session token;
 * this module replays the agent's paid flow server-side:
 *   1. POST /listings/:slug/book (no payment) → 402 with the server-side
 *      price in PAYMENT-REQUIRED (+ JSON body fallback).
 *   2. POST /wallet/:travelerId/payment-auth with the advertised requirements
 *      → the API signs with the Traveler's custodial key (it only ever signs
 *      payTo = the Escrow vault, for the Bearer owner).
 *   3. Retry the book with `payment-signature` → 201 Booking + settlement
 *      receipt (never a fake confirmation).
 *
 * Port of apps/agent/agent/lib/nomai-api.ts apiPaidPost, minus the dry-run
 * hooks: the web never dry-runs. The frozen total the Traveler saw travels as
 * `expected_total_minor`; the API re-quotes and answers 409 price_changed if
 * it moved, before any 402 or payment.
 */

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

interface AcceptsEntry {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

interface PaymentRequiredDoc {
  resource?: { url: string; description?: string; mimeType?: string };
  accepts?: AcceptsEntry[];
  extensions?: Record<string, unknown>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function paymentRequiredFrom(res: Response | undefined, body: unknown): PaymentRequiredDoc | null {
  const raw = res?.headers.get('payment-required');
  if (raw) {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as PaymentRequiredDoc;
    } catch {
      return null;
    }
  }
  return isRecord(body) && Array.isArray(body.accepts) ? (body as PaymentRequiredDoc) : null;
}

/**
 * The 402 advertises exactly the Lodging's settlement asset (its own wFIAT,
 * resolved server-side) — take the first `exact` entry. Nothing here names a
 * token: wARS, wBRL, USDC all flow through the same pick.
 */
function pickRequirement(accepts: AcceptsEntry[] | undefined): AcceptsEntry | null {
  const candidates = (accepts ?? []).filter((a) => isRecord(a) && a.scheme === 'exact');
  return candidates[0] ?? null;
}

export interface PaidBookingOk {
  booking_id: string;
  [key: string]: unknown;
}

export type PaidBookingResult =
  | { ok: true; booking: PaidBookingOk }
  | { ok: false; status: number; error: string; code?: string; details?: Record<string, unknown> };

export async function paidBook(
  slug: string,
  stay: { checkin: string; checkout: string; guests: number },
  expectedTotalMinor: number,
  travelerId: string,
  token: string,
): Promise<PaidBookingResult> {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const bookPath = `${API_URL}/listings/${encodeURIComponent(slug)}/book`;
  const bookBody = JSON.stringify({
    ...stay,
    expected_total_minor: expectedTotalMinor,
  });

  const first = await fetch(bookPath, {
    method: 'POST',
    headers,
    body: bookBody,
    cache: 'no-store',
  });
  const firstBody = (await first.json().catch(() => null)) as Record<string, unknown> | null;
  if (first.ok) {
    // A paid route answering without payment — pass through untouched.
    return { ok: true, booking: firstBody as unknown as PaidBookingOk };
  }
  if (first.status !== 402) {
    return {
      ok: false,
      status: first.status,
      error: (firstBody?.error as string) ?? `HTTP ${first.status}`,
      code: firstBody?.code as string | undefined,
    };
  }

  const doc = paymentRequiredFrom(first, firstBody);
  const requirements = pickRequirement(doc?.accepts);
  if (!requirements) {
    return { ok: false, status: 402, error: 'the API advertised no payable requirement', code: 'payment_failed' };
  }

  const authRes = await fetch(`${API_URL}/wallet/${encodeURIComponent(travelerId)}/payment-auth`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requirements,
      extensions: doc?.extensions,
      resource: doc?.resource,
    }),
    cache: 'no-store',
  });
  const authBody = (await authRes.json().catch(() => null)) as Record<string, unknown> | null;
  if (!authRes.ok) {
    const apiError = typeof authBody?.error === 'string' ? authBody.error : `HTTP ${authRes.status}`;
    if (authRes.status === 409 && apiError === 'insufficient_balance') {
      const { error: _e, ...fields } = authBody ?? {};
      return {
        ok: false,
        status: 409,
        error: 'insufficient_balance',
        code: 'insufficient_balance',
        details: fields as Record<string, unknown>,
      };
    }
    if (authRes.status === 403 && apiError === 'funding_required') {
      return { ok: false, status: 403, error: 'funding_required', code: 'funding_required' };
    }
    return { ok: false, status: authRes.status, error: `payment authorization failed: ${apiError}`, code: 'payment_failed' };
  }

  const xPayment = authBody?.x_payment;
  if (typeof xPayment !== 'string' || !xPayment) {
    return { ok: false, status: 0, error: 'payment-auth returned no X-PAYMENT', code: 'payment_failed' };
  }

  const retry = await fetch(bookPath, {
    method: 'POST',
    headers: { ...headers, 'payment-signature': xPayment },
    body: bookBody,
    cache: 'no-store',
  });
  const retryBody = (await retry.json().catch(() => null)) as Record<string, unknown> | null;
  if (retry.ok) {
    return { ok: true, booking: retryBody as unknown as PaidBookingOk };
  }
  if (retry.status === 402) {
    return {
      ok: false,
      status: 402,
      error:
        retryBody?.error === 'HTTP 402'
          ? 'x402 payment was not accepted — the Traveler wallet may be unfunded or settlement failed'
          : ((retryBody?.error as string) ?? 'HTTP 402'),
      code: (retryBody?.code as string) ?? 'payment_failed',
    };
  }
  return {
    ok: false,
    status: retry.status,
    error: (retryBody?.error as string) ?? `HTTP ${retry.status}`,
    code: retryBody?.code as string | undefined,
  };
}
