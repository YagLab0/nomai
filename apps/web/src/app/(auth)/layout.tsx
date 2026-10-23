import Image from 'next/image';
import Link from 'next/link';

import { NomitoAvatar } from '@/components/nomito-avatar';
import { PHOTOS } from '@/lib/photos';

const photo = PHOTOS.purmamarcaSieteColores;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-paper text-ink lg:grid-cols-2">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link
          href="/"
          className="flex w-fit items-center gap-2.5 rounded-xl font-brand text-2xl font-semibold tracking-tight text-terra-deep outline-none focus-visible:ring-2 focus-visible:ring-terra"
        >
          <NomitoAvatar size="sm" shape="icon" decorative />
          nomai
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {children}
        </div>
      </div>

      <aside aria-hidden="true" className="hidden p-4 lg:block">
        <div className="relative flex h-full flex-col justify-end overflow-hidden rounded-panel bg-terra p-12 text-paper">
          <Image src={photo.src} alt="" fill priority sizes="50vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-terra-deep via-terra-deep/55 to-terra-deep/5" />
          <div className="relative flex flex-col items-start gap-6">
            <NomitoAvatar size="lg" shape="icon" className="h-24 w-24" />
            <h2 className="brand-display max-w-sm text-5xl font-medium leading-[0.95]">Contale tu viaje a Nomito</h2>
            <p className="max-w-xs text-lg leading-relaxed text-paper/85">
              Dónde, cuándo y con cuánto. Él busca, compara y se ocupa del resto.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
