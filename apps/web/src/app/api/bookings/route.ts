import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookings — the signed-in Traveler's Bookings, newest first.
 * Proxies to GET {NOMAI_API_URL}/bookings?traveler_id=<sub>, forwarding the
 * Supabase access token: the api only honors traveler_id when the Bearer's
 * sub matches it.
 */
export async function GET() {
  const unauthenticated = NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!hasSupabaseEnv) return unauthenticated;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session?.access_token) return unauthenticated;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/bookings?traveler_id=${encodeURIComponent(user.id)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
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
