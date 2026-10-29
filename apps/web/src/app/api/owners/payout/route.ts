import { proxyOwnerRequest } from '../proxy';

export const dynamic = 'force-dynamic';

/**
 * The Owner's Ripio deposit address (issue #68). GET serves the payout
 * state — address, verified_at, the in-flight verification's public fields
 * (never the expected amount). PUT stores the address via the api's
 * service_role RPC: PostgREST writes to payout_address are closed by column
 * grants, so this proxy is the only way in.
 */
export async function GET(request: Request) {
  return proxyOwnerRequest(request, '/owners/payout');
}

export async function PUT(request: Request) {
  return proxyOwnerRequest(request, '/owners/payout');
}
