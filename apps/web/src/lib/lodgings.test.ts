import { describe, expect, it } from 'vitest';

import { nearestTown, TOWNS, townsInCountry } from './lodgings';

/**
 * The wizard's pin always defines the Lodging's town: the nearest listed Town
 * inside the Owner's country — the town is never chosen apart from the pin.
 */
describe('nearestTown', () => {
  it('resolves every listed town center to itself', () => {
    for (const t of TOWNS) {
      expect(nearestTown(t.lat, t.lng).name).toBe(t.name);
    }
  });

  it('picks the closest town, not the first in the list', () => {
    const tilcara = TOWNS.find((t) => t.name === 'Tilcara')!;
    expect(nearestTown(tilcara.lat + 0.01, tilcara.lng - 0.01).name).toBe('Tilcara');
  });

  it('keeps the result inside the given country towns', () => {
    const argentine = townsInCountry('AR');
    // A pin in São Paulo still resolves to an Argentine town for an AR Owner.
    const town = nearestTown(-23.55, -46.63, argentine);
    expect(town.countryCode).toBe('AR');
  });
});
