import { proxyOwnerRequest } from '../../proxy';

export const dynamic = 'force-dynamic';

/**
 * Starts the payout verification (issue #68): the api sends a small unique
 * random amount of the Owner's wFIAT from the ops wallet to the stored
 * Ripio deposit address — the test deposit the Owner later confirms in
 * Ripio. Cooldown and float checks answer 429/503 there.
 */
export async function POST(request: Request) {
  return proxyOwnerRequest(request, '/owners/payout/verify');
}
