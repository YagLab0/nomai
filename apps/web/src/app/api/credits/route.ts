import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

/**
 * /api/credits → the Credits endpoints in apps/api, authenticated as the
 * Traveler: the @supabase/ssr session's access_token is forwarded as Bearer —
 * the api resolves it to the traveler id (see src/credits.ts there).
 *
 * GET  → GET  {API}/credits/balance   → { balance }
 * POST → POST {API}/credits/spend     → { amount, stage } spend rows
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

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/credits/spend`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: await request.text(),
    });
  } catch {
    return NextResponse.json({ error: 'credits api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
