import { describe, expect, it } from 'vitest';

import { FUNDING_FIATS, defaultFundingFiat, parseFundingAmount } from './funding';

/**
 * The Funding step validates the typed amount before ever asking the API for
 * a link (issue #40): locale-shaped input ("95.000" is ninety-five thousand
 * in es-AR) must not surprise the Traveler at the ramp.
 */
describe('FUNDING_FIATS', () => {
  it('lists the six wFIAT-mirrored fiats', () => {
    expect(FUNDING_FIATS).toEqual(['ARS', 'BRL', 'CLP', 'COP', 'MXN', 'PEN']);
  });
});

describe('defaultFundingFiat', () => {
  it('defaults to the country wFIAT when one exists', () => {
    expect(defaultFundingFiat('AR')).toBe('ARS');
    expect(defaultFundingFiat('MX')).toBe('MXN');
  });

  it('falls back to ARS for a country without its own wFIAT', () => {
    expect(defaultFundingFiat('UY')).toBe('ARS');
    expect(defaultFundingFiat(null)).toBe('ARS');
  });
});

describe('parseFundingAmount', () => {
  it('parses plain amounts', () => {
    expect(parseFundingAmount('95000')).toBe(95000);
    expect(parseFundingAmount(' 10000 ')).toBe(10000);
  });

  it('parses es-AR thousands separators', () => {
    expect(parseFundingAmount('95.000')).toBe(95000);
    expect(parseFundingAmount('1.234.567')).toBe(1234567);
  });

  it('parses decimals in either separator', () => {
    expect(parseFundingAmount('95,5')).toBe(95.5);
    expect(parseFundingAmount('95.5')).toBe(95.5);
    expect(parseFundingAmount('1.234,56')).toBe(1234.56);
  });

  it('rejects non-positive and non-numeric input', () => {
    for (const bad of ['', '   ', 'abc', '-5', '0', '0,00', '95.00.0', '1,2,3']) {
      expect(parseFundingAmount(bad), bad).toBeNull();
    }
  });
});
