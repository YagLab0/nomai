import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/**
 * Thin proxy for the Owner write surface: the Lodging CRUD, status flips and
 * onboarding writes live in apps/api now (the secret key left this app), so
 * each handler forwards the verified session's access token as Bearer and
 * passes status + body through untouched. The request body — JSON today,
 * multipart photo uploads if they ever arrive — is forwarded intact with its
 * content-type. No session → the request still reaches the api, which
 * answers the same 401 the old route handlers did.
 */
export async function proxyOwnerRequest(request: Request, apiPath: string) {
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
    return NextResponse.json({ error: 'owners api unreachable' }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
