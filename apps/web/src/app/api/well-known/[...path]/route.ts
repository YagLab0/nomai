// Public well-knowns for the nomai surface, served from the WEB origin.
// Rewritten from /.well-known/:path* to here (next.config.mjs Rewrite).
//
// 1. RFC 9728 OAuth protected-resource metadata for the MCP surface. The MCP
//    proxy (app/api/mcp/route.ts) forwards /mcp to apps/api, but an MCP client
//    connecting to this origin must discover an authorization server for THIS
//    origin's resource — the API's own well-known would advertise the API host,
//    and the discovery pair would point the client at a resource it never
//    connected to.
//
//    Authorization server: Supabase Auth (the same issuer the API's /mcp 401
//    challenges point at; NEXT_PUBLIC_SUPABASE_URL is the web's public env, so
//    no apps/api secret ever lives here). The consent screen is
//    /(auth)/oauth/consent — see docs/mcp.md.
//
// 2. The ERC-8004 registration document (agent.json) the Identity Registry
//    stores as the project's `agentURI` — docs/erc8004-registration.md.

import { NextResponse, type NextRequest } from 'next/server';

import { agentRegistrationDocument } from '@/lib/agent-identity';

const WELL_KNOWN_PATHS = new Set([`oauth-protected-resource`, `oauth-protected-resource/mcp`]);

function metadata(request: NextRequest) {
  const supabaseBase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    .replace(/\/+$/, '');
  return NextResponse.json({
    resource: `${request.nextUrl.origin}/api/mcp`,
    authorization_servers: supabaseBase ? [`${supabaseBase}/auth/v1`] : [],
    bearer_methods_supported: ['header'],
    scopes_supported: [],
    resource_name: 'nomai — Traveler bookings, requests and threads',
  });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const joined = path?.join('/') ?? '';
  if (joined === 'agent.json') {
    // Public discovery: no auth, cacheable, same document the registry's URI
    // resolves to. The origin comes from the request so previews and a custom
    // domain both advertise themselves.
    return NextResponse.json(agentRegistrationDocument(request.nextUrl.origin), {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }
  if (!WELL_KNOWN_PATHS.has(joined)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return metadata(request);
}

// Only the Supabase redirect chain may call these — no cache across users.
export const dynamic = 'force-dynamic';
