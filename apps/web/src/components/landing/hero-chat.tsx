'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { NomitoAvatar } from '@/components/nomito-avatar';
import { ASK_PARAM } from '@/lib/nomito/ask';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/format';
import { CASA_DE_ADOBE, formatLocalPrice, nightlyBRL, quoteFor } from '@/lib/lodgings';

const lodging = CASA_DE_ADOBE;
const quote = quoteFor(lodging);

const ASK = 'Hola Nomito. Somos 2, venimos desde Florianópolis. Queremos una semana en Salta y Cafayate.';
const PICK = 'Esa. Reservala por 3 noches.';

type Stage = 'ask' | 'dots1' | 'reply' | 'ticket' | 'pick' | 'dots2' | 'quote' | 'done';
const ORDER: Stage[] = ['ask', 'dots1', 'reply', 'ticket', 'pick', 'dots2', 'quote', 'done'];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function Dots() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-tl-md bg-terra-soft px-4 py-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-terra-deep/60"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </div>
  );
}

function Row({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return <div className="animate-[rise_0.45s_ease-out]">{children}</div>;
}

/** The chat's real input: whatever the Traveler types becomes their first message, via sign-up. */
function Composer() {
  const router = useRouter();
  const [text, setText] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const ask = text.trim() || 'Hola Nomito, quiero armar un viaje.';
    router.push(`/signup?${ASK_PARAM}=${encodeURIComponent(ask)}`);
  }

  return (
    <form onSubmit={submit} aria-label="Contale a Nomito" className="border-t border-sand bg-white p-2.5">
      <div className="flex items-center gap-2 rounded-full border border-sand bg-paper py-1.5 pl-4 pr-1.5 focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
        <label htmlFor="hero-ask" className="sr-only">
          Contale a Nomito a dónde querés ir
        </label>
        <input
          id="hero-ask"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Contale a Nomito a dónde querés ir…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-muted focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Enviar a Nomito"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-terra text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </form>
  );
}

/**
 * The landing's centerpiece: the scripted Lucas conversation (§4 scenario)
 * plays on a loop above a real composer that sends to /signup?ask=.
 */
export function HeroChat({
  className,
  mascotOutside = false,
}: {
  className?: string;
  /** A big mascot sits on the top-left corner (hero): leave it room, skip the small one. */
  mascotOutside?: boolean;
}) {
  // Server render and reduced motion both show the finished conversation.
  const [stage, setStage] = useState<Stage>('done');
  const [typed, setTyped] = useState(ASK);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let alive = true;
    const go = async (s: Stage, ms: number) => {
      setStage(s);
      await wait(ms);
      return alive;
    };
    (async () => {
      while (alive) {
        setStage('ask');
        setTyped('');
        for (let i = 1; i <= ASK.length; i++) {
          setTyped(ASK.slice(0, i));
          await wait(26);
          if (!alive) return;
        }
        await wait(300);
        if (!(await go('dots1', 1300))) return;
        if (!(await go('reply', 1100))) return;
        if (!(await go('ticket', 1900))) return;
        if (!(await go('pick', 700))) return;
        if (!(await go('dots2', 1300))) return;
        if (!(await go('quote', 2600))) return;
        if (!(await go('done', 5500))) return;
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const at = (s: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(s);
  const text = stage === 'done' || stage !== 'ask' ? ASK : typed;

  return (
    <div
      className={cn(
        'relative flex h-[600px] flex-col overflow-hidden rounded-card bg-paper shadow-[0_40px_80px_-30px_rgba(42,30,23,0.65)]',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 border-b border-sand bg-white py-3.5 pr-5',
          mascotOutside ? 'pl-[4.75rem] sm:pl-[5.75rem]' : 'pl-5',
        )}
      >
        {!mascotOutside && <NomitoAvatar size="md" shape="icon" />}
        <div className="leading-tight">
          <p className="font-brand text-lg font-medium text-ink">Nomito</p>
          <p className="text-xs text-ink-muted">Te busca alojamiento en Latinoamérica</p>
        </div>
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 text-xs text-agua sm:flex">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-agua" />
          en línea
        </span>
      </div>

      <div
        role="group"
        aria-label="Ejemplo de conversación entre Lucas y Nomito"
        className="relative flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-4 pb-4 pt-10 text-[15px]"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-paper to-transparent" />

        <Row show={at('ask')}>
          <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-terra px-4 py-2.5 text-paper">
            {text}
            {stage === 'ask' && <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-paper" />}
          </p>
        </Row>

        {stage === 'dots1' && <Dots />}

        <Row show={at('reply')}>
          <p className="w-fit max-w-[88%] rounded-2xl rounded-tl-md bg-terra-soft px-4 py-2.5 text-ink">
            Dale, Lucas. Miré lo que hay y esta casa en Cafayate es la que mejor te queda, directo con el dueño.
          </p>
        </Row>

        <Row show={at('ticket')}>
          <div className="flex overflow-hidden rounded-2xl border border-sand bg-white">
            <div className="min-w-0 flex-1 p-3.5">
              <p className="font-brand text-base font-medium leading-tight text-ink">{lodging.name}</p>
              <p className="text-xs text-ink-muted">{lodging.city}</p>
              <span className="mt-2 inline-flex rounded-full bg-agua-soft px-2 py-0.5 text-xs font-medium text-agua">
                directo con el dueño
              </span>
            </div>
            <div className="relative flex w-28 flex-col items-center justify-center gap-0.5 border-l-2 border-dashed border-sand p-3 text-center">
              <span aria-hidden="true" className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-paper" />
              <span aria-hidden="true" className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-paper" />
              <span className="font-mono text-[11px] tracking-widest text-ink-muted">FLN → {lodging.code}</span>
              <span className="font-mono text-sm font-semibold text-ink">{formatLocalPrice(lodging)}</span>
              <span className="font-mono text-[11px] text-ink-muted">≈ {formatBRL(nightlyBRL(lodging))} / noche</span>
            </div>
          </div>
        </Row>

        <Row show={at('pick')}>
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-terra px-4 py-2.5 text-paper">{PICK}</p>
        </Row>

        {stage === 'dots2' && <Dots />}

        <Row show={at('quote')}>
          <div className="rounded-2xl border border-sand bg-white">
            <dl className="divide-y divide-sand px-3.5">
              {quote.lines.map((l) => (
                <div key={l.label} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                  <dt className={l.kind === 'fee' ? 'text-terra-deep' : l.kind === 'total' ? 'font-semibold text-ink' : 'text-ink-muted'}>
                    {l.label}
                  </dt>
                  <dd className={`shrink-0 font-mono ${l.kind === 'total' ? 'font-semibold text-ink' : 'text-ink'}`}>{l.value}</dd>
                </div>
              ))}
            </dl>
            {at('done') && (
              <p className="m-2 flex animate-[rise_0.45s_ease-out] items-center gap-2 rounded-xl bg-agua-soft px-3 py-2 text-[13px] font-medium text-agua">
                <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-agua text-[10px] text-white">✓</span>
                Reserva confirmada · pagada directo al dueño
              </p>
            )}
          </div>
        </Row>
      </div>

      <Composer />
    </div>
  );
}
