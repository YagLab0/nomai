import Link from 'next/link';

import { HeroChat } from '@/components/landing/hero-chat';
import { NomitoAvatar } from '@/components/nomito-avatar';

/** The scripted Lucas conversation, playing on its own (see hero-chat.tsx). */
export function NomitoDemo() {
  return (
    <section id="nomito-en-accion" className="scroll-mt-20 px-4 sm:px-5">
      <div className="mx-auto grid max-w-7xl items-center gap-12 rounded-panel bg-terra-soft px-5 py-14 sm:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-16 lg:py-20">
        <div>
          <NomitoAvatar size="lg" shape="icon" className="h-24 w-24" />
          <h2 className="brand-display mt-8 text-5xl font-medium leading-[0.95] text-ink sm:text-6xl">
            Mirá a Nomito en acción
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink">
            Lucas viene de Florianópolis con su pareja. Le contó a Nomito qué buscaba y en dos mensajes tuvo la casa
            reservada en Cafayate, pagada en reales, directo al dueño.
          </p>
          <p className="mt-4 max-w-md leading-relaxed text-ink-muted">
            La comisión por cambiar reales a pesos aparece en su propia línea, antes de confirmar. Nada escondido en el
            tipo de cambio.
          </p>
          <Link
            href="/signup"
            className="mt-9 inline-flex h-12 items-center rounded-full bg-terra px-7 text-base font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
          >
            Hablar con Nomito
          </Link>
        </div>

        <HeroChat />
      </div>
    </section>
  );
}
