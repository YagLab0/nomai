import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/**
 * Thin proxy for the Traveler chat threads: CRUD lives in apps/api
 * (Bearer-scoped, RLS per Traveler), so each handler forwards the verified
 * session's access token and passes status + body through untouched — same
 * shape as the /api/owners proxies.
 */
export async function proxyChatRequest(request: Request, apiPath: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const sendsBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}${apiPath}`, {
      method: request.method,
      headers,
      body: sendsBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'chats api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
