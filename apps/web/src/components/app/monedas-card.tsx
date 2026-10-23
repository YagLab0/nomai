'use client';

import { useMonedas } from '@/components/app/use-monedas';
import { WidgetCard } from '@/components/app/widget-card';
import { traveler } from '@/lib/mock/traveler';

export function MonedasCard() {
  const monedas = useMonedas();
  const done = traveler.ladder.filter((s) => s.status === 'done').length;

  return (
    <WidgetCard title="Monedas Nomai">
      <p className="font-mono text-4xl font-semibold text-ink" aria-live="polite">
        {monedas}
      </p>
      <div>
        <div
          role="progressbar"
          aria-label="Verificación"
          aria-valuemin={0}
          aria-valuemax={traveler.ladder.length}
          aria-valuenow={done}
          aria-valuetext={`${done} de ${traveler.ladder.length} pasos`}
          className="flex gap-1"
        >
          {traveler.ladder.map((s) => (
            <span
              key={s.title}
              className={`h-1.5 flex-1 rounded-full ${s.status === 'done' ? 'bg-agua' : s.status === 'pending' ? 'bg-terra/40' : 'bg-sand'}`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Paso {done + 1} de {traveler.ladder.length}
        </p>
      </div>
      <p className="rounded-xl bg-terra-soft px-3 py-2 text-sm text-terra-deep">{traveler.nextStepCta}</p>
    </WidgetCard>
  );
}
