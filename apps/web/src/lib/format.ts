const ars = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const brl = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `$ 285.000 ARS` */
export function formatARS(amount: number): string {
  return `$ ${ars.format(amount)} ARS`;
}

/** `R$ 1.476,15` (whole reales drop the cents: `R$ 1.920`). */
export function formatBRL(amount: number, opts: { withCode?: boolean } = {}): string {
  const body = Number.isInteger(amount) ? ars.format(amount) : brl.format(amount);
  return `R$ ${body}${opts.withCode ? ' BRL' : ''}`;
}
