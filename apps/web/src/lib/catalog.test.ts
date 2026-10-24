import { describe, expect, it } from 'vitest';

import { catalog } from '@/lib/catalog';
import { LODGINGS } from '@/lib/lodgings';

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
