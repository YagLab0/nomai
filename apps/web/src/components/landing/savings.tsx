import { CountUpBRL } from '@/components/count-up';
import { Reveal } from '@/components/reveal';
import { CASA_DE_ADOBE, quoteFor } from '@/lib/lodgings';

const ROWS = [
  {
    label: 'Cambio de moneda',
    card: 'Tarjeta + dólar tarjeta: impuestos y recargos que suman hasta un 30%',
    nomai: 'Una sola comisión de conversión, siempre a la vista',
  },
  {
    label: 'Comisión del alojamiento',
    card: 'Las plataformas le cobran al dueño entre 15% y 20%, y termina en el precio',
    nomai: 'El dueño no paga comisión. El precio es el suyo',
  },
  {
    label: 'Confirmación',
    card: 'Cuando alguien la ve y la acepta, a veces horas después',
    nomai: 'Al instante: el pago confirma la reserva',
  },
];

export function Savings() {
  const quote = quoteFor(CASA_DE_ADOBE);
  const total = quote.lines.find((l) => l.kind === 'total')!;
  const fee = quote.lines.find((l) => l.kind === 'fee')!;

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-5 lg:py-28">
      <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <h2 className="brand-display text-5xl font-medium leading-[0.95] text-ink sm:text-6xl">Por qué pagás menos</h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-muted">
            Pagás en reales, el dueño cobra en pesos, y nadie en el medio se queda con un pedazo.
          </p>
          <div className="relative mt-8 rounded-card bg-terra p-7 text-paper">
            <p className="text-sm text-paper/80">Un ejemplo: {quote.lodging}, {quote.nights} noches</p>
            <p className="mt-1 font-mono text-3xl font-semibold">
              {total.amount !== undefined ? <CountUpBRL to={total.amount} /> : total.value}
            </p>
            <p className="mt-2 text-sm text-paper/80">
              Todo incluido. La comisión de conversión ({fee.value}) figura aparte, sin letra chica.
            </p>
          </div>
        </Reveal>

        <Reveal delay={140} className="overflow-x-auto rounded-card bg-white px-6 py-4 sm:px-8">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <caption className="sr-only">Comparación entre pagar con tarjeta y pagar con Nomito</caption>
            <thead>
              <tr className="text-sm">
                <th scope="col" className="w-[24%] pb-4 pt-4 pr-4 font-normal text-ink-muted"><span className="sr-only">Concepto</span></th>
                <th scope="col" className="pb-4 pt-4 pr-6 font-medium text-ink-muted">Con tarjeta</th>
                <th scope="col" className="pb-4 pt-4 font-brand text-lg font-medium text-terra-deep">Con Nomito</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-t border-sand align-top">
                  <th scope="row" className="py-5 pr-4 text-left text-sm font-semibold text-ink">{r.label}</th>
                  <td className="py-5 pr-6 text-ink-muted">{r.card}</td>
                  <td className="py-5 font-medium text-ink">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-agua" aria-hidden="true" />
                    {r.nomai}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  );
}
