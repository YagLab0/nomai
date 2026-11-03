import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/bookings/[id]/messages — the private chat between the
 * Traveler and the Owner of one Booking (ADR-0009). Proxies to
 * {NOMAI_API_URL}/bookings/:id/messages with the session's access token:
 * the api re-checks the caller IS that Booking's Traveler — the client only
 * asks. GET marks the Traveler's side read; POST {body} appends a message.
 */
async function proxyMessages(request: Request, id: string) {
  const unauthenticated = NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!hasSupabaseEnv) return unauthenticated;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return unauthenticated;

  const sendsBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/bookings/${encodeURIComponent(id)}/messages`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(sendsBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: sendsBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'chat api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyMessages(request, id);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyMessages(request, id);
}
