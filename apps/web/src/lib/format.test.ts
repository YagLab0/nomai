import { describe, expect, it } from 'vitest';

import { formatFiat } from './format';

/**
 * The saldo card shows every wFIAT balance in its own fiat, always carrying
 * the ISO code — "$ 95.000 ARS", "R$ 500 BRL" (issue #39).
 */
describe('formatFiat', () => {
  it('formats whole amounts without decimals', () => {
    expect(formatFiat(95000, 'ARS')).toBe('$ 95.000 ARS');
    expect(formatFiat(500, 'BRL')).toBe('R$ 500 BRL');
    expect(formatFiat(1200, 'PEN')).toBe('S/ 1,200 PEN');
  });

  it('keeps the currency decimals on fractional amounts', () => {
    expect(formatFiat(1476.15, 'BRL')).toBe('R$ 1.476,15 BRL');
    expect(formatFiat(1.2, 'PEN')).toBe('S/ 1.20 PEN');
  });

  it('formats zero as a real zero balance', () => {
    expect(formatFiat(0, 'ARS')).toBe('$ 0 ARS');
    expect(formatFiat(0, 'BRL')).toBe('R$ 0 BRL');
  });

  it('falls back to a plain amount for currencies without display data', () => {
    expect(formatFiat(12.5, 'XXX')).toBe('12.50 XXX');
  });
});
