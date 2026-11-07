import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

async function session() {
  if (!hasSupabaseEnv) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session?.access_token) return null;
  return { user, token: session.access_token };
}

/**
 * GET /api/booking-requests — the signed-in Traveler's drafts (ADR-0010),
 * newest first. Proxies GET {NOMAI_API_URL}/bookings/requests.
 */
export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/bookings/requests`, {
      headers: { Authorization: `Bearer ${s.token}` },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'bookings api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}

/**
 * POST /api/booking-requests — create a draft from the app itself
 * (same contract as the MCP tool, ADR-0010): { slug, checkin, checkout,
 * guests }. The API quotes fresh server-side; no payment happens here.
 */
export async function POST(request: Request) {
  const s = await session();
  if (!s) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/bookings/requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.token}`,
        'Content-Type': 'application/json',
      },
      body: await request.arrayBuffer(),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'bookings api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
