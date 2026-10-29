import { proxyOwnerRequest } from '../../proxy';

export const dynamic = 'force-dynamic';

/**
 * Confirms the payout verification (issue #68): the Owner types the amount
 * Ripio credited — { amount } — and the api matches it against the expected
 * deposit. Three misses void the verification; the expected amount never
 * leaves the api.
 */
export async function POST(request: Request) {
  return proxyOwnerRequest(request, '/owners/payout/confirm');
}
