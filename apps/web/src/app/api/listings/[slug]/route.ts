import { NextResponse } from 'next/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/**
 * GET /api/listings/:slug → GET {NOMAI_API_URL}/listings/:slug — listing detail
 * proxy for client components.
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/listings/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  } catch {
    return NextResponse.json({ error: 'listings api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
