const ars = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const brl = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CURRENCY_DISPLAY: Record<string, { symbol: string; decimals: number; locale: string }> = {
  USD: { symbol: 'US$', decimals: 2, locale: 'en-US' },
  ARS: { symbol: '$', decimals: 0, locale: 'es-AR' },
  BRL: { symbol: 'R$', decimals: 2, locale: 'pt-BR' },
  CLP: { symbol: 'CLP$', decimals: 0, locale: 'es-CL' },
  COP: { symbol: 'COL$', decimals: 0, locale: 'es-CO' },
  MXN: { symbol: 'MX$', decimals: 0, locale: 'es-MX' },
  UYU: { symbol: '$U', decimals: 0, locale: 'es-AR' },
};

/**
 * Format an amount in minor units (10^-6 of currency) to display string.
 * e.g. 70_000_000, 'USD' -> "US$ 70.00"
 */
export function formatMoney(minor: number, currency: string): string {
  const amount = minor / 1_000_000;
  const display = CURRENCY_DISPLAY[currency];
  if (!display) {
    return `${currency} ${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${display.symbol} ${amount.toLocaleString(display.locale, {
    minimumFractionDigits: display.decimals,
    maximumFractionDigits: display.decimals,
  })}`;
}

/** `$ 285.000 ARS` */
export function formatARS(amount: number): string {
  return `$ ${ars.format(amount)} ARS`;
}

/** `R$ 1.476,15` (whole reales drop the cents: `R$ 1.920`). */
export function formatBRL(amount: number, opts: { withCode?: boolean } = {}): string {
  const body = Number.isInteger(amount) ? ars.format(amount) : brl.format(amount);
  return `R$ ${body}${opts.withCode ? ' BRL' : ''}`;
}

/** 1234567 -> `1.234.567` (es-AR grouping). */
export function formatNumber(n: number): string {
  return ars.format(n);
}

const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/** '2026-11-12' -> `'12 nov'` */
export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** ISO range -> `'12 → 15 nov'`; across months `'30 nov → 3 dic'`. */
export function formatStayRange(checkIn: string, checkOut: string): string {
  const inM = Number(checkIn.split('-')[1]);
  const outM = Number(checkOut.split('-')[1]);
  const inD = Number(checkIn.split('-')[2]);
  const outD = Number(checkOut.split('-')[2]);
  return inM === outM
    ? `${inD} → ${outD} ${MONTHS_SHORT[inM - 1]}`
    : `${formatShortDate(checkIn)} → ${formatShortDate(checkOut)}`;
}
