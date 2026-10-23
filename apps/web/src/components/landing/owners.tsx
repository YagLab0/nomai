import Image from 'next/image';
import Link from 'next/link';

import { PHOTOS } from '@/lib/photos';

const POINTS = [
  {
    title: 'Cobrás al instante, en tu moneda',
    text: 'Sin esperar 30 o 60 días. La reserva se paga directo a tu cuenta de Ripio.',
  },
  {
    title: 'Importamos tu perfil',
    text: 'Traemos tu alojamiento desde Booking o Airbnb; no cargás nada dos veces.',
  },
  {
    title: 'La reserva se confirma sola',
    text: 'A cualquier hora, el pago confirma la reserva. Vos solo recibís al viajero.',
  },
];

const photo = PHOTOS.tilcaraPatio;

export function Owners() {
  return (
    <section id="duenos" className="scroll-mt-20 px-4 sm:px-5">
      <div className="mx-auto grid max-w-7xl overflow-hidden rounded-panel bg-ink text-paper lg:grid-cols-[1.1fr_0.9fr]">
        <div className="px-5 py-14 sm:px-10 lg:px-16 lg:py-20">
          <p className="text-lg text-agua-soft">Para dueños de alojamientos</p>
          <h2 className="brand-display mt-3 text-5xl font-medium leading-[0.95] sm:text-6xl">Cero comisión. Siempre.</h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-paper/70">
            Si tenés un alojamiento en Argentina, Brasil, Chile, Colombia, México o Uruguay: los viajeros llegan con
            Nomito, pagan en su moneda y vos cobrás lo que pusiste de precio.
          </p>
          <ul className="mt-10 flex flex-col divide-y divide-paper/15 border-y border-paper/15">
            {POINTS.map((p) => (
              <li key={p.title} className="py-5">
                <h3 className="font-brand text-xl font-medium">{p.title}</h3>
                <p className="mt-1.5 text-paper/70">{p.text}</p>
              </li>
            ))}
          </ul>
          <Link
            href="/owners/join"
            className="mt-10 inline-flex h-12 items-center rounded-full bg-paper px-7 text-base font-medium text-ink transition-colors hover:bg-terra-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
          >
            Sumá tu alojamiento
          </Link>
        </div>
        <div className="relative min-h-72 lg:min-h-full">
          <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
        </div>
      </div>
    </section>
  );
}
