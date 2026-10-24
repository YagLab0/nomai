import Image from 'next/image';
import Link from 'next/link';

import { Parallax } from '@/components/landing/parallax';
import { NomitoAvatar } from '@/components/nomito-avatar';
import { Reveal } from '@/components/reveal';
import { PHOTOS } from '@/lib/photos';

const photo = PHOTOS.salinasGrandes;

export function FinalCta() {
  return (
    <section className="px-4 py-20 sm:px-5 lg:py-28">
      <div className="relative mx-auto flex max-w-7xl flex-col items-center overflow-hidden rounded-panel px-5 py-20 text-center text-paper sm:py-28">
        <Parallax factor={0.16} className="absolute inset-0">
          <Image src={photo.src} alt="" fill sizes="(min-width: 1280px) 1240px, 100vw" className="scale-[1.2] object-cover" />
        </Parallax>
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-terra-deep/35 via-ink/45 to-ink/65" />
        <Reveal className="relative flex flex-col items-center">
          <NomitoAvatar size="lg" shape="icon" className="h-24 w-24" />
          <h2 className="brand-display mt-8 text-5xl font-medium leading-[0.95] sm:text-7xl">¿A dónde querés ir?</h2>
          <p className="mt-5 max-w-md text-lg text-paper/85">
            Nomito ya está esperando. Contale tu viaje y en un par de minutos tenés opciones.
          </p>
          <Link
            href="/signup"
            className="mt-9 inline-flex h-12 items-center rounded-full bg-terra px-8 text-base font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
          >
            Hablar con Nomito
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
