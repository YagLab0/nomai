import { describe, expect, it } from 'vitest';

import { catalog, CatalogFullError, createCatalog, type LodgingDraft } from '@/lib/catalog';
import { LODGINGS } from '@/lib/lodgings';
import { ownerBookings, type OwnerBookingStatus } from '@/lib/mock/owner';

/** In-memory stand-in for localStorage (owner-views §9 testing seam). */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/** The Tilcara a geocoder would return — the wizard's pick. */
const TILCARA = { name: 'Tilcara', region: 'Quebrada de Humahuaca', countryCode: 'AR', lat: -23.5776, lng: -65.3966 };

const DRAFT: LodgingDraft = {
  name: 'Posada del Molino',
  kind: 'posada',
  place: TILCARA,
  guests: 4,
  bedrooms: 2,
  baths: 1,
  pricePerNight: 85_000,
  blurb: 'A una cuadra del Pucará.',
  amenities: ['Patio', 'Desayuno'],
  address: 'Belgrano 450',
  lat: -23.5781,
  lng: -65.3959,
};

describe('catalog', () => {
  it('returns every seeded Lodging', () => {
    expect(catalog.all()).toEqual(LODGINGS);
  });

  it('finds a Lodging by id', () => {
    expect(catalog.byId('casa-de-adobe')?.name).toBe('Casa de Adobe');
    expect(catalog.byId('no-existe')).toBeUndefined();
  });

  it('returns the Lodgings of one Owner', () => {
    const ramon = catalog.byOwner('ramon-guaymas');
    expect(ramon.map((l) => l.id)).toEqual(['casa-de-adobe', 'cabana-vinas-del-sol']);
    expect(catalog.byOwner('nadie')).toEqual([]);
  });

  it('returns the Lodgings in one town', () => {
    const cafayate = catalog.byTown('Cafayate');
    expect(cafayate.map((l) => l.id)).toEqual(['casa-de-adobe', 'cabana-vinas-del-sol']);
    expect(catalog.byTown('cafayate')).toEqual(cafayate);
    expect(catalog.byTown('Ushuaia')).toEqual([]);
  });

  it('keeps an exact address and coordinates on the seeded Cafayate Lodgings', () => {
    for (const id of ['casa-de-adobe', 'cabana-vinas-del-sol']) {
      const lodging = catalog.byId(id)!;
      expect(lodging.address).toBeTruthy();
      expect(lodging.lat).toEqual(expect.any(Number));
      expect(lodging.lng).toEqual(expect.any(Number));
    }
  });
});

describe('catalog.create', () => {
  it('derives currency, country, region, code and zero reviews from the Owner and the town', () => {
    const c = createCatalog(memoryStorage());
    const created = c.create('ramon-guaymas', DRAFT);

    expect(created.ownerSlug).toBe('ramon-guaymas');
    expect(created.city).toBe('Tilcara');
    expect(created.countryCode).toBe('AR');
    expect(created.currency).toBe('ARS');
    expect(created.code).toBe('TIL');
    expect(created.region).toBe('Quebrada de Humahuaca');
    expect(created.rating).toBe(0);
    expect(created.reviews).toBe(0);
    expect(created.id).toBeTruthy();
  });

  it('accepts an unlisted geocoded place: same fields, no sigla', () => {
    const c = createCatalog(memoryStorage());
    const created = c.create('ramon-guaymas', {
      ...DRAFT,
      place: { name: 'Villa Traful', region: 'Neuquén', countryCode: 'AR', lat: -40.65, lng: -71.4 },
    });
    expect(created.city).toBe('Villa Traful');
    expect(created.region).toBe('Neuquén');
    expect(created.countryCode).toBe('AR');
    expect(created.code).toBeUndefined();
  });

  it('a searched place that sits on a listed Town backfills its data', () => {
    const c = createCatalog(memoryStorage());
    const created = c.create('ramon-guaymas', {
      ...DRAFT,
      // The geocoder's spelling differs but the point is Tilcara.
      place: { name: 'Tilcara centro', countryCode: 'AR', lat: -23.578, lng: -65.397 },
    });
    expect(created.city).toBe('Tilcara');
    expect(created.region).toBe('Quebrada de Humahuaca');
    expect(created.code).toBe('TIL');
  });

  it('shows the new Lodging in every read query', () => {
    const c = createCatalog(memoryStorage());
    const before = c.all().length;
    const created = c.create('ramon-guaymas', DRAFT);

    expect(c.all()).toHaveLength(before + 1);
    expect(c.byId(created.id)?.name).toBe('Posada del Molino');
    expect(c.byOwner('ramon-guaymas').map((l) => l.id)).toContain(created.id);
    expect(c.byTown('Tilcara').map((l) => l.id)).toContain(created.id);
  });

  it.each([
    ['no name', { name: '  ' }],
    ['a blank place name', { place: { name: ' ', countryCode: 'AR' } }],
    ['a place outside the Owner\u2019s country', { place: { name: 'Florianópolis', countryCode: 'BR' } }],
    ['zero guests', { guests: 0 }],
    ['no price', { pricePerNight: 0 }],
    ['a negative price', { pricePerNight: -50 }],
    ['no address', { address: '  ' }],
    ['coordinates that are not numbers', { lat: Number.NaN }],
    ['coordinates off the globe', { lng: 200 }],
  ])('rejects a draft with %s', (_case, patch) => {
    const c = createCatalog(memoryStorage());
    expect(() => c.create('ramon-guaymas', { ...DRAFT, ...patch })).toThrow();
  });

  it('rejects a draft without a pin', () => {
    const c = createCatalog(memoryStorage());
    const { lat: _lat, lng: _lng, ...noPin } = DRAFT;
    expect(() => c.create('ramon-guaymas', noPin as LodgingDraft)).toThrow();
  });

  it('keeps the exact address and the pin, also after a reload', () => {
    const storage = memoryStorage();
    const created = createCatalog(storage).create('ramon-guaymas', DRAFT);
    expect(created).toMatchObject({ address: 'Belgrano 450', lat: -23.5781, lng: -65.3959 });

    const reopened = createCatalog(storage).byId(created.id);
    expect(reopened).toMatchObject({ address: 'Belgrano 450', lat: -23.5781, lng: -65.3959 });
  });

  it('keeps up to five photos in order, the first being the cover, also after a reload', () => {
    const storage = memoryStorage();
    const photos = ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB'];
    const created = createCatalog(storage).create('ramon-guaymas', { ...DRAFT, photos });
    expect(created.photos).toEqual(photos);
    expect(createCatalog(storage).byId(created.id)?.photos).toEqual(photos);
  });

  it('rejects more than five photos', () => {
    const c = createCatalog(memoryStorage());
    const photos = Array.from({ length: 6 }, (_, i) => `data:image/jpeg;base64,${i}`);
    expect(() => c.create('ramon-guaymas', { ...DRAFT, photos })).toThrow();
    expect(c.byOwner('ramon-guaymas')).toHaveLength(2);
  });

  it('fails with CatalogFullError and stays unchanged when the browser storage is full', () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    const c = createCatalog(full);
    expect(() => c.create('ramon-guaymas', DRAFT)).toThrow(CatalogFullError);
    expect(c.byOwner('ramon-guaymas')).toHaveLength(2);
  });

  it('rejects a draft for an unknown Owner', () => {
    const c = createCatalog(memoryStorage());
    expect(() => c.create('nadie', DRAFT)).toThrow();
  });

  it('leaves the catalog untouched when a draft is rejected', () => {
    const c = createCatalog(memoryStorage());
    const before = c.all();
    expect(() =>
      c.create('ramon-guaymas', { ...DRAFT, place: { name: 'Bogotá', countryCode: 'CO' } }),
    ).toThrow();
    expect(c.all()).toEqual(before);
    expect(c.byOwner('ramon-guaymas')).toHaveLength(2);
  });

  it('sees the created Lodging from a fresh catalog over the same storage', () => {
    const storage = memoryStorage();
    const created = createCatalog(storage).create('ramon-guaymas', DRAFT);

    const reopened = createCatalog(storage);
    expect(reopened.byId(created.id)?.name).toBe('Posada del Molino');
    expect(reopened.byOwner('ramon-guaymas')).toHaveLength(3);
  });

  it('gives each Lodging a distinct id', () => {
    const c = createCatalog(memoryStorage());
    const first = c.create('ramon-guaymas', DRAFT);
    const second = c.create('ramon-guaymas', DRAFT);
    expect(first.id).not.toBe(second.id);
    expect(c.byId(first.id)?.id).toBe(first.id);
    expect(c.byId(second.id)?.id).toBe(second.id);
  });

  it('notifies subscribers when a Lodging is created', () => {
    const c = createCatalog(memoryStorage());
    let notified = 0;
    const unsubscribe = c.subscribe(() => notified++);
    c.create('ramon-guaymas', DRAFT);
    expect(notified).toBe(1);
    unsubscribe();
  });
});

const booking = (lodgingId: string, status: OwnerBookingStatus, checkIn = '2026-12-01', checkOut = '2026-12-04') => ({
  lodgingId,
  status,
  checkIn,
  checkOut,
});

describe('catalog rules: an Upcoming Booking blocks removing and relocating', () => {
  it.each(['confirmada', 'en-curso'] as const)('a %s Booking blocks both', (status) => {
    const c = createCatalog(memoryStorage(), [booking('casa-de-adobe', status)]);
    expect(c.canRemove('casa-de-adobe')).toBe(false);
    expect(c.canRelocate('casa-de-adobe')).toBe(false);
  });

  it('cancelled and completed Bookings block nothing', () => {
    const c = createCatalog(memoryStorage(), [
      booking('casa-de-adobe', 'cancelada'),
      booking('casa-de-adobe', 'completada'),
    ]);
    expect(c.canRemove('casa-de-adobe')).toBe(true);
    expect(c.canRelocate('casa-de-adobe')).toBe(true);
  });

  it("follows Ramón's mock Bookings by default: both seeded Lodgings are locked, a new one is not", () => {
    const c = createCatalog(memoryStorage());
    expect(c.canRemove('casa-de-adobe')).toBe(false);
    expect(c.canRelocate('cabana-vinas-del-sol')).toBe(false);
    const created = c.create('ramon-guaymas', DRAFT);
    expect(c.canRemove(created.id)).toBe(true);
    expect(c.canRelocate(created.id)).toBe(true);
  });
});

describe('catalog.update', () => {
  it('overrides a seeded Lodging in every read and survives a reload, leaving the seed untouched', () => {
    const storage = memoryStorage();
    const seedPrice = LODGINGS.find((l) => l.id === 'casa-de-adobe')!.pricePerNight;
    const updated = createCatalog(storage).update('casa-de-adobe', { name: 'Casa de Adobe y Parral', pricePerNight: 99_000 });

    expect(updated).toMatchObject({ id: 'casa-de-adobe', name: 'Casa de Adobe y Parral', pricePerNight: 99_000 });
    const reopened = createCatalog(storage);
    expect(reopened.byId('casa-de-adobe')?.name).toBe('Casa de Adobe y Parral');
    expect(reopened.byOwner('ramon-guaymas').find((l) => l.id === 'casa-de-adobe')?.pricePerNight).toBe(99_000);
    expect(reopened.byTown('Cafayate').map((l) => l.id)).toContain('casa-de-adobe');
    expect(LODGINGS.find((l) => l.id === 'casa-de-adobe')!.pricePerNight).toBe(seedPrice);
    expect(createCatalog(memoryStorage()).byId('casa-de-adobe')?.pricePerNight).toBe(seedPrice);
  });

  it('a price edit leaves existing Bookings as they were settled', () => {
    const before = ownerBookings.map((b) => b.amount);
    createCatalog(memoryStorage()).update('casa-de-adobe', { pricePerNight: 150_000 });
    expect(ownerBookings.map((b) => b.amount)).toEqual(before);
  });

  it('keeps the rating and reviews of a seeded Lodging', () => {
    const updated = createCatalog(memoryStorage()).update('casa-de-adobe', { blurb: 'Otro texto.' });
    expect(updated).toMatchObject({ rating: 4.9, reviews: 118 });
  });

  it.each([
    ['the town', { place: { name: 'Salta', countryCode: 'AR' } }],
    ['the address', { address: 'San Martín 10' }],
    ['the pin', { lat: -26.08 }],
  ])('rejects changing %s while an Upcoming Booking exists', (_case, patch) => {
    const c = createCatalog(memoryStorage());
    const before = c.byId('casa-de-adobe');
    expect(() => c.update('casa-de-adobe', patch)).toThrow();
    expect(c.byId('casa-de-adobe')).toEqual(before);
  });

  it('accepts the unchanged location alongside other edits while locked', () => {
    const c = createCatalog(memoryStorage());
    const l = c.byId('casa-de-adobe')!;
    const updated = c.update('casa-de-adobe', {
      place: { name: l.city, region: l.region, countryCode: l.countryCode, lat: l.lat, lng: l.lng },
      address: l.address,
      lat: l.lat,
      lng: l.lng,
      pricePerNight: 100_000,
    });
    expect(updated.pricePerNight).toBe(100_000);
  });

  it('relocates a Lodging without Upcoming Bookings, deriving the town data again', () => {
    const c = createCatalog(memoryStorage());
    const created = c.create('ramon-guaymas', DRAFT);
    const moved = c.update(created.id, {
      place: { name: 'Humahuaca', countryCode: 'AR' },
      address: 'Tucumán 12',
      lat: -23.2,
      lng: -65.35,
    });
    expect(moved).toMatchObject({ city: 'Humahuaca', code: 'HUM', address: 'Tucumán 12', lat: -23.2 });
    expect(c.byTown('Humahuaca').map((l) => l.id)).toContain(created.id);
    expect(c.byTown('Tilcara').map((l) => l.id)).not.toContain(created.id);
  });

  it.each([
    ['an empty name', { name: ' ' }],
    ['a zero price', { pricePerNight: 0 }],
    ['six photos', { photos: Array.from({ length: 6 }, (_, i) => `data:image/jpeg;base64,${i}`) }],
    ['a place abroad', { place: { name: 'Tulum', countryCode: 'MX' } }],
  ])('validates the edited Lodging: rejects %s', (_case, patch) => {
    const c = createCatalog(memoryStorage(), []);
    expect(() => c.update('casa-de-adobe', patch)).toThrow();
  });

  it('changes the photos of a created Lodging', () => {
    const c = createCatalog(memoryStorage());
    const created = c.create('ramon-guaymas', { ...DRAFT, photos: ['data:image/jpeg;base64,A'] });
    const updated = c.update(created.id, { photos: ['data:image/jpeg;base64,B', 'data:image/jpeg;base64,C'] });
    expect(updated.photos).toEqual(['data:image/jpeg;base64,B', 'data:image/jpeg;base64,C']);
    expect(c.update(created.id, { photos: [] }).photos).toBeUndefined();
  });

  it('rejects an unknown id and notifies subscribers on success', () => {
    const c = createCatalog(memoryStorage());
    expect(() => c.update('no-existe', { name: 'Nada' })).toThrow();
    let notified = 0;
    c.subscribe(() => notified++);
    c.update('casa-de-adobe', { name: 'Casa de Adobe II' });
    expect(notified).toBe(1);
  });
});

describe('catalog.remove', () => {
  it('hides a created Lodging from every query, also after a reload', () => {
    const storage = memoryStorage();
    const c = createCatalog(storage);
    const created = c.create('ramon-guaymas', DRAFT);
    c.remove(created.id);

    for (const reader of [c, createCatalog(storage)]) {
      expect(reader.byId(created.id)).toBeUndefined();
      expect(reader.all().map((l) => l.id)).not.toContain(created.id);
      expect(reader.byOwner('ramon-guaymas').map((l) => l.id)).not.toContain(created.id);
      expect(reader.byTown('Tilcara').map((l) => l.id)).not.toContain(created.id);
    }
  });

  it('tombstones a seeded Lodging without Upcoming Bookings, leaving the seed untouched', () => {
    const storage = memoryStorage();
    createCatalog(storage, []).remove('posada-el-algarrobo');
    expect(createCatalog(storage, []).byId('posada-el-algarrobo')).toBeUndefined();
    expect(createCatalog(storage, []).byTown('Salta').map((l) => l.id)).toEqual(['casona-guemes']);
    expect(LODGINGS.some((l) => l.id === 'posada-el-algarrobo')).toBe(true);
  });

  it('rejects removing a Lodging with an Upcoming Booking and leaves it in place', () => {
    const c = createCatalog(memoryStorage());
    expect(() => c.remove('casa-de-adobe')).toThrow();
    expect(c.byId('casa-de-adobe')).toBeDefined();
  });

  it('rejects an unknown id', () => {
    expect(() => createCatalog(memoryStorage()).remove('no-existe')).toThrow();
  });
});

describe('catalog availability', () => {
  it("derives Casa de Adobe's occupied nights from Ramón's Bookings: Lucas's stay, not Camila's cancelled one", () => {
    expect(createCatalog(memoryStorage()).occupiedNights('casa-de-adobe')).toEqual([
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });

  it('counts Confirmada and En curso nights, across months, and ignores Cancelada and Completada', () => {
    const c = createCatalog(memoryStorage(), [
      booking('casa-de-adobe', 'confirmada', '2026-11-30', '2026-12-02'),
      booking('casa-de-adobe', 'en-curso', '2026-11-03', '2026-11-04'),
      booking('casa-de-adobe', 'cancelada', '2026-11-10', '2026-11-12'),
      booking('casa-de-adobe', 'completada', '2026-10-01', '2026-10-03'),
      booking('cabana-vinas-del-sol', 'confirmada', '2026-11-15', '2026-11-16'),
    ]);
    expect(c.occupiedNights('casa-de-adobe')).toEqual(['2026-11-03', '2026-11-30', '2026-12-01']);
  });

  it('leaves every night free without Bookings', () => {
    expect(createCatalog(memoryStorage(), []).occupiedNights('casa-de-adobe')).toEqual([]);
  });

  it.each([
    ['a free stay', '2026-11-10', '2026-11-13', true],
    ['checking out the morning the next guest arrives', '2026-11-17', '2026-11-20', true],
    ['checking in the day the last guest leaves', '2026-11-23', '2026-11-26', true],
    ['a stay that crosses an occupied night', '2026-11-18', '2026-11-25', false],
    ['a stay inside the occupied nights', '2026-11-21', '2026-11-22', false],
    ['a check-out before the check-in', '2026-11-12', '2026-11-10', false],
    ['zero nights', '2026-11-12', '2026-11-12', false],
  ])('isAvailable: %s', (_case, checkIn, checkOut, expected) => {
    expect(createCatalog(memoryStorage()).isAvailable('casa-de-adobe', checkIn, checkOut)).toBe(expected);
  });
});
