import { describe, expect, it } from 'vitest';

import { catalog, CatalogFullError, createCatalog, type LodgingDraft } from '@/lib/catalog';
import { LODGINGS } from '@/lib/lodgings';

/** In-memory stand-in for localStorage (owner-views §9 testing seam). */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const DRAFT: LodgingDraft = {
  name: 'Posada del Molino',
  kind: 'posada',
  town: 'Tilcara',
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
    ['an unknown town', { town: 'Narnia' }],
    ['a town outside the Owner\u2019s country', { town: 'Florianópolis' }],
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
    expect(() => c.create('ramon-guaymas', { ...DRAFT, town: 'Bogotá' })).toThrow();
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
