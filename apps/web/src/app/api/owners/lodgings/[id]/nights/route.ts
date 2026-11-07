import { proxyOwnerRequest } from '../../../proxy';

export const dynamic = 'force-dynamic';

/**
 * GET lists the Lodging's nights (id or slug) from today on: `open`,
 * `blocked` or `booked`. Proxies to GET {NOMAI_API_URL}/owners/lodgings/:id/nights,
 * which re-checks that the Bearer user owns the Lodging.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyOwnerRequest(request, `/owners/lodgings/${encodeURIComponent(id)}/nights`);
}
