import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { isCreditStage, STAGE_COST_MONEDAS } from '@/lib/nomito/credits';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

/**
 * /api/credits → the Credits endpoints in apps/api, authenticated as the
 * Traveler: the @supabase/ssr session's access_token is forwarded as Bearer —
 * the api resolves it to the traveler id (see src/credits.ts there).
 *
 * GET  → GET  {API}/credits/balance   → { balance }
 * POST → POST {API}/credits/spend
 *
 * Spend is priced server-side: the browser posts only { stage, reference?,
 * meta? } and this handler resolves the amount from STAGE_COST_MONEDAS.
 * Taking the amount from the request would let a Traveler under-charge their
 * own ledger — cheap live queries against a free grant (ADR-0002).
 */
async function bearer(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function GET() {
  const token = await bearer();
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/credits/balance`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'credits api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request) {
  const token = await bearer();
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    stage?: unknown;
    reference?: string | null;
    meta?: Record<string, unknown>;
  } | null;
  if (!isCreditStage(body?.stage)) {
    return NextResponse.json({ error: 'invalid stage' }, { status: 400 });
  }
  const stage = body!.stage;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/credits/spend`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: STAGE_COST_MONEDAS[stage],
        stage,
        reference: body?.reference ?? null,
        meta: body?.meta ?? {},
      }),
    });
  } catch {
    return NextResponse.json({ error: 'credits api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
