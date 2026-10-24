import { Reveal } from '@/components/reveal';

const STEPS = [
  {
    title: 'Contale tu viaje',
    text: 'Destino, fechas y presupuesto, como se lo contarías a un amigo que conoce toda Latinoamérica.',
  },
  {
    title: 'Nomito busca y compara',
    text: 'Revisa alojamientos y te trae una lista corta con el precio final en tu moneda.',
  },
  {
    title: 'Pagás en tu moneda, directo al dueño',
    text: 'Elegís, confirmás y listo. El dinero va al dueño del alojamiento, sin intermediarios.',
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-20 px-4 sm:px-5">
      <div className="mx-auto max-w-7xl rounded-panel bg-white px-5 py-14 sm:px-10 lg:px-16 lg:py-20">
        <Reveal>
          <h2 className="brand-display max-w-xl text-5xl font-medium leading-[0.95] text-ink sm:text-6xl">
            Tres pasos, ninguno es una planilla
          </h2>
        </Reveal>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative md:px-8 md:first:pl-0 md:last:pr-0">
              {i > 0 && (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 hidden border-l-2 border-dashed border-sand md:block" />
              )}
              <Reveal delay={i * 110}>
                <span aria-hidden="true" className="brand-display block text-7xl font-medium leading-none text-terra">
                  {i + 1}
                </span>
                <h3 className="mt-5 font-brand text-2xl font-medium leading-snug text-ink">{s.title}</h3>
                <p className="mt-3 max-w-xs leading-relaxed text-ink-muted">{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
