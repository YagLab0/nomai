import { describe, expect, it } from 'vitest';

import { parsePlace, placeName } from './geocode';

type Row = Parameters<typeof parsePlace>[0];

/** Nominatim rows as /search?format=jsonv2&addressdetails=1 returns them. */
const row = (over: Partial<Row>): Row => ({
  lat: '-23.5776',
  lon: '-65.3966',
  display_name: 'Tilcara, Departamento de Tilcara, Jujuy, Argentina',
  address: { village: 'Tilcara', state: 'Jujuy', country_code: 'ar' },
  ...over,
});

describe('parsePlace', () => {
  it('names the place from the finest address part and keeps its province and country', () => {
    expect(parsePlace(row({}), 'AR')).toEqual({
      name: 'Tilcara',
      region: 'Jujuy',
      countryCode: 'AR',
      lat: -23.5776,
      lng: -65.3966,
    });
  });

  it('an unlisted place still parses, carrying its province', () => {
    const p = parsePlace(
      row({
        display_name: 'Villa Traful, Departamento Los Lagos, Neuquén, Argentina',
        address: { village: 'Villa Traful', state: 'Neuquén', country_code: 'ar' },
        lat: '-40.65',
        lon: '-71.4',
      }),
      'AR',
    );
    expect(p).toMatchObject({ name: 'Villa Traful', region: 'Neuquén', countryCode: 'AR' });
  });

  it('drops results from another country — the search already filters, this is the backstop', () => {
    expect(
      parsePlace(
        row({ address: { city: 'Florianópolis', state: 'Santa Catarina', country_code: 'br' } }),
        'AR',
      ),
    ).toBeNull();
  });

  it('drops rows without a name or a point', () => {
    expect(parsePlace(row({ address: { country_code: 'ar' }, display_name: '' }), 'AR')).toBeNull();
    expect(parsePlace(row({ lat: 'nota' }), 'AR')).toBeNull();
  });

  it('prefers village over city over the display name fallback', () => {
    expect(placeName(row({ address: { village: 'V', city: 'C', country_code: 'ar' } }))).toBe('V');
    expect(placeName(row({ address: { city: 'C', country_code: 'ar' } }))).toBe('C');
    expect(placeName(row({ address: { country_code: 'ar' } }))).toBe('Tilcara');
  });
});
