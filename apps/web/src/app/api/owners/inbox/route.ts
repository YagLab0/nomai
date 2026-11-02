import { proxyOwnerRequest } from '../proxy';

export const dynamic = 'force-dynamic';

/**
 * GET /api/owners/inbox — the Owner's message inbox (ADR-0009): one thread
 * per Booking with messages, each with the guest's name, the Lodging's
 * title, the last line and the unread count. Proxies to
 * GET {NOMAI_API_URL}/owners/inbox with the session token.
 */
export async function GET(request: Request) {
  return proxyOwnerRequest(request, '/owners/inbox');
}
