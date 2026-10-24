import {
  KIND_LABEL,
  LODGINGS,
  ownerBySlug,
  ownerFiat,
  townByName,
  type ArtTone,
  type Lodging,
  type LodgingKind,
  type Owner,
} from '@/lib/lodgings';

/**
 * The catalog: one store for every surface that reads Lodgings (owner-views
 * §9). It merges the seed with Lodgings an Owner created in this browser —
 * the seed itself is never mutated — and persists the created ones in
 * `localStorage`, which is per browser on purpose (template scope).
 *
 * Client surfaces that need the created Lodgings after hydration subscribe
 * with `useLodgings`; non-React readers (Nomito's adapter) call `all()`.
 */

/** What the creation wizard collects; the catalog derives the rest. */
export interface LodgingDraft {
  name: string;
  kind: LodgingKind;
  /** Town name from TOWNS, in the Owner's country. */
  town: string;
  guests: number;
  bedrooms: number;
  baths: number;
  /** Per night, in the Owner's own fiat. */
  pricePerNight: number;
  blurb?: string;
  amenities?: string[];
  /** Street address, free text (no geocoder); public to every Traveler. */
  address: string;
  /** The pin the Owner dropped on the map. */
  lat: number;
  lng: number;
}

interface CatalogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'nomai.catalog.created';

function memoryStorage(): CatalogStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const TONES: ArtTone[] = ['terra', 'agua', 'sand', 'siete-colores'];

function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'alojamiento';
}

function buildLodging(owner: Owner, draft: LodgingDraft, taken: Set<string>): Lodging {
  const name = draft.name.trim();
  if (name.length < 3) throw new Error('name is required');
  if (!(draft.kind in KIND_LABEL)) throw new Error('unknown kind');
  const town = townByName(draft.town);
  if (!town || town.countryCode !== owner.countryCode) {
    throw new Error("town is not in the owner's country");
  }
  if (!Number.isInteger(draft.guests) || draft.guests < 1) {
    throw new Error('capacity must be at least 1');
  }
  if (draft.bedrooms < 0 || draft.baths < 1) throw new Error('rooms out of range');
  if (!Number.isFinite(draft.pricePerNight) || draft.pricePerNight <= 0) {
    throw new Error('price must be positive');
  }
  const address = draft.address?.trim() ?? '';
  if (!address) throw new Error('address is required');
  const onGlobe = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
  if (!onGlobe(draft.lat, 90) || !onGlobe(draft.lng, 180)) throw new Error('pin is required');

  const currency = ownerFiat(owner);

  const base = slugify(name);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;

  return {
    id,
    name,
    kind: draft.kind,
    city: town.name,
    region: town.region,
    countryCode: town.countryCode,
    code: town.code,
    pricePerNight: Math.round(draft.pricePerNight),
    currency,
    blurb: draft.blurb?.trim() ?? '',
    rating: 0,
    reviews: 0,
    guests: draft.guests,
    bedrooms: draft.bedrooms,
    baths: draft.baths,
    amenities: draft.amenities?.map((a) => a.trim()).filter(Boolean) ?? [],
    ownerSlug: owner.slug,
    tone: TONES[taken.size % TONES.length],
    address,
    lat: draft.lat,
    lng: draft.lng,
  };
}

export function createCatalog(storage?: CatalogStorage) {
  const store = storage ?? (typeof window === 'undefined' ? memoryStorage() : window.localStorage);
  let created: Lodging[] | null = null;
  let snapshot: Lodging[] = LODGINGS;
  const listeners = new Set<() => void>();

  function createdLodgings(): Lodging[] {
    if (created === null) {
      created = read();
      if (created.length > 0) snapshot = [...LODGINGS, ...created];
    }
    return created;
  }

  function read(): Lodging[] {
    try {
      const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(parsed) ? (parsed as Lodging[]) : [];
    } catch {
      return [];
    }
  }

  function all(): Lodging[] {
    createdLodgings();
    return snapshot;
  }

  function create(ownerSlug: string, draft: LodgingDraft): Lodging {
    const owner = ownerBySlug(ownerSlug);
    if (!owner) throw new Error(`unknown owner: ${ownerSlug}`);
    const lodging = buildLodging(owner, draft, new Set(all().map((l) => l.id)));
    const next = [...createdLodgings(), lodging];
    // Persist first: a storage failure rejects the write with the catalog intact.
    store.setItem(STORAGE_KEY, JSON.stringify(next));
    created = next;
    snapshot = [...LODGINGS, ...next];
    listeners.forEach((fn) => fn());
    return lodging;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    all,
    byId: (id: string) => all().find((l) => l.id === id),
    byOwner: (ownerSlug: string) => all().filter((l) => l.ownerSlug === ownerSlug),
    byTown: (town: string) => {
      const t = town.toLowerCase();
      return all().filter((l) => l.city.toLowerCase() === t);
    },
    create,
    subscribe,
  };
}

export const catalog = createCatalog();

/** The headline scenario: Casa de Adobe, Cafayate. */
export const CASA_DE_ADOBE = catalog.byId('casa-de-adobe')!;
