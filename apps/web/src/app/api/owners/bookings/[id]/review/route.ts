import { proxyOwnerRequest } from '../../../proxy';

export const dynamic = 'force-dynamic';

/**
 * POST /api/owners/bookings/[id]/review — the Owner's Review of the guest
 * (ADR-0008, Airbnb's second side): completed Booking, 14-day window, one per
 * Booking. Proxies to POST {NOMAI_API_URL}/owners/bookings/:id/review.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/bookings/${encodeURIComponent(id)}/review`);
}
