import { proxyOwnerRequest } from '../../../proxy';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/owners/bookings/[id]/messages — the Owner's side of the
 * Booking's private chat with the Traveler (ADR-0009). Proxies to
 * {NOMAI_API_URL}/owners/bookings/:id/messages; the api re-checks the caller
 * owns the Booking's Lodging and marks the Owner's side read on GET.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/bookings/${encodeURIComponent(id)}/messages`);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/bookings/${encodeURIComponent(id)}/messages`);
}
