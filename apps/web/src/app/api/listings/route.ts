import { NextResponse } from 'next/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/**
 * GET /api/listings?... → GET {NOMAI_API_URL}/listings/search?...
 *
 * Same-origin proxy for client components (the explorer fetches through here;
 * server components talk to apps/api directly via lib/api.ts). Query string is
 * forwarded verbatim — the upstream validates params.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { search } = new URL(request.url);

  let upstream: Response;
  try {
    // no-store: inventory mutates with every Booking, never serve a stale list.
    upstream = await fetch(`${API_URL}/listings/search${search}`, { cache: 'no-store' });
  } catch {
    return NextResponse.json({ error: 'listings api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
