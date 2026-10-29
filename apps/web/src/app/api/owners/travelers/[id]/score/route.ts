import { proxyOwnerRequest } from '../../../proxy';

export const dynamic = 'force-dynamic';

/**
 * GET /api/owners/travelers/[id]/score — the guest's weighted score
 * (ADR-0008, Airbnb's host-facing guest rating). Only an Owner who has hosted
 * this Traveler can read it — the api checks that against the caller's own
 * Booking rows. Proxies to GET {NOMAI_API_URL}/owners/travelers/:id/score.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/travelers/${encodeURIComponent(id)}/score`);
}
