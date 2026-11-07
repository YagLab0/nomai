import { proxyOwnerRequest } from '../../../../proxy';

export const dynamic = 'force-dynamic';

/**
 * POST { nights: ["YYYY-MM-DD", …] } reopens those nights (blocked → open).
 * Proxies to POST {NOMAI_API_URL}/owners/lodgings/:id/nights/unblock, which
 * runs the service_role-only `unblock_nights` RPC — ownership is re-checked
 * against the verified Bearer user, and a booked night is never touched (it
 * comes back in `skipped`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/lodgings/${encodeURIComponent(id)}/nights/unblock`);
}
