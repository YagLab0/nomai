import Link from 'next/link';

import { NomitoAvatar } from '@/components/nomito-avatar';

export function FinalCta() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-5 py-24 text-center lg:py-32">
      <NomitoAvatar size="lg" />
      <h2 className="brand-display mt-8 text-4xl font-medium leading-tight text-ink sm:text-5xl">
        ¿A dónde querés ir?
      </h2>
      <p className="mt-4 max-w-md text-lg text-ink-muted">
        Nomito ya está esperando. Contale tu viaje y en un par de minutos tenés opciones.
      </p>
      <Link
        href="/signup"
        className="mt-8 inline-flex h-12 items-center rounded-full bg-terra px-8 text-base font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
      >
        Hablar con Nomito
      </Link>
    </section>
  );
}
