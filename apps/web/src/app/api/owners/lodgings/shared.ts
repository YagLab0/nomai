import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_PHOTOS, type LodgingDraft } from '@/lib/catalog';
import { KIND_LABEL } from '@/lib/lodgings';
import type { Database } from '@/lib/supabase/database.types';

type PropertyType = Database['public']['Enums']['property_type'];

/** Web LodgingKind → enum property_type (same map as owners/onboard). */
export const PROPERTY_TYPE_MAP: Record<string, PropertyType> = {
  posada: 'posada',
  cabana: 'cabana',
  departamento: 'apartamento',
  casa: 'casa',
  hostal: 'hostel',
  'hotel-boutique': 'hotel',
};

/**
 * The Lodging's country decides what the Owner charges in (ownerFiat).
 * Every code must exist in public.currencies — listings.currency is an FK
 * and the RPCs reject unknown codes.
 */
export const COUNTRY_FIAT: Record<string, string> = {
  AR: 'ARS',
  BR: 'BRL',
  CL: 'CLP',
  CO: 'COP',
  MX: 'MXN',
  PE: 'PEN',
  UY: 'UYU',
};

export const COUNTRY_TIMEZONE: Record<string, string> = {
  AR: 'America/Argentina/Buenos_Aires',
  BR: 'America/Sao_Paulo',
  CL: 'America/Santiago',
  CO: 'America/Bogota',
  MX: 'America/Mexico_City',
  PE: 'America/Lima',
  UY: 'America/Montevideo',
};

export const PHOTOS_BUCKET = 'listing-photos';
const MINOR_UNIT = 1_000_000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'alojamiento'
  );
}

export interface ParsedLodging {
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

/**
 * Same rules as lib/catalog.ts `validate`, server-side: the draft is a
 * LodgingDraft minus derived fields — town is whatever place the geocoder
 * returned, always inside a Ripio country (the Owner's, by product rule).
 */
export function parseLodgingDraft(body: unknown): ParsedLodging | { error: string } {
  const d = (body ?? {}) as Partial<LodgingDraft>;
  const name = String(d.name ?? '').trim();
  if (name.length < 3) return { error: 'El nombre debe tener al menos 3 caracteres.' };
  const kind = String(d.kind ?? '');
  if (!(kind in KIND_LABEL)) return { error: 'Tipo de alojamiento desconocido.' };
  const place = d.place;
  const city = String(place?.name ?? '').trim();
  if (!city) return { error: 'Buscá y elegí el lugar donde está.' };
  const countryCode = String(place?.countryCode ?? '').toUpperCase();
  if (!COUNTRY_FIAT[countryCode]) return { error: 'El lugar debe estar en un país con cobro Ripio.' };
  const address = String(d.address ?? '').trim();
  if (!address) return { error: 'Escribí la dirección, con calle y número.' };
  const onGlobe = (n: unknown, max: number) =>
    typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
  if (!onGlobe(d.lat, 90) || !onGlobe(d.lng, 180)) {
    return { error: 'Marcá el alojamiento en el mapa.' };
  }
  if (!Number.isInteger(d.guests) || (d.guests as number) < 1) {
    return { error: 'La capacidad debe ser al menos 1.' };
  }
  if ((d.bedrooms ?? -1) < 0 || (d.baths ?? 0) < 1) return { error: 'Dormitorios o baños fuera de rango.' };
  if (!Number.isFinite(d.pricePerNight) || (d.pricePerNight as number) <= 0) {
    return { error: 'El precio debe ser mayor a cero.' };
  }
  const photos = Array.isArray(d.photos) ? d.photos : [];
  if (photos.length > MAX_PHOTOS || photos.some((p) => typeof p !== 'string' || !p)) {
    return { error: `Hasta ${MAX_PHOTOS} fotos.` };
  }

  return {
    name,
    propertyType: PROPERTY_TYPE_MAP[kind] ?? 'otro',
    city,
    region: String(place?.region ?? '').trim(),
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
    blurb: String(d.blurb ?? '').trim(),
    amenities: (d.amenities ?? []).map((a) => String(a).trim()).filter(Boolean),
    photos: photos as string[],
  };
}

const DATA_URL = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

function publicPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${PHOTOS_BUCKET}/${path}`;
}

/** The storage path a public photo URL points at; null for foreign URLs. */
export function photoPathFromUrl(url: string): string | null {
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
export async function persistPhotos(
  photos: string[],
  businessId: string,
  listingId: string,
): Promise<{ urls: { url: string }[]; uploadedPaths: string[] } | { error: string }> {
  const admin = createAdminClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const urls: { url: string }[] = [];
  const uploadedPaths: string[] = [];

  for (const [i, src] of photos.entries()) {
    const dataUrl = DATA_URL.exec(src);
    if (dataUrl) {
      const buffer = Buffer.from(dataUrl[2], 'base64');
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
export async function removeUploaded(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await createAdminClient()
    .storage.from(PHOTOS_BUCKET)
    .remove(paths)
    .catch(() => {});
}

/** The {ok, error:{code,message}} contract the lodging RPCs return. */
export interface RpcResult {
  ok?: boolean;
  listing_id?: string;
  property_id?: string;
  slug?: string;
  error?: { code?: string; message?: string };
}

/** Maps an RPC {ok:false, error:{code}} failure to an HTTP status. */
export function rpcFailureStatus(code: string | undefined): number {
  switch (code) {
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'has_upcoming_bookings':
      return 409;
    default:
      return 400;
  }
}
