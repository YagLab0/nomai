import Link from 'next/link';

import { HeroChat } from '@/components/landing/hero-chat';
import { NomitoAvatar } from '@/components/nomito-avatar';

const primary =
  'inline-flex h-12 items-center rounded-full bg-terra px-7 text-base font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra';
const secondary =
  'inline-flex h-12 items-center rounded-full border border-terra/40 px-7 text-base font-medium text-terra-deep transition-colors hover:bg-terra-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-agua-soft" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-20">
        <div>
          <h1 className="brand-display text-5xl font-medium leading-[1.02] text-ink sm:text-6xl lg:text-7xl">
            Nomito arma tu viaje al Norte. Vos pagás en tu moneda.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted">
            Contale a dónde, cuándo y con cuánto. Nomito busca, compara y reserva directo con el dueño: sin dólar tarjeta,
            sin comisiones escondidas.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className={primary}>
              Hablar con Nomito
            </Link>
            <Link href="/#como-funciona" className={secondary}>
              Cómo funciona
            </Link>
          </div>
        </div>

        <div className="relative lg:pl-6">
          <NomitoAvatar
            size="lg"
            className="absolute -left-3 -top-8 z-20 h-24 w-24 text-6xl shadow-[0_12px_30px_-8px_rgba(143,63,32,0.6)] lg:-left-8"
          />
          <HeroChat />
        </div>
      </div>
    </section>
  );
}
