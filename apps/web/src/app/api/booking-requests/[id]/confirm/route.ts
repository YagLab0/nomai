import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { paidBook } from '@/lib/book-paid';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

/**
 * POST /api/booking-requests/:id/confirm — the Traveler confirms a pending
 * draft (ADR-0010). Runs the normal paid Booking flow server-side with the
 * request's own params (never trusts stay fields from the client), then
 * marks the request converted so the app stops offering it.
 *
 * Honest failures: 409 insufficient_balance (names currency/missing),
 * 403 funding_required, 404 request not found, 410 request no longer
 * pending — never a fake confirmation.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!hasSupabaseEnv) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session?.access_token) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const token = session.access_token;

  // The request itself, read server-side — the stay params come from the
  // draft, not from the click.
  let listRes: Response;
  try {
    listRes = await fetch(`${API_URL}/bookings/requests`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'bookings api unreachable' }, { status: 502 });
  }
  if (!listRes.ok) {
    return NextResponse.json({ error: 'could not read booking requests' }, { status: 502 });
  }
  const list = (await listRes.json().catch(() => null)) as {
    requests?: Array<{
      request_id: string;
      listing_slug?: string;
      status: string;
      expires_at: string;
      checkin: string;
      checkout: string;
      guests: number;
    }>;
  } | null;
  const req = list?.requests?.find((r) => r.request_id === id);
  if (!req) return NextResponse.json({ error: 'booking request not found' }, { status: 404 });
  if (req.status !== 'pending' || new Date(req.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'this request is no longer pending' }, { status: 410 });
  }
  const slug = req.listing_slug;
  if (!slug) return NextResponse.json({ error: 'booking request has no listing' }, { status: 500 });

  const paid = await paidBook(
    slug,
    { checkin: req.checkin, checkout: req.checkout, guests: req.guests },
    user.id,
    token,
  );
  if (!paid.ok) {
    return NextResponse.json(
      { error: paid.error, code: paid.code, details: paid.details },
      { status: paid.status === 0 ? 502 : paid.status },
    );
  }

  // Link the draft to the real Booking — best effort after a real payment:
  // the Booking exists even if this call fails, so never 500 over it.
  try {
    await fetch(`${API_URL}/bookings/requests/${encodeURIComponent(id)}/converted`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: paid.booking.booking_id }),
      cache: 'no-store',
    });
  } catch {
    // Swallowed on purpose — see above.
  }

  return NextResponse.json({ ok: true, booking: paid.booking }, { status: 201 });
}
