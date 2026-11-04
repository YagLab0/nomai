// Passthrough for the nomai MCP surface: route handlers live in apps/api
// (POST /mcp, Streamable HTTP stateless + Bearer-auth'ed — see apps/api/src/
// mcp.ts and docs/mcp.md), and this handler forwards everything to
// {NOMAI_API_URL}/mcp so external MCP clients can connect to the web origin
// they already know (nomaiapp.vercel.app/api/mcp).
//
// The response body streams through untouched (MCP answers are SSE-framed).
// The only edited header is WWW-Authenticate 401 challenges: the API builds
// resource_metadata from ITS public URL, but a client connecting through this
// origin must keep seeing THIS origin, or the OAuth discovery dance lands on
// a resource URL no client ever connected to.
//
// CORS answers locally (browser connectors preflight every call — the API's
// CORS middleware would be a second network hop for the same headers).
// Docs: docs/mcp.md → "Conectar un conector MCP" (Route B).

import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/** Headers an MCP client may send or receive on this passthrough. */
const MCP_HEADERS = [
  'Content-Type',
  'Accept',
  'Authorization',
  'Mcp-Session-Id',
  'MCP-Protocol-Version',
  'Last-Event-ID',
] as const;

const cors = (headers: Headers) => {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', MCP_HEADERS.join(', '));
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate');
};

/** OPTIONS is the preflight: never hits the upstream, answers locally. */
export async function OPTIONS(_request: NextRequest) {
  const headers = new Headers({ Allow: 'POST, OPTIONS' });
  cors(headers);
  return new NextResponse(null, { status: 204, headers });
}

async function passthrough(request: NextRequest) {
  // Only forward the headers that mean something to the API — first-party
  // Next headers (cookie, x-forwarded-*) stay here.
  const headers: Record<string, string> = {};
  for (const key of ['content-type', 'authorization', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']) {
    const value = request.headers.get(key);
    if (value) headers[key] = value;
  }
  if (!headers['content-type'] && request.method === 'POST') {
    headers['content-type'] = 'application/json';
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/mcp`, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'nomai api unreachable' }, { status: 502 });
  }

  const out = new Headers(upstream.headers);
  const origin = request.nextUrl.origin;
  // The API answered 401 (and its challenge names the API origin): rewrite the
  // resource_metadata URL onto this origin so discovery keeps working for a
  // client that only ever talks to nomaiapp.vercel.app.
  const wwwAuth = upstream.headers.get('www-authenticate');
  if (wwwAuth) {
    out.set(
      'www-authenticate',
      wwwAuth.replace(/resource_metadata="[^"]*"/, `resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`),
    );
  }
  cors(out);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

export const GET = passthrough;
export const POST = passthrough;
export const DELETE = passthrough;

export const dynamic = 'force-dynamic';
