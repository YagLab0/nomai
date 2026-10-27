import { RIPIO_COUNTRIES, type Fiat } from './lodgings';

/** A Ripio country currency — RIPIO_COUNTRIES' fiat union (no USD, has UYU). */
type RipioFiat = (typeof RIPIO_COUNTRIES)[number]['fiat'];

/**
 * The fiats a Traveler can load ("Cargar", issue #40): the six currencies
 * with a wFIAT mirroring them 1:1 on Celo — every Ripio country currency
 * except UYU, which has no wFIAT of its own.
 */
export const FUNDING_FIATS = RIPIO_COUNTRIES.map((c) => c.fiat).filter(
  (f): f is Exclude<RipioFiat, 'UYU'> => f !== 'UYU',
);

/**
 * Default Funding currency: the Traveler's country wFIAT when there is one —
 * a country without its own (Uruguay) starts on ARS and picks freely.
 */
export function defaultFundingFiat(countryCode: string | null): Fiat {
  const fiat = RIPIO_COUNTRIES.find((c) => c.code === countryCode)?.fiat;
  return fiat && fiat !== 'UYU' ? fiat : 'ARS';
}

/**
 * Parses the amount the Traveler typed for a Funding, in their own writing:
 * '.' is the es-AR thousands separator and ',' the decimal one, so "95.000"
 * is 95000 while "95,5" and "95.5" are both 95.5. Returns null for anything
 * that is not a positive finite number.
 */
export function parseFundingAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  let normalized = s;
  if (s.includes(',')) {
    // "95.000,50" or "95,5": '.' thousands, ',' decimal.
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "95.000": dot groups of exactly three are thousands separators.
    normalized = s.replace(/\./g, '');
  }
  if (!/^\d*\.?\d+$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}
