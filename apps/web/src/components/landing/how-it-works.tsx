const STEPS = [
  {
    title: 'Contale tu viaje',
    text: 'Destino, fechas y presupuesto, como se lo contarías a un amigo que conoce todo el Norte.',
  },
  {
    title: 'Nomito busca y compara',
    text: 'Revisa alojamientos, negocia y te trae una lista corta con el precio final en tu moneda.',
  },
  {
    title: 'Pagás en tu moneda, directo al dueño',
    text: 'Elegís, confirmás y listo. El dinero va al dueño del alojamiento, sin intermediarios.',
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-16 border-y border-sand bg-white/60">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
        <h2 className="brand-display max-w-xl text-4xl font-medium leading-tight text-ink sm:text-5xl">
          Tres pasos, ninguno es una planilla
        </h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative md:px-8 md:first:pl-0 md:last:pr-0">
              {i > 0 && <span aria-hidden="true" className="absolute inset-y-0 left-0 hidden border-l-2 border-dashed border-sand md:block" />}
              <span className="font-mono text-sm text-terra">paso {i + 1}</span>
              <h3 className="mt-2 font-brand text-2xl font-medium leading-snug text-ink">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
