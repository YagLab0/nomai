// Owner write surface — moved out of apps/web so the secret key lives only
// here (the web /api/owners/* routes are now thin proxies that forward the
// session's access token as Bearer). Auth: the verified Bearer user id IS
// the Owner — businesses.user_id = auth.users.id — so no caller-supplied id
// is ever trusted.
//
// The admin client is used only where the old web routes used it: the
// service_role-only lodging RPCs (create/update/archive/set_status), the
// listing-photos Storage writes, and the onboard `claim` demo lever. Reads
// and the user-session inserts onboarding relies on go through a client
// scoped to the caller's JWT so RLS still applies.

import { Hono } from "hono";
import type { Context } from "hono";
import { createSupabaseUser } from "./supabase.js";
import { bearerToken, supabaseAdmin, travelerIdFrom } from "./auth.js";
import type { Database } from "./database.types.js";

type PropertyType = Database["public"]["Enums"]["property_type"];

/** Web LodgingKind → enum property_type (same map as owners/onboard). */
const PROPERTY_TYPE_MAP: Record<string, PropertyType> = {
  posada: "posada",
  cabana: "cabana",
  departamento: "apartamento",
  casa: "casa",
  hostal: "hostel",
  "hotel-boutique": "hotel",
};

/**
 * The Lodging's country decides what the Owner charges in (ownerFiat).
 * Every code must exist in public.currencies — listings.currency is an FK
 * and the RPCs reject unknown codes.
 */
const COUNTRY_FIAT: Record<string, string> = {
  AR: "ARS",
  BR: "BRL",
  CL: "CLP",
  CO: "COP",
  MX: "MXN",
  PE: "PEN",
  UY: "UYU",
};

const COUNTRY_TIMEZONE: Record<string, string> = {
  AR: "America/Argentina/Buenos_Aires",
  BR: "America/Sao_Paulo",
  CL: "America/Santiago",
  CO: "America/Bogota",
  MX: "America/Mexico_City",
  PE: "America/Lima",
  UY: "America/Montevideo",
};

const PHOTOS_BUCKET = "listing-photos";
const MAX_PHOTOS = 5;
const MINOR_UNIT = 1_000_000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "alojamiento"
  );
}

interface ParsedLodging {
  name: string;
  propertyType: PropertyType;
  city: string;
  region: string;
  countryCode: string;
  timezone: string;
  currency: string;
  address: string;
  lat: number;
  lng: number;
  guests: number;
  bedrooms: number;
  baths: number;
  basePriceMinor: number;
  blurb: string;
  amenities: string[];
  photos: string[];
}

interface LodgingDraftBody {
  name?: string;
  kind?: string;
  place?: { name?: string; region?: string; countryCode?: string };
  address?: string;
  lat?: number;
  lng?: number;
  guests?: number;
  bedrooms?: number;
  baths?: number;
  pricePerNight?: number;
  blurb?: string;
  amenities?: string[];
  photos?: string[];
}

/**
 * Same rules as lib/catalog.ts `validate`, server-side: the draft is a
 * LodgingDraft minus derived fields — town is whatever place the geocoder
 * returned, always inside a Ripio country (the Owner's, by product rule).
 */
function parseLodgingDraft(body: unknown): ParsedLodging | { error: string } {
  const d = (body ?? {}) as LodgingDraftBody;
  const name = String(d.name ?? "").trim();
  if (name.length < 3) return { error: "El nombre debe tener al menos 3 caracteres." };
  const kind = String(d.kind ?? "");
  if (!(kind in PROPERTY_TYPE_MAP)) return { error: "Tipo de alojamiento desconocido." };
  const place = d.place;
  const city = String(place?.name ?? "").trim();
  if (!city) return { error: "Buscá y elegí el lugar donde está." };
  const countryCode = String(place?.countryCode ?? "").toUpperCase();
  if (!COUNTRY_FIAT[countryCode]) return { error: "El lugar debe estar en un país con cobro Ripio." };
  const address = String(d.address ?? "").trim();
  if (!address) return { error: "Escribí la dirección, con calle y número." };
  const onGlobe = (n: unknown, max: number) =>
    typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max;
  if (!onGlobe(d.lat, 90) || !onGlobe(d.lng, 180)) {
    return { error: "Marcá el alojamiento en el mapa." };
  }
  if (!Number.isInteger(d.guests) || (d.guests as number) < 1) {
    return { error: "La capacidad debe ser al menos 1." };
  }
  if ((d.bedrooms ?? -1) < 0 || (d.baths ?? 0) < 1) return { error: "Dormitorios o baños fuera de rango." };
  if (!Number.isFinite(d.pricePerNight) || (d.pricePerNight as number) <= 0) {
    return { error: "El precio debe ser mayor a cero." };
  }
  const photos = Array.isArray(d.photos) ? d.photos : [];
  if (photos.length > MAX_PHOTOS || photos.some((p) => typeof p !== "string" || !p)) {
    return { error: `Hasta ${MAX_PHOTOS} fotos.` };
  }

  return {
    name,
    propertyType: PROPERTY_TYPE_MAP[kind] ?? "otro",
    city,
    region: String(place?.region ?? "").trim(),
    countryCode,
    timezone: COUNTRY_TIMEZONE[countryCode],
    currency: COUNTRY_FIAT[countryCode],
    address,
    lat: d.lat as number,
    lng: d.lng as number,
    guests: d.guests as number,
    bedrooms: d.bedrooms as number,
    baths: d.baths as number,
    basePriceMinor: Math.round((d.pricePerNight as number) * MINOR_UNIT),
    blurb: String(d.blurb ?? "").trim(),
    amenities: (d.amenities ?? []).map((a) => String(a).trim()).filter(Boolean),
    photos,
  };
}

const DATA_URL = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

function publicPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${PHOTOS_BUCKET}/${path}`;
}

/** The storage path a public photo URL points at; null for foreign URLs. */
function photoPathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${PHOTOS_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

/**
 * Turns the draft's photo list into public Storage URLs: data URLs are
 * uploaded under `<businessId>/<listingId>/` with the secret key (the route
 * already checked ownership); URLs already hosted pass through unchanged.
 * Returns the ordered urls plus the uploaded object paths for cleanup.
 */
async function persistPhotos(
  photos: string[],
  businessId: string,
  listingId: string
): Promise<{ urls: { url: string }[]; uploadedPaths: string[] } | { error: string }> {
  const admin = supabaseAdmin();
  const supabaseUrl = process.env.SUPABASE_URL;
  const urls: { url: string }[] = [];
  const uploadedPaths: string[] = [];

  for (const [i, src] of photos.entries()) {
    const dataUrl = DATA_URL.exec(src);
    if (dataUrl) {
      const buffer = Buffer.from(dataUrl[2], "base64");
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_PHOTO_BYTES) {
        return { error: `La foto ${i + 1} está vacía o pesa demasiado.` };
      }
      const path = `${businessId}/${listingId}/${i}-${crypto.randomUUID().slice(0, 8)}.jpg`;
      const { error } = await admin.storage
        .from(PHOTOS_BUCKET)
        .upload(path, buffer, { contentType: dataUrl[1], upsert: true });
      if (error) {
        await admin.storage.from(PHOTOS_BUCKET).remove(uploadedPaths);
        return { error: `No se pudo subir la foto ${i + 1}: ${error.message}` };
      }
      uploadedPaths.push(path);
      urls.push({ url: publicPhotoUrl(supabaseUrl!, path) });
    } else if (/^https?:\/\//.test(src)) {
      urls.push({ url: src });
    } else {
      return { error: `La foto ${i + 1} no es una imagen válida.` };
    }
  }
  return { urls, uploadedPaths };
}

/** Deletes uploaded objects after a failed write; best-effort cleanup. */
async function removeUploaded(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabaseAdmin()
    .storage.from(PHOTOS_BUCKET)
    .remove(paths)
    .catch(() => {});
}

/** The {ok, error:{code,message}} contract the lodging RPCs return. */
interface RpcResult {
  ok?: boolean;
  listing_id?: string;
  property_id?: string;
  slug?: string;
  error?: { code?: string; message?: string };
}

/** Maps an RPC {ok:false, error:{code}} failure to an HTTP status. */
function rpcFailureStatus(code: string | undefined): 400 | 403 | 404 | 409 {
  switch (code) {
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "has_upcoming_bookings":
      return 409;
    default:
      return 400;
  }
}

/** A verified Owner's JWT-scoped client, or the 401 Response to return. */
async function ownerClient(c: Context, error: string) {
  const token = bearerToken(c);
  const userId = token ? await travelerIdFrom(c) : null;
  if (!token || !userId) return { response: c.json({ error }, 401) } as const;
  return { token, userId, supabase: createSupabaseUser(token) } as const;
}

const owners = new Hono();

/**
 * POST /owners/lodgings — publishes a Lodging: property + listing + photos +
 * amenities + availability_nights in a single RPC transaction. The Owner is
 * always resolved through businesses.user_id = the verified user id; the
 * client never sends a business id.
 */
owners.post("/lodgings", async (c) => {
  try {
    const who = await ownerClient(c, "Iniciá sesión para publicar un alojamiento.");
    if ("response" in who) return who.response;
    const { userId, supabase } = who;

    const { data: business, error: busErr } = await supabase
      .from("businesses")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (busErr) return c.json({ error: busErr.message }, 500);
    if (!business) {
      return c.json({ error: "Primero registrá tu negocio en /owners/join." }, 403);
    }

    const parsed = parseLodgingDraft(await c.req.json().catch(() => ({})));
    if ("error" in parsed) {
      return c.json({ error: parsed.error }, 400);
    }

    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const listingId = `lst_${suffix}`;
    const propertyId = `prp_${suffix}`;
    const slug = `${slugify(parsed.name)}-${suffix}`;

    const stored = await persistPhotos(parsed.photos, business.id, listingId);
    if ("error" in stored) {
      return c.json({ error: stored.error }, 400);
    }

    // service_role-only RPC (same lockdown as the booking RPCs): the token
    // was verified above, so the Owner is identified by that user's id.
    const { data: result, error: rpcErr } = await supabaseAdmin().rpc("create_lodging", {
      p_user_id: userId,
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
      ? { code: "internal", message: rpcErr.message }
      : typed?.ok === false
        ? (typed.error ?? {})
        : null;
    if (failure) {
      await removeUploaded(stored.uploadedPaths);
      return c.json(
        { error: failure.message ?? "No se pudo publicar." },
        rpcFailureStatus(failure.code)
      );
    }

    return c.json({ success: true, ...typed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return c.json({ error: message }, 500);
  }
});

/**
 * PATCH /owners/lodgings/:id — edits the Lodging (id or slug). Goes through
 * the service_role-only update_lodging RPC, which re-checks ownership
 * (against the verified user) and the Upcoming Booking rules — the client
 * can only ask, never decide.
 */
owners.patch("/lodgings/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const who = await ownerClient(c, "Iniciá sesión para editar tu alojamiento.");
    if ("response" in who) return who.response;
    const { userId, supabase } = who;

    const listingKey = /^[a-z0-9-]+$/i.test(id) ? id : "no-match";
    const { data: listing, error: listErr } = await supabase
      .from("listings")
      .select("id, property:properties!inner (business_id)")
      .or(`id.eq.${listingKey},slug.eq.${listingKey}`)
      .maybeSingle();
    if (listErr) return c.json({ error: listErr.message }, 500);
    if (!listing) {
      return c.json({ error: "Alojamiento no encontrado." }, 404);
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const prop = Array.isArray(listing.property) ? listing.property[0] : listing.property;
    if (!business || prop?.business_id !== business.id) {
      return c.json({ error: "Este alojamiento no es tuyo." }, 403);
    }

    const parsed = parseLodgingDraft(await c.req.json().catch(() => ({})));
    if ("error" in parsed) {
      return c.json({ error: parsed.error }, 400);
    }

    // Photos being replaced are deleted from Storage after the write lands.
    const { data: oldPhotos } = await supabase
      .from("listing_photos")
      .select("url")
      .eq("listing_id", listing.id);
    const oldPaths = (oldPhotos ?? [])
      .map((p) => photoPathFromUrl(p.url))
      .filter((p): p is string => p !== null);

    const stored = await persistPhotos(parsed.photos, business.id, listing.id);
    if ("error" in stored) {
      return c.json({ error: stored.error }, 400);
    }

    const { data: result, error: rpcErr } = await supabaseAdmin().rpc("update_lodging", {
      p_user_id: userId,
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
      ? { code: "internal", message: rpcErr.message }
      : typed?.ok === false
        ? (typed.error ?? {})
        : null;
    if (failure) {
      await removeUploaded(stored.uploadedPaths);
      return c.json(
        { error: failure.message ?? "No se pudo guardar." },
        rpcFailureStatus(failure.code)
      );
    }

    const keepPaths = new Set(stored.urls.map((u) => photoPathFromUrl(u.url)).filter(Boolean));
    await removeUploaded(oldPaths.filter((p) => !keepPaths.has(p)));

    return c.json({ success: true, listing_id: listing.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return c.json({ error: message }, 500);
  }
});

/**
 * DELETE /owners/lodgings/:id — archives the Lodging through the
 * service_role-only archive_lodging RPC (ownership + Upcoming Booking
 * rules re-checked inside).
 */
owners.delete("/lodgings/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const who = await ownerClient(c, "Iniciá sesión para eliminar tu alojamiento.");
    if ("response" in who) return who.response;
    const { userId } = who;

    const { data: result, error: rpcErr } = await supabaseAdmin().rpc("archive_lodging", {
      p_user_id: userId,
      p_listing_id: id,
    });

    const typed = result as RpcResult | null;
    const failure = rpcErr
      ? { code: "internal", message: rpcErr.message }
      : typed?.ok === false
        ? (typed.error ?? {})
        : null;
    if (failure) {
      return c.json(
        { error: failure.message ?? "No se pudo eliminar." },
        rpcFailureStatus(failure.code)
      );
    }

    return c.json({ success: true, listing_id: typed?.listing_id ?? id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return c.json({ error: message }, 500);
  }
});

/**
 * PATCH /owners/lodgings/:id/status — flips the Lodging between 'published'
 * and 'paused' (id or slug) through the service_role-only set_lodging_status
 * RPC, which re-checks ownership, refuses every other status, and keeps
 * 'archived' a one-way door. Pausing is allowed with Upcoming Bookings.
 */
owners.patch("/lodgings/:id/status", async (c) => {
  try {
    const id = c.req.param("id");
    const who = await ownerClient(c, "Iniciá sesión para cambiar el estado.");
    if ("response" in who) return who.response;
    const { userId } = who;

    const body = (await c.req.json().catch(() => null)) as { status?: string } | null;
    const status = body?.status;
    if (status !== "published" && status !== "paused") {
      return c.json({ error: 'El estado debe ser "published" o "paused".' }, 400);
    }

    const { data: result, error: rpcErr } = await supabaseAdmin().rpc("set_lodging_status", {
      p_user_id: userId,
      p_listing_id: id,
      p_status: status,
    });

    const typed = result as RpcResult | null;
    const failure = rpcErr
      ? { code: "internal", message: rpcErr.message }
      : typed?.ok === false
        ? (typed.error ?? {})
        : null;
    if (failure) {
      return c.json(
        { error: failure.message ?? "No se pudo cambiar el estado." },
        rpcFailureStatus(failure.code)
      );
    }

    return c.json({ success: true, listing_id: typed?.listing_id ?? id, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /owners/onboard — the Owner onboarding actions. `claim` (attach an
 * unclaimed seeded business + demo bookings) is a deliberate demo lever run
 * on the admin client; `update-payout` and the create path (business +
 * property + draft listing) run on the caller's JWT so RLS applies, exactly
 * like the old web route's user-session writes.
 */
owners.post("/onboard", async (c) => {
  try {
    const who = await ownerClient(
      c,
      "Iniciá sesión para continuar con el registro de dueño."
    );
    if ("response" in who) return who.response;
    const { userId, supabase } = who;

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action || (body.slug ? "claim" : "create");

    // -----------------------------------------------------------------------
    // 1. Claim an existing business (e.g. seeded Ramon Guaymas).
    //
    // DEMO LEVER (decisions D7), kept knowingly: any authenticated user can
    // attach themselves to ANY business whose user_id is null — there is no
    // proof-of-ownership step. That is what lets the Owner wizard run
    // end-to-end against seeded, unclaimed businesses, but it is not a
    // production claim flow: a real one would verify the Owner controls the
    // business (invite, e-mail domain, ops review) before setting user_id.
    // -----------------------------------------------------------------------
    if (action === "claim") {
      const slug = (body.slug as string) || "ramon-guaymas";
      const admin = supabaseAdmin();

      const { data: bus, error: busErr } = await admin
        .from("businesses")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (busErr || !bus) {
        return c.json({ error: `No se encontró el negocio con slug "${slug}".` }, 404);
      }

      if (bus.user_id && bus.user_id !== userId) {
        return c.json({ error: "Este negocio ya está vinculado a otra cuenta." }, 403);
      }

      const { data: updated, error: updateErr } = await admin
        .from("businesses")
        .update({ user_id: userId })
        .eq("id", bus.id)
        .select()
        .single();

      if (updateErr) {
        return c.json({ error: updateErr.message }, 500);
      }

      // Seed sample bookings for Ramon if claiming Ramon and none exist yet
      if (slug === "ramon-guaymas") {
        const { data: existingBookings } = await admin
          .from("bookings")
          .select("id")
          .eq("listing_id", "lst_casa_de_adobe")
          .limit(1);

        if (!existingBookings || existingBookings.length === 0) {
          await admin.from("bookings").insert([
            {
              id: `bkg_lucas_${crypto.randomUUID().slice(0, 8)}`,
              listing_id: "lst_casa_de_adobe",
              checkin: "2026-11-20",
              checkout: "2026-11-23",
              guests: 2,
              total_minor: 285_000_000_000,
              currency: "ARS",
              status: "confirmed",
              guest_ref: "Lucas (Florianópolis, Brasil)",
            },
            {
              id: `bkg_martina_${crypto.randomUUID().slice(0, 8)}`,
              listing_id: "lst_cabana_vinas_del_sol",
              checkin: "2026-11-03",
              checkout: "2026-11-07",
              guests: 4,
              total_minor: 480_000_000_000,
              currency: "ARS",
              status: "confirmed",
              guest_ref: "Martina (Montevideo, Uruguay)",
            },
          ]);
        }
      }

      return c.json({ success: true, business: updated });
    }

    // -----------------------------------------------------------------------
    // 2. Update payout address (owner only)
    // -----------------------------------------------------------------------
    if (action === "update-payout") {
      const payoutAddress = (body.payoutAddress as string | undefined)?.trim();
      if (!payoutAddress || !/^0x[a-fA-F0-9]{40}$/.test(payoutAddress)) {
        return c.json(
          { error: "Dirección de cobro de Ripio inválida (formato 0x...)." },
          400
        );
      }

      const { data: updated, error: updateErr } = await supabase
        .from("businesses")
        .update({ payout_address: payoutAddress })
        .eq("user_id", userId)
        .select()
        .single();

      if (updateErr) {
        return c.json({ error: updateErr.message }, 500);
      }

      return c.json({ success: true, business: updated });
    }

    // -----------------------------------------------------------------------
    // 3. Create a new business + property + draft listing (user session, RLS)
    // -----------------------------------------------------------------------
    const name = String(body.name || "").trim();
    const town = String(body.town || "").trim();
    const kindInput = String(body.kind || "posada");
    const capacity = Number(body.capacity) || 2;
    const payoutAddress = (body.payoutAddress as string | undefined) || null;

    if (name.length < 3) {
      return c.json(
        { error: "El nombre del alojamiento debe tener al menos 3 caracteres." },
        400
      );
    }
    if (!town) {
      return c.json({ error: "Debes seleccionar un pueblo o ciudad." }, 400);
    }

    // Check if user already has a business
    const { data: existingBus } = await supabase
      .from("businesses")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingBus) {
      return c.json({ success: true, business: existingBus });
    }

    const baseSlug = slugify(name);
    const suffix = crypto.randomUUID().slice(0, 6);
    const busId = `bus_${suffix}`;
    const prpId = `prp_${suffix}`;
    const lstId = `lst_${suffix}`;
    const busSlug = `${baseSlug}-${suffix}`;
    const propType: PropertyType = PROPERTY_TYPE_MAP[kindInput] || "posada";

    // Insert new business (RLS checks auth.uid() = user_id)
    const { data: newBus, error: busInsertErr } = await supabase
      .from("businesses")
      .insert({
        id: busId,
        name,
        slug: busSlug,
        user_id: userId,
        status: "pending",
        payout_address: payoutAddress,
      })
      .select()
      .single();

    if (busInsertErr) {
      return c.json({ error: `Error creando negocio: ${busInsertErr.message}` }, 500);
    }

    // Insert property
    const { data: newProp, error: propInsertErr } = await supabase
      .from("properties")
      .insert({
        id: prpId,
        business_id: busId,
        name,
        city: town,
        country_code: "AR",
        property_type: propType,
        checkin_time: "14:00",
        checkout_time: "11:00",
        timezone: "America/Argentina/Buenos_Aires",
      })
      .select()
      .single();

    if (propInsertErr) {
      return c.json({ error: `Error creando propiedad: ${propInsertErr.message}` }, 500);
    }

    // Insert draft listing
    const { data: newListing, error: lstInsertErr } = await supabase
      .from("listings")
      .insert({
        id: lstId,
        property_id: prpId,
        title: name,
        slug: busSlug,
        kind: "entire_place",
        status: "draft",
        max_guests: capacity,
        min_nights: 1,
        currency: "ARS",
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
      return c.json({ error: `Error creando publicación: ${lstInsertErr.message}` }, 500);
    }

    return c.json({
      success: true,
      business: newBus,
      property: newProp,
      listing: newListing,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado";
    return c.json({ error: message }, 500);
  }
});

export default owners;
