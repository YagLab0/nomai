import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/**
 * POST /api/wallet/funding-link - the "Cargar" Funding link (issue #40).
 *
 * Forwards `{ amount, currency, country? }` to the api with the Traveler's
 * Supabase access token (same Bearer contract as GET /api/wallet). The api
 * answers the Ripio ramp deep link with the Traveler's own Agent wallet as
 * destination — the address rides inside that URL only and is never rendered
 * into nomai's DOM. Upstream errors (`invalid_amount`, `unsupported_currency`,
 * `currency_unavailable`, `wallet_unavailable`) propagate untouched.
 */
export async function POST(request: Request) {
  // Demo mode: no Supabase — no token to forward, same as GET /api/wallet.
  if (!hasSupabaseEnv) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!user || !session?.access_token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    amount?: number | string;
    currency?: string;
    country?: string;
  } | null;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/wallet/${user.id}/funding-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: body?.amount,
        currency: body?.currency,
        ...(typeof body?.country === 'string' ? { country: body.country } : {}),
      }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'wallet_api_unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
