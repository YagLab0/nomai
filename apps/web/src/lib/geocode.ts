/**
 * The wizard's place search: free geocoding over OpenStreetMap's Nominatim,
 * always scoped to the Owner's country — a Lodging lives where its Owner's
 * Ripio account is (GLOSSARY). Any real place can be a Lodging's town; the
 * static TOWNS list only feeds seed data and siglas.
 *
 * The browser calls the public endpoint directly (no key needed for this
 * light use). Tests stub it with `page.route`, never the network.
 */

export interface Place {
  /** Short place name — what the Lodging stores as its town. */
  name: string;
  /** Province/state, when the geocoder reports one. */
  region?: string;
  /** ISO country code, uppercased (e.g. 'AR'). */
  countryCode: string;
  lat: number;
  lng: number;
}

interface NominatimAddress {
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country_code?: string;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/** The locality name a result represents — the finest inhabited place it names. */
export function placeName(r: NominatimResult): string {
  const a = r.address ?? {};
  return (
    a.village ?? a.town ?? a.city ?? a.municipality ?? a.county ?? a.state ?? r.display_name?.split(',')[0]?.trim() ?? ''
  );
}

/** One raw Nominatim row → a Place, or null when it can't name a point in the country. */
export function parsePlace(r: NominatimResult, countryCode: string): Place | null {
  const name = placeName(r);
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  const cc = r.address?.country_code?.toUpperCase();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || cc !== countryCode) return null;
  return { name, region: r.address?.state, countryCode: cc, lat, lng };
}

/**
 * Places matching `query` inside `countryCode`. Needs ~3+ characters to mean
 * anything; callers debounce and pass an AbortSignal so a stale search can't
 * overwrite a newer one.
 */
export async function searchPlaces(
  query: string,
  countryCode: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const url =
    `${ENDPOINT}?format=jsonv2&addressdetails=1&limit=6&accept-language=es` +
    `&countrycodes=${encodeURIComponent(countryCode.toLowerCase())}` +
    `&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  const rows = (await res.json()) as NominatimResult[];
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const row of rows) {
    const p = parsePlace(row, countryCode);
    if (!p) continue;
    const key = `${p.name}|${p.region ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      places.push(p);
    }
  }
  return places;
}
