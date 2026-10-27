import { proxyOwnerRequest } from '../../../proxy';

export const dynamic = 'force-dynamic';

/**
 * PATCH flips the Lodging between 'published' and 'paused' (id or slug).
 * Proxies to PATCH {NOMAI_API_URL}/owners/lodgings/:id/status, which runs
 * the service_role-only `set_lodging_status` RPC — it re-checks ownership
 * against the verified Bearer user, refuses every other status, and keeps
 * 'archived' a one-way door. Pausing is allowed with Upcoming Bookings:
 * they stand.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/lodgings/${encodeURIComponent(id)}/status`);
}
