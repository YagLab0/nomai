import {
  KIND_LABEL,
  LODGINGS,
  nearestTown,
  ownerBySlug,
  ownerFiat,
  townByName,
  townsInCountry,
  type ArtTone,
  type Lodging,
  type LodgingKind,
  type Owner,
  type Town,
} from '@/lib/lodgings';
import { nightsOf } from '@/lib/dates';
import { ownerBookings, type OwnerBooking } from '@/lib/mock/owner';

/**
 * The catalog: one store for every surface that reads Lodgings (owner-views
 * §9). It merges the seed with Lodgings an Owner created in this browser plus
 * edits (overrides) and deletions (tombstones) of seeded ones — the seed
 * itself is never mutated — and persists them in `localStorage`, which is per
 * browser on purpose (template scope).
 *
 * Client surfaces that need the browser's changes after hydration subscribe
 * with `useLodgings`; non-React readers (Nomito's adapter) call `all()`.
 */

/** What the wizard collects; the catalog derives the rest. */
export interface LodgingDraft {
  name: string;
  kind: LodgingKind;
  /**
   * Where the Lodging sits: the place the Owner found with the geocoder, in
   * their own country. Any real place can be the town — when it coincides
   * with a listed Town the catalog backfills its data (sigla included).
   */
  place: {
    name: string;
    region?: string;
    countryCode: string;
    /** The searched place's center; resolves a listed Town by proximity. */
    lat?: number;
    lng?: number;
  };
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
  /** Up to MAX_PHOTOS image sources (data URLs), ordered; the first is the cover. */
  photos?: string[];
}

export const MAX_PHOTOS = 5;

/** The browser storage has no room left for this write; nothing was saved. */
export class CatalogFullError extends Error {
  constructor() {
    super('catalog storage is full');
    this.name = 'CatalogFullError';
  }
}

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)
  );
}

interface CatalogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What the rules and the Availability need from a Booking. */
type BookingRef = Pick<OwnerBooking, 'lodgingId' | 'status' | 'checkIn' | 'checkOut'>;

/** Upcoming Booking statuses (GLOSSARY): they block removing and relocating. */
const UPCOMING: readonly OwnerBooking['status'][] = ['confirmada', 'en-curso'];

interface State {
  created: Lodging[];
  overrides: Record<string, Lodging>;
  removed: string[];
}

const STORAGE_KEY = 'nomai.catalog';
/** Before edits existed the catalog stored only the created Lodgings here. */
const LEGACY_KEY = 'nomai.catalog.created';

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

/** Roughly 15 km: searched places this close to a listed Town are that Town. */
const SAME_PLACE_DEG = 0.15;

/**
 * The listed Town a searched place actually is, when they coincide: same name,
 * or its center sits within ~15 km of one in the Owner's country.
 */
function listedTown(p: LodgingDraft['place'], owner: Owner): Town | null {
  const byName = townByName(p.name);
  if (byName && byName.countryCode === owner.countryCode) return byName;
  if (typeof p.lat === 'number' && typeof p.lng === 'number') {
    const near = nearestTown(p.lat, p.lng, townsInCountry(owner.countryCode));
    if (Math.abs(near.lat - p.lat) <= SAME_PLACE_DEG && Math.abs(near.lng - p.lng) <= SAME_PLACE_DEG) {
      return near;
    }
  }
  return null;
}

/** Validates a draft for an Owner; returns the normalized fields every write stores. */
function validate(owner: Owner, draft: LodgingDraft) {
  const name = draft.name?.trim() ?? '';
  if (name.length < 3) throw new Error('name is required');
  if (!(draft.kind in KIND_LABEL)) throw new Error('unknown kind');
  const p = draft.place;
  const placeName = p?.name?.trim() ?? '';
  if (!placeName) throw new Error('town is required');
  if (p.countryCode !== owner.countryCode) {
    throw new Error("town is not in the owner's country");
  }
  const listed = listedTown(p, owner);
  const town = {
    name: listed?.name ?? placeName,
    region: listed?.region ?? p.region ?? '',
    countryCode: p.countryCode,
    code: listed?.code as string | undefined,
  };
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
  const photos = draft.photos ?? [];
  if (photos.length > MAX_PHOTOS || photos.some((p) => typeof p !== 'string' || !p)) {
    throw new Error(`at most ${MAX_PHOTOS} photos`);
  }

  return {
    name,
    kind: draft.kind,
    guests: draft.guests,
    bedrooms: draft.bedrooms,
    baths: draft.baths,
    pricePerNight: Math.round(draft.pricePerNight),
    blurb: draft.blurb?.trim() ?? '',
    amenities: draft.amenities?.map((a) => a.trim()).filter(Boolean) ?? [],
    address,
    lat: draft.lat,
    lng: draft.lng,
    photos: photos.length > 0 ? [...photos] : undefined,
    town,
  };
}

/** The draft an existing Lodging would come from: the wizard's edit prefill. */
export function draftOf(l: Lodging): LodgingDraft {
  return {
    name: l.name,
    kind: l.kind,
    place: { name: l.city, region: l.region, countryCode: l.countryCode, lat: l.lat, lng: l.lng },
    guests: l.guests,
    bedrooms: l.bedrooms,
    baths: l.baths,
    pricePerNight: l.pricePerNight,
    blurb: l.blurb,
    amenities: l.amenities,
    address: l.address ?? '',
    lat: l.lat ?? Number.NaN,
    lng: l.lng ?? Number.NaN,
    photos: l.photos,
  };
}

function readState(store: CatalogStorage): State {
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      const overrides = parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {};
      return { created: list(parsed.created), overrides, removed: list(parsed.removed) };
    }
    return { created: list(JSON.parse(store.getItem(LEGACY_KEY) ?? '[]')), overrides: {}, removed: [] };
  } catch {
    return { created: [], overrides: {}, removed: [] };
  }
}

export function createCatalog(storage?: CatalogStorage, bookings: readonly BookingRef[] = ownerBookings) {
  const store = storage ?? (typeof window === 'undefined' ? memoryStorage() : window.localStorage);
  let state: State | null = null;
  let snapshot: Lodging[] = LODGINGS;
  const listeners = new Set<() => void>();

  function applyState(base: Lodging[], s: State): Lodging[] {
    if (s.created.length === 0 && s.removed.length === 0 && Object.keys(s.overrides).length === 0) return base;
    const removed = new Set(s.removed);
    const createdIds = new Set(s.created.map((l) => l.id));
    return [
      ...base.filter((l) => !removed.has(l.id) && !createdIds.has(l.id)).map((l) => s.overrides[l.id] ?? l),
      ...s.created.filter((l) => !removed.has(l.id)),
    ];
  }

  function merge(s: State): Lodging[] {
    return applyState(LODGINGS, s);
  }

  function current(): State {
    if (state === null) {
      state = readState(store);
      snapshot = merge(state);
    }
    return state;
  }

  function all(): Lodging[] {
    current();
    return snapshot;
  }

  const byId = (id: string) => all().find((l) => l.id === id);

  /**
   * The catalog's changes applied onto a different base — e.g. the live API
   * list — so browser-created, overridden and tombstoned Lodgings show up on
   * surfaces whose inventory comes from the network (owner-views §9).
   */
  function overlay(base: Lodging[]): Lodging[] {
    return applyState(base, current());
  }

  /** The browser-only version of a Lodging: created here or an override of the seed/API one. */
  function localOf(id: string): Lodging | undefined {
    const s = current();
    return s.created.find((l) => l.id === id) ?? s.overrides[id];
  }

  /** Tombstoned in this browser — surfaces must not show it, whatever the API says. */
  function isRemoved(id: string): boolean {
    return current().removed.includes(id);
  }

  function find(id: string): Lodging {
    const lodging = byId(id);
    if (!lodging) throw new Error(`unknown lodging: ${id}`);
    return lodging;
  }

  /** Persist first: a storage failure rejects the write with the catalog intact. */
  function commit(next: State) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      throw isQuotaError(e) ? new CatalogFullError() : e;
    }
    state = next;
    snapshot = merge(next);
    listeners.forEach((fn) => fn());
  }

  const upcoming = (id: string) => bookings.filter((b) => b.lodgingId === id && UPCOMING.includes(b.status));
  const canRemove = (id: string) => upcoming(id).length === 0;
  const canRelocate = (id: string) => upcoming(id).length === 0;

  /** Nights taken by Upcoming Bookings (GLOSSARY: Availability), sorted. Owners can't block nights. */
  const occupiedNights = (id: string) => upcoming(id).flatMap((b) => nightsOf(b.checkIn, b.checkOut)).sort();

  /** True when the stay has at least one night and none of them is taken. */
  function isAvailable(id: string, checkIn: string, checkOut: string): boolean {
    if (checkOut <= checkIn) return false;
    const taken = new Set(occupiedNights(id));
    return nightsOf(checkIn, checkOut).every((night) => !taken.has(night));
  }

  function create(ownerSlug: string, draft: LodgingDraft): Lodging {
    const owner = ownerBySlug(ownerSlug);
    if (!owner) throw new Error(`unknown owner: ${ownerSlug}`);
    const { town, photos, ...fields } = validate(owner, draft);
    const taken = new Set([...LODGINGS, ...current().created].map((l) => l.id));
    const base = slugify(fields.name);
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;

    const lodging: Lodging = {
      id,
      ...fields,
      city: town.name,
      region: town.region,
      countryCode: town.countryCode,
      code: town.code,
      currency: ownerFiat(owner),
      rating: 0,
      reviews: 0,
      ownerSlug: owner.slug,
      tone: TONES[taken.size % TONES.length],
      ...(photos && { photos }),
    };
    const s = current();
    commit({ ...s, created: [...s.created, lodging] });
    return lodging;
  }

  /**
   * Edits a Lodging. The town, address and pin can't change while it has an
   * Upcoming Booking. Prices apply to future Bookings only: settled ones are
   * separate records and never touched.
   */
  function update(id: string, patch: Partial<LodgingDraft>): Lodging {
    const existing = find(id);
    const draft = { ...draftOf(existing), ...patch };
    const relocating =
      draft.place?.name !== existing.city ||
      (draft.address?.trim() ?? '') !== (existing.address ?? '') ||
      draft.lat !== existing.lat ||
      draft.lng !== existing.lng;
    if (relocating && !canRelocate(id)) throw new Error('a lodging with upcoming bookings cannot be relocated');

    const { town, photos, ...fields } = validate(ownerBySlug(existing.ownerSlug)!, draft);
    const { photos: _old, ...rest } = existing;
    const lodging: Lodging = {
      ...rest,
      ...fields,
      ...(town.name !== existing.city && {
        city: town.name,
        region: town.region,
        countryCode: town.countryCode,
        code: town.code,
      }),
      ...(photos && { photos }),
    };

    const s = current();
    const isCreated = s.created.some((l) => l.id === id);
    commit(
      isCreated
        ? { ...s, created: s.created.map((l) => (l.id === id ? lodging : l)) }
        : { ...s, overrides: { ...s.overrides, [id]: lodging } },
    );
    return lodging;
  }

  function remove(id: string): void {
    find(id);
    if (!canRemove(id)) throw new Error('a lodging with upcoming bookings cannot be removed');
    const s = current();
    const isCreated = s.created.some((l) => l.id === id);
    const { [id]: _dropped, ...overrides } = s.overrides;
    commit(
      isCreated
        ? { ...s, created: s.created.filter((l) => l.id !== id) }
        : { ...s, overrides, removed: [...s.removed, id] },
    );
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    all,
    byId,
    overlay,
    localOf,
    isRemoved,
    byOwner: (ownerSlug: string) => all().filter((l) => l.ownerSlug === ownerSlug),
    byTown: (town: string) => {
      const t = town.toLowerCase();
      return all().filter((l) => l.city.toLowerCase() === t);
    },
    create,
    update,
    remove,
    canRemove,
    canRelocate,
    occupiedNights,
    isAvailable,
    subscribe,
  };
}

export const catalog = createCatalog();

/** The headline scenario: Casa de Adobe, Cafayate. */
export const CASA_DE_ADOBE = catalog.byId('casa-de-adobe')!;
