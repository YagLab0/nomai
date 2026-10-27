import type { Metadata } from 'next';
import Image from 'next/image';

import { OwnerJoin } from '@/components/owners/owner-join';
import { PHOTOS } from '@/lib/photos';

export const metadata: Metadata = {
  title: 'Sumá tu alojamiento · nomai',
  description:
    'Sumá tu alojamiento a nomai: los viajeros llegan con Nomito y cobrás cada reserva en tu cuenta de Ripio, sin comisión.',
};

const photo = PHOTOS.purmamarcaAdobe;

export default function OwnerJoinPage() {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-24 pt-10 sm:px-5 md:pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
      <div className="min-w-0">
        <h1 className="brand-display text-6xl font-medium leading-[0.9] tracking-[-0.03em] text-ink sm:text-7xl">
          Sumá tu alojamiento
        </h1>
        <p className="mb-10 mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
          Cuatro pasos y listo. Los viajeros llegan con Nomito y cada reserva se libera en tu cuenta de Ripio por
          etapas. Cero comisión, siempre.
        </p>
        <OwnerJoin />
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 overflow-hidden rounded-panel bg-ink text-paper">
          <div className="relative h-80">
            <Image src={photo.src} alt={photo.alt} fill sizes="35vw" className="object-cover" />
          </div>
          <div className="p-8">
            <p className="brand-display text-4xl font-medium leading-[0.95]">Cero comisión. Siempre.</p>
            <p className="mt-4 leading-relaxed text-paper/75">
              No te cobramos por publicar ni por reservar. Ganamos cuando Nomito trabaja para el viajero, nunca de tu
              precio.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
