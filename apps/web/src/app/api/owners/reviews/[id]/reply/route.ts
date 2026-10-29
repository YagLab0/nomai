import { proxyOwnerRequest } from '../../../proxy';

export const dynamic = 'force-dynamic';

/**
 * POST /api/owners/reviews/[id]/reply — the Owner's public answer under a
 * guest's Review (ADR-0008, Booking-style reply). Proxies to
 * POST {NOMAI_API_URL}/owners/reviews/:id/reply; reply_to_review() re-checks
 * ownership server-side.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/reviews/${encodeURIComponent(id)}/reply`);
}
