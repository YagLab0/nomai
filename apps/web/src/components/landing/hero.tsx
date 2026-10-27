import Image from 'next/image';
import Link from 'next/link';

import { MapPinIcon } from '@/components/icons';
import { HeroChat } from '@/components/landing/hero-chat';
import { Parallax } from '@/components/landing/parallax';
import { NomitoAvatar } from '@/components/nomito-avatar';
import { RIPIO_COUNTRIES_TEXT } from '@/lib/lodgings';
import { PHOTOS } from '@/lib/photos';

const photo = PHOTOS.humahuacaHornocal;


/**
 * First impression: the live chat with Nomito over a full-bleed Jujuy landscape.
 * Copy on the left, the chat (mascot riding its corner) on the right; on phones
 * the chat comes right after the headline so it shows above the fold.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden rounded-b-panel bg-ink text-paper">
      <Parallax factor={0.18} className="absolute inset-0 -z-20">
        <Image
          src={photo.src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-[1.2] object-cover object-[50%_35%]"
        />
      </Parallax>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/75 via-ink/55 to-ink/80 lg:bg-gradient-to-r lg:from-ink/85 lg:via-ink/55 lg:to-ink/25"
      />

      <div className="mx-auto grid max-w-7xl gap-x-14 px-4 pb-10 pt-6 sm:px-5 lg:grid-cols-[1fr_minmax(0,32rem)] lg:items-center lg:pb-16 lg:pt-12">
        <div className="flex flex-col">
          <p className="flex w-fit items-center gap-1.5 rounded-full bg-paper/12 px-3 py-1.5 text-sm text-paper/90 backdrop-blur">
            <MapPinIcon className="h-4 w-4 text-terra-soft" />
            Nacimos en Jujuy
          </p>
          <h1 className="brand-display mt-4 text-[2.6rem] font-medium leading-[0.98] sm:text-6xl lg:mt-6 lg:text-7xl">
            Viajá por Latinoamérica pagando en tu moneda
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-paper/85 sm:text-lg lg:mt-6">
            Contale a Nomito a dónde vas. Busca alojamiento, compara y reserva con el dueño. Vos pagás en
            pesos, reales o la moneda que uses, sin dólar tarjeta.
          </p>

          <div className="mt-8 hidden flex-wrap items-center gap-3 lg:flex">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center rounded-full bg-terra px-7 text-base font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
            >
              Hablar con Nomito
            </Link>
            <Link
              href="/#como-funciona"
              className="inline-flex h-12 items-center rounded-full border border-paper/40 px-7 text-base font-medium text-paper transition-colors hover:bg-paper/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
            >
              Cómo funciona
            </Link>
          </div>
          <p className="mt-8 hidden max-w-md text-sm text-paper/70 lg:block">En {RIPIO_COUNTRIES_TEXT}.</p>
        </div>

        <div className="relative mt-7 lg:mt-0">
          <NomitoAvatar
            size="lg"
            shape="icon"
            className="absolute -left-2 -top-5 z-20 h-16 w-16 shadow-[0_14px_30px_-10px_rgba(0,0,0,0.6)] ring-4 ring-paper sm:-top-6 sm:h-20 sm:w-20 lg:-left-6 lg:-top-8 lg:h-24 lg:w-24"
          />
          <HeroChat mascotOutside className="h-[26rem] sm:h-[34rem] lg:h-[38rem]" />
        </div>

        <div className="mt-6 flex flex-col items-start gap-3 lg:hidden">
          <Link
            href="/#como-funciona"
            className="rounded-md text-base font-medium text-paper underline decoration-paper/40 underline-offset-[6px] focus-visible:outline-2 focus-visible:outline-paper"
          >
            Cómo funciona
          </Link>
          <p className="text-sm text-paper/70">En {RIPIO_COUNTRIES_TEXT}.</p>
        </div>
      </div>
    </section>
  );
}
