import { proxyOwnerRequest } from '../proxy';

export const dynamic = 'force-dynamic';

/**
 * GET /api/owners/reviews — the Owner's review feed (ADR-0008): the
 * business's weighted storefront score, the Reviews guests left on its
 * Lodgings and the Reviews it wrote about Travelers. Proxies to
 * GET {NOMAI_API_URL}/owners/reviews with the session token.
 */
export async function GET(request: Request) {
  return proxyOwnerRequest(request, '/owners/reviews');
}
