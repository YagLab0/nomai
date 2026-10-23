import Image from 'next/image';
import Link from 'next/link';

import { AskBar } from '@/components/landing/ask-bar';
import { MapPinIcon } from '@/components/icons';
import { PHOTOS } from '@/lib/photos';

const photo = PHOTOS.purmamarcaAdobe;

/**
 * "el Norte" set huge, a rounded photo card riding over its lower edge, and the
 * Contale a Nomito bar floating on the photo (below it on phones).
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-5 lg:pt-12">
        <h1 className="text-center text-ink">
          <span className="block text-lg text-ink-muted sm:text-xl">Nomito te arma el viaje a</span>
          <span className="brand-display block whitespace-nowrap text-[clamp(5rem,20vw,17rem)] font-medium leading-[0.9] tracking-[-0.05em]">
            el Norte
          </span>
        </h1>

        <div className="relative z-10 -mt-[clamp(0.6rem,2.4vw,2.1rem)]">
          <div className="relative h-[24rem] overflow-hidden rounded-panel sm:h-[30rem] lg:h-[36rem]">
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              priority
              sizes="(min-width: 1280px) 1240px, 100vw"
              className="object-cover object-[50%_60%]"
            />
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink/45 to-transparent" />
            <p className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-paper/90 px-3 py-1.5 text-sm font-medium text-ink backdrop-blur sm:left-6 sm:top-6">
              <MapPinIcon className="h-4 w-4 text-terra" />
              Purmamarca, Jujuy
            </p>
          </div>

          <AskBar className="relative mx-3 -mt-16 sm:mx-6 md:absolute md:inset-x-6 md:bottom-6 md:mx-0 md:mt-0 lg:inset-x-auto lg:left-1/2 lg:w-[58rem] lg:-translate-x-1/2" />
        </div>

        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 pb-16 pt-10 text-center lg:pb-24 lg:pt-14">
          <p className="text-lg leading-relaxed text-ink-muted sm:text-xl">
            Contale a dónde, cuándo y con quién. Nomito busca, compara y reserva directo con el dueño. Vos pagás en tu
            moneda, sin dólar tarjeta.
          </p>
          <Link
            href="/#nomito-en-accion"
            className="rounded-md text-base font-medium text-terra-deep underline decoration-terra/40 underline-offset-[6px] transition-colors hover:decoration-terra focus-visible:outline-2 focus-visible:outline-terra"
          >
            Mirá cómo lo hace
          </Link>
        </div>
      </div>
    </section>
  );
}
