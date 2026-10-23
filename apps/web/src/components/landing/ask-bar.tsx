'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { CalendarIcon, MapPinIcon, MinusIcon, PlusIcon, UsersIcon } from '@/components/icons';
import { NomitoAvatar } from '@/components/nomito-avatar';
import { ASK_PARAM } from '@/lib/nomito/ask';
import { cn } from '@/lib/utils';

const MAX_TRAVELERS = 12;

/** "Quiero ir a Cafayate en julio. Somos 2." — the first message Nomito gets. */
function composeAsk(destino: string, fechas: string, viajeros: number): string {
  const where = destino.trim() ? `Quiero ir a ${destino.trim()}` : 'Quiero viajar al Norte';
  const when = fechas.trim() ? ` ${fechas.trim()}` : '';
  const who = viajeros === 1 ? 'Viajo solo.' : `Somos ${viajeros}.`;
  return `${where}${when}. ${who}`;
}

const fieldClass =
  'flex min-w-0 flex-1 items-center gap-3 rounded-[1.25rem] px-4 py-2.5 transition-colors focus-within:bg-paper hover:bg-paper';
const labelClass = 'block text-xs font-medium text-ink-muted';
const inputClass =
  'block w-full min-w-0 bg-transparent text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-ink-muted/70 focus:outline-none';

/**
 * The hero's trip form. Not a search engine: it drafts the Traveler's first
 * message to Nomito and carries it through sign-up into the chat (`?ask=`).
 */
export function AskBar({ className }: { className?: string }) {
  const router = useRouter();
  const id = useId();
  const [destino, setDestino] = useState('');
  const [fechas, setFechas] = useState('');
  const [viajeros, setViajeros] = useState(2);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const ask = composeAsk(destino, fechas, viajeros);
    router.push(`/signup?${ASK_PARAM}=${encodeURIComponent(ask)}`);
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Contale a Nomito"
      className={cn('rounded-card bg-white p-2 shadow-[0_24px_60px_-28px_rgba(42,30,23,0.55)]', className)}
    >
      <div className="flex items-center gap-2.5 px-3 pb-2 pt-1.5 md:hidden">
        <NomitoAvatar size="sm" shape="icon" />
        <p aria-hidden="true" className="font-brand text-lg font-medium text-ink">
          Contale a Nomito
        </p>
      </div>

      <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-0">
        <div className="hidden shrink-0 items-center gap-3 py-1 pl-2 pr-4 md:flex">
          <NomitoAvatar size="md" shape="icon" />
          <span aria-hidden="true" className="font-brand text-lg font-medium leading-tight text-ink">
            Contale
            <br />a Nomito
          </span>
        </div>

        <div className={fieldClass}>
          <MapPinIcon className="h-5 w-5 shrink-0 text-terra" />
          <span className="min-w-0 flex-1">
            <label htmlFor={`${id}-destino`} className={labelClass}>
              Destino
            </label>
            <input
              id={`${id}-destino`}
              name="destino"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="Salta, Cafayate, Tilcara…"
              autoComplete="off"
              className={inputClass}
            />
          </span>
        </div>

        <span aria-hidden="true" className="mx-1 hidden h-9 w-px bg-sand md:block" />

        <div className={fieldClass}>
          <CalendarIcon className="h-5 w-5 shrink-0 text-terra" />
          <span className="min-w-0 flex-1">
            <label htmlFor={`${id}-fechas`} className={labelClass}>
              Fechas
            </label>
            <input
              id={`${id}-fechas`}
              name="fechas"
              value={fechas}
              onChange={(e) => setFechas(e.target.value)}
              placeholder="en julio, una semana"
              autoComplete="off"
              className={inputClass}
            />
          </span>
        </div>

        <span aria-hidden="true" className="mx-1 hidden h-9 w-px bg-sand md:block" />

        <div className={cn(fieldClass, 'md:flex-none')}>
          <UsersIcon className="h-5 w-5 shrink-0 text-terra" />
          <span className="min-w-0 flex-1">
            <span id={`${id}-viajeros`} className={labelClass}>
              Viajeros
            </span>
            <span role="group" aria-labelledby={`${id}-viajeros`} className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Un viajero menos"
                disabled={viajeros <= 1}
                onClick={() => setViajeros((n) => Math.max(1, n - 1))}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-sand text-ink transition-colors hover:border-terra disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra"
              >
                <MinusIcon className="h-3.5 w-3.5" />
              </button>
              <output aria-live="polite" className="w-5 text-center text-[15px] font-medium tabular-nums text-ink">
                {viajeros}
              </output>
              <button
                type="button"
                aria-label="Un viajero más"
                disabled={viajeros >= MAX_TRAVELERS}
                onClick={() => setViajeros((n) => Math.min(MAX_TRAVELERS, n + 1))}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-sand text-ink transition-colors hover:border-terra disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-terra"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          </span>
        </div>

        <button
          type="submit"
          className="mt-1 flex h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-terra px-6 text-base font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra md:ml-2 md:mt-0 md:w-14 md:px-0"
        >
          <span className="md:sr-only">Contale a Nomito</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </form>
  );
}
