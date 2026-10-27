import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  parseLodgingDraft,
  persistPhotos,
  photoPathFromUrl,
  removeUploaded,
  rpcFailureStatus,
  type RpcResult,
} from '../shared';

export const dynamic = 'force-dynamic';

/**
 * PATCH edits the Lodging (id or slug); DELETE archives it. Both go through
 * service_role-only RPCs that re-check ownership (against the verified
 * session user) and the Upcoming Booking rules — the client can only ask,
 * never decide.
 */

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Iniciá sesión para editar tu alojamiento.' }, { status: 401 });
    }

    const listingKey = /^[a-z0-9-]+$/i.test(id) ? id : 'no-match';
    const { data: listing, error: listErr } = await supabase
      .from('listings')
      .select('id, property:properties!inner (business_id)')
      .or(`id.eq.${listingKey},slug.eq.${listingKey}`)
      .maybeSingle();
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    if (!listing) {
      return NextResponse.json({ error: 'Alojamiento no encontrado.' }, { status: 404 });
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const prop = Array.isArray(listing.property) ? listing.property[0] : listing.property;
    if (!business || prop?.business_id !== business.id) {
      return NextResponse.json({ error: 'Este alojamiento no es tuyo.' }, { status: 403 });
    }

    const parsed = parseLodgingDraft(await request.json().catch(() => ({})));
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    // Photos being replaced are deleted from Storage after the write lands.
    const { data: oldPhotos } = await supabase
      .from('listing_photos')
      .select('url')
      .eq('listing_id', listing.id);
    const oldPaths = (oldPhotos ?? [])
      .map((p) => photoPathFromUrl(p.url))
      .filter((p): p is string => p !== null);

    const stored = await persistPhotos(parsed.photos, business.id, listing.id);
    if ('error' in stored) {
      return NextResponse.json({ error: stored.error }, { status: 400 });
    }

    const { data: result, error: rpcErr } = await createAdminClient().rpc('update_lodging', {
      p_user_id: user.id,
      p_listing_id: listing.id,
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
        { error: failure.message ?? 'No se pudo guardar.' },
        { status: rpcFailureStatus(failure.code) },
      );
    }

    const keepPaths = new Set(stored.urls.map((u) => photoPathFromUrl(u.url)).filter(Boolean));
    await removeUploaded(oldPaths.filter((p) => !keepPaths.has(p)));

    return NextResponse.json({ success: true, listing_id: listing.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Iniciá sesión para eliminar tu alojamiento.' }, { status: 401 });
    }

    const { data: result, error: rpcErr } = await createAdminClient().rpc('archive_lodging', {
      p_user_id: user.id,
      p_listing_id: id,
    });

    const typed = result as RpcResult | null;
    const failure = rpcErr
      ? { code: 'internal', message: rpcErr.message }
      : typed?.ok === false
        ? (typed.error ?? {})
        : null;
    if (failure) {
      return NextResponse.json(
        { error: failure.message ?? 'No se pudo eliminar.' },
        { status: rpcFailureStatus(failure.code) },
      );
    }

    return NextResponse.json({ success: true, listing_id: typed?.listing_id ?? id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
