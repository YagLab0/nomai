import { proxyOwnerRequest } from '../../proxy';

export const dynamic = 'force-dynamic';

/**
 * PATCH edits the Lodging (id or slug); DELETE archives it. Both proxy to
 * apps/api (`/owners/lodgings/:id`), which runs the service_role-only RPCs
 * that re-check ownership (against the verified Bearer user) and the
 * Upcoming Booking rules — the client can only ask, never decide.
 */

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/lodgings/${encodeURIComponent(id)}`);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/lodgings/${encodeURIComponent(id)}`);
}
