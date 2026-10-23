import type { Metadata } from 'next';

import { LodgingExplorer } from '@/components/marketplace/lodging-explorer';

export const metadata: Metadata = {
  title: 'Alojamientos · nomai',
  description:
    'Alojamientos de dueños verificados en Argentina, Brasil, Chile, Colombia, México y Uruguay. Pagás en tu moneda, directo al dueño, sin comisión.',
};

export default function LodgingsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-5 md:pt-14">
      <header className="mb-10 max-w-2xl">
        <h1 className="brand-display text-6xl font-medium leading-[0.9] tracking-[-0.03em] text-ink sm:text-7xl">Alojamientos</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-muted">
          Cada alojamiento es de un dueño. Elegí uno y pedile a Nomito que lo reserve: pagás en tu moneda y el pago va
          directo al dueño, sin comisión.
        </p>
      </header>
      <LodgingExplorer mode="public" />
    </div>
  );
}
