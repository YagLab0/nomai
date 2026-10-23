'use client';

import { ThreadPrimitive } from '@assistant-ui/react';

import { NomitoAvatar } from '@/components/nomito-avatar';

const SUGGESTIONS = [
  'Una semana en Salta y Cafayate',
  'Algo tranquilo en Purmamarca',
  'Hostel en Tilcara para 2',
];

export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <NomitoAvatar size="lg" />
      <h2 className="font-brand text-3xl font-medium text-ink">¿A dónde querés ir?</h2>
      <p className="max-w-sm text-ink-muted">
        Contale a Nomito y te busca alojamiento directo con el dueño, en tu moneda.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((prompt) => (
          <ThreadPrimitive.Suggestion
            key={prompt}
            prompt={prompt}
            send
            className="rounded-full border border-sand bg-white px-4 py-2 text-sm text-ink transition-colors hover:border-terra hover:text-terra-deep focus-visible:outline-2 focus-visible:outline-terra"
          >
            {prompt}
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </div>
  );
}
