import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/[id]/review — the Traveler's Review of the stay
 * (ADR-0008). Proxies to POST {NOMAI_API_URL}/bookings/:id/review with the
 * session's access token: submit_review() re-checks inside one transaction
 * that the Booking completed, the 14-day window is open and the caller IS
 * that Booking's Traveler — the client only asks.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthenticated = NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!hasSupabaseEnv) return unauthenticated;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return unauthenticated;

  const { id } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/bookings/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: await request.arrayBuffer(),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'reviews api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
