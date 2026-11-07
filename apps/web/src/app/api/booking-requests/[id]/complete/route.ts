import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

/**
 * POST /api/booking-requests/:id/complete — the Traveler completes an IDEA
 * draft with dates/guests (ADR-0010). The API quotes fresh server-side and
 * flips it to PENDING (ready to pay). The client never names the listing —
 * the stay lands on the idea's own place.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!hasSupabaseEnv) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/bookings/requests/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
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
