import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { proxyOwnerRequest } from '../proxy';

export const dynamic = 'force-dynamic';

/**
 * Owner Lodgings (owner-views §9): the wizard's persistence path.
 * GET lists the caller's Lodgings with their canRemove/canRelocate rules
 * (user-session read, RLS does the scoping). POST proxies to
 * POST {NOMAI_API_URL}/owners/lodgings — the publish write (property +
 * listing + photos + amenities + availability_nights in a single RPC
 * transaction) runs in apps/api, which holds the secret key now. The Owner
 * is always resolved through businesses.user_id = the verified user id;
 * the client never sends a business id.
 */

/** Booking statuses that count as an Upcoming Booking (GLOSSARY). */
const UPCOMING_STATUSES = ['pending_payment', 'confirmed', 'in_progress', 'claim_open'] as const;

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Iniciá sesión para ver tus alojamientos.' }, { status: 401 });
    }

    const { data: business, error: busErr } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (busErr) return NextResponse.json({ error: busErr.message }, { status: 500 });
    if (!business) {
      return NextResponse.json({ business: null, lodgings: [] });
    }

    const { data: rows, error: listErr } = await supabase
      .from('listings')
      .select(
        `id, slug, title, status, base_price_minor, currency, kind,
         max_guests, bedrooms, bathrooms, summary, description, rating, reviews,
         property:properties!inner (
           id, name, city, region, country_code, address_line1,
           latitude, longitude, timezone, property_type, business_id
         ),
         photos:listing_photos (url, alt_text, position, is_cover),
         amenities:listing_amenities (detail, amenity:amenities (code, name))`,
      )
      .eq('property.business_id', business.id)
      .neq('status', 'archived')
      .order('created_at', { ascending: true });
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const ids = (rows ?? []).map((r) => r.id);
    const today = new Date().toISOString().slice(0, 10);
    const { data: upcoming } = ids.length
      ? await supabase
          .from('bookings')
          .select('listing_id')
          .in('listing_id', ids)
          .in('status', [...UPCOMING_STATUSES])
          .gte('checkout', today)
      : { data: [] };
    const locked = new Set((upcoming ?? []).map((b) => b.listing_id));

    const lodgings = (rows ?? []).map((r) => ({
      ...r,
      amenities: (r.amenities ?? []).map((a) => ({
        code: a.amenity?.code ?? '',
        name: a.detail ?? a.amenity?.name ?? '',
      })),
      canRelocate: !locked.has(r.id),
      canRemove: !locked.has(r.id),
    }));

    const prop = rows?.[0]?.property;
    const property = Array.isArray(prop) ? prop[0] : prop;
    return NextResponse.json({
      business,
      countryCode: property?.country_code ?? 'AR',
      lodgings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return proxyOwnerRequest(request, '/owners/lodgings');
}
