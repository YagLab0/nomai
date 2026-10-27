import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  parseLodgingDraft,
  persistPhotos,
  removeUploaded,
  rpcFailureStatus,
  slugify,
  type RpcResult,
} from './shared';

export const dynamic = 'force-dynamic';

/**
 * Owner Lodgings (owner-views §9): the wizard's persistence path.
 * GET lists the caller's Lodgings with their canRemove/canRelocate rules;
 * POST publishes one — property + listing + photos + amenities +
 * availability_nights in a single RPC transaction. The Owner is always
 * resolved through businesses.user_id = auth.uid(); the client never sends
 * a business id.
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
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Iniciá sesión para publicar un alojamiento.' }, { status: 401 });
    }

    const { data: business, error: busErr } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (busErr) return NextResponse.json({ error: busErr.message }, { status: 500 });
    if (!business) {
      return NextResponse.json(
        { error: 'Primero registrá tu negocio en /owners/join.' },
        { status: 403 },
      );
    }

    const parsed = parseLodgingDraft(await request.json().catch(() => ({})));
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const listingId = `lst_${suffix}`;
    const propertyId = `prp_${suffix}`;
    const slug = `${slugify(parsed.name)}-${suffix}`;

    const stored = await persistPhotos(parsed.photos, business.id, listingId);
    if ('error' in stored) {
      return NextResponse.json({ error: stored.error }, { status: 400 });
    }

    // service_role-only RPC (same lockdown as the booking RPCs): the session
    // was verified above, so the Owner is identified by that user's id.
    const { data: result, error: rpcErr } = await createAdminClient().rpc('create_lodging', {
      p_user_id: user.id,
      p_name: parsed.name,
      p_property_type: parsed.propertyType,
      p_city: parsed.city,
      p_region: parsed.region,
      p_country_code: parsed.countryCode,
      p_timezone: parsed.timezone,
      p_address: parsed.address,
      p_latitude: parsed.lat,
      p_longitude: parsed.lng,
      p_guests: parsed.guests,
      p_bedrooms: parsed.bedrooms,
      p_bathrooms: parsed.baths,
      p_base_price_minor: parsed.basePriceMinor,
      p_currency: parsed.currency,
      p_blurb: parsed.blurb,
      p_photos: stored.urls,
      p_amenities: parsed.amenities,
      p_listing_id: listingId,
      p_property_id: propertyId,
      p_slug: slug,
    });

    const typed = result as RpcResult | null;
    const failure = rpcErr
      ? { code: 'internal', message: rpcErr.message }
      : typed?.ok === false
        ? (typed.error ?? {})
        : null;
    if (failure) {
      await removeUploaded(stored.uploadedPaths);
      return NextResponse.json(
        { error: failure.message ?? 'No se pudo publicar.' },
        { status: rpcFailureStatus(failure.code) },
      );
    }

    return NextResponse.json({ success: true, ...typed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
