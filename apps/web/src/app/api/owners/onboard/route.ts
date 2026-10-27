import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';

type PropertyType = Database['public']['Enums']['property_type'];

const PROPERTY_TYPE_MAP: Record<string, PropertyType> = {
  posada: 'posada',
  cabana: 'cabana',
  departamento: 'apartamento',
  casa: 'casa',
  hostal: 'hostel',
  'hotel-boutique': 'hotel',
};

function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'alojamiento'
  );
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ business: null }, { status: 401 });
    }

    const { data: business, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ business });
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
      return NextResponse.json(
        { error: 'Iniciá sesión para continuar con el registro de dueño.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || (body.slug ? 'claim' : 'create');

    // -------------------------------------------------------------------------
    // 1. Claim an existing business (e.g. seeded Ramon Guaymas).
    //
    // DEMO LEVER (decisions D7), kept knowingly: any authenticated user can
    // attach themselves to ANY business whose user_id is null — there is no
    // proof-of-ownership step. That is what lets the Owner wizard run
    // end-to-end against seeded, unclaimed businesses, but it is not a
    // production claim flow: a real one would verify the Owner controls the
    // business (invite, e-mail domain, ops review) before setting user_id.
    // -------------------------------------------------------------------------
    if (action === 'claim') {
      const slug = body.slug || 'ramon-guaymas';
      const admin = createAdminClient();

      const { data: bus, error: busErr } = await admin
        .from('businesses')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (busErr || !bus) {
        return NextResponse.json(
          { error: `No se encontró el negocio con slug "${slug}".` },
          { status: 404 }
        );
      }

      if (bus.user_id && bus.user_id !== user.id) {
        return NextResponse.json(
          { error: 'Este negocio ya está vinculado a otra cuenta.' },
          { status: 403 }
        );
      }

      const { data: updated, error: updateErr } = await admin
        .from('businesses')
        .update({ user_id: user.id })
        .eq('id', bus.id)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      // Seed sample bookings for Ramon if claiming Ramon and none exist yet
      if (slug === 'ramon-guaymas') {
        const { data: existingBookings } = await admin
          .from('bookings')
          .select('id')
          .eq('listing_id', 'lst_casa_de_adobe')
          .limit(1);

        if (!existingBookings || existingBookings.length === 0) {
          await admin.from('bookings').insert([
            {
              id: `bkg_lucas_${crypto.randomUUID().slice(0, 8)}`,
              listing_id: 'lst_casa_de_adobe',
              checkin: '2026-11-20',
              checkout: '2026-11-23',
              guests: 2,
              total_minor: 285_000_000_000,
              currency: 'ARS',
              status: 'confirmed',
              guest_ref: 'Lucas (Florianópolis, Brasil)',
            },
            {
              id: `bkg_martina_${crypto.randomUUID().slice(0, 8)}`,
              listing_id: 'lst_cabana_vinas_del_sol',
              checkin: '2026-11-03',
              checkout: '2026-11-07',
              guests: 4,
              total_minor: 480_000_000_000,
              currency: 'ARS',
              status: 'confirmed',
              guest_ref: 'Martina (Montevideo, Uruguay)',
            },
          ]);
        }
      }

      return NextResponse.json({ success: true, business: updated });
    }

    // -------------------------------------------------------------------------
    // 2. Update payout address (owner only)
    // -------------------------------------------------------------------------
    if (action === 'update-payout') {
      const payoutAddress = body.payoutAddress?.trim();
      if (!payoutAddress || !/^0x[a-fA-F0-9]{40}$/.test(payoutAddress)) {
        return NextResponse.json(
          { error: 'Dirección de cobro de Ripio inválida (formato 0x...).' },
          { status: 400 }
        );
      }

      const { data: updated, error: updateErr } = await supabase
        .from('businesses')
        .update({ payout_address: payoutAddress })
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, business: updated });
    }

    // -------------------------------------------------------------------------
    // 3. Create a new business + property + draft listing
    // -------------------------------------------------------------------------
    const name = String(body.name || '').trim();
    const town = String(body.town || '').trim();
    const kindInput = String(body.kind || 'posada');
    const capacity = Number(body.capacity) || 2;
    const payoutAddress = body.payoutAddress || null;

    if (name.length < 3) {
      return NextResponse.json(
        { error: 'El nombre del alojamiento debe tener al menos 3 caracteres.' },
        { status: 400 }
      );
    }
    if (!town) {
      return NextResponse.json(
        { error: 'Debes seleccionar un pueblo o ciudad.' },
        { status: 400 }
      );
    }

    // Check if user already has a business
    const { data: existingBus } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingBus) {
      return NextResponse.json({ success: true, business: existingBus });
    }

    const baseSlug = slugify(name);
    const suffix = crypto.randomUUID().slice(0, 6);
    const busId = `bus_${suffix}`;
    const prpId = `prp_${suffix}`;
    const lstId = `lst_${suffix}`;
    const busSlug = `${baseSlug}-${suffix}`;
    const propType: PropertyType = PROPERTY_TYPE_MAP[kindInput] || 'posada';

    // Insert new business (RLS checks auth.uid() = user_id)
    const { data: newBus, error: busInsertErr } = await supabase
      .from('businesses')
      .insert({
        id: busId,
        name,
        slug: busSlug,
        user_id: user.id,
        status: 'pending',
        payout_address: payoutAddress,
      })
      .select()
      .single();

    if (busInsertErr) {
      return NextResponse.json(
        { error: `Error creando negocio: ${busInsertErr.message}` },
        { status: 500 }
      );
    }

    // Insert property
    const { data: newProp, error: propInsertErr } = await supabase
      .from('properties')
      .insert({
        id: prpId,
        business_id: busId,
        name,
        city: town,
        country_code: 'AR',
        property_type: propType,
        checkin_time: '14:00',
        checkout_time: '11:00',
        timezone: 'America/Argentina/Buenos_Aires',
      })
      .select()
      .single();

    if (propInsertErr) {
      return NextResponse.json(
        { error: `Error creando propiedad: ${propInsertErr.message}` },
        { status: 500 }
      );
    }

    // Insert draft listing
    const { data: newListing, error: lstInsertErr } = await supabase
      .from('listings')
      .insert({
        id: lstId,
        property_id: prpId,
        title: name,
        slug: busSlug,
        kind: 'entire_place',
        status: 'draft',
        max_guests: capacity,
        min_nights: 1,
        currency: 'ARS',
        base_price_minor: 50_000_000_000,
        cleaning_fee_minor: 0,
        events_allowed: false,
        pets_allowed: false,
        smoking_allowed: false,
        instant_book: false,
      })
      .select()
      .single();

    if (lstInsertErr) {
      return NextResponse.json(
        { error: `Error creando publicación: ${lstInsertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      business: newBus,
      property: newProp,
      listing: newListing,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
