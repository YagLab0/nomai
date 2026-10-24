const STEPS = [
  {
    title: 'Teléfono',
    unlocks: 'Ya podés buscar alojamiento con Nomito, gratis',
  },
  {
    title: 'Primera carga de saldo',
    unlocks: 'Más búsquedas por día con Nomito (o verificá tu pasaporte con Self)',
  },
  {
    title: 'Documento de identidad',
    unlocks: 'Solo se pide cuando hacés una reserva',
  },
];

/** The verification tiers that gate free Agent usage (ADR-0002, ADR-0005). Step 1 is the current one. */
export function VerificationLadder() {
  return (
    <section aria-labelledby="ladder-title" className="mt-10 border-t border-sand pt-8">
      <h2 id="ladder-title" className="font-brand text-lg font-medium text-ink">
        Verificás solo lo necesario, cuando hace falta
      </h2>
      <ol className="mt-5">
        {STEPS.map((step, i) => {
          const current = i === 0;
          const last = i === STEPS.length - 1;
          return (
            <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px ${
                    current ? 'bg-terra' : 'border-l border-dashed border-sand'
                  }`}
                />
              )}
              <span
                aria-hidden="true"
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold ${
                  current
                    ? 'bg-terra text-paper ring-4 ring-terra-soft'
                    : 'border border-sand bg-paper text-ink-muted'
                }`}
              >
                {i + 1}
              </span>
              <div className="pt-0.5">
                <p className={`text-sm font-semibold ${current ? 'text-ink' : 'text-ink-muted'}`}>
                  {step.title}
                  {current && (
                    <span className="ml-2 rounded-full bg-terra-soft px-2 py-0.5 text-xs font-medium text-terra-deep">
                      Estás acá
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{step.unlocks}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
