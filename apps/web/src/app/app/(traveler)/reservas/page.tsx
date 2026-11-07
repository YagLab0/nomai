import type { Metadata } from 'next';

import { ReservasPanel } from '@/components/app/reservas-panel';
import { SolicitudesPanel } from '@/components/app/solicitudes-panel';

export const metadata: Metadata = { title: 'Mis reservas · nomai' };

export default function AppReservasPage() {
  return (
    <div className="h-full overflow-y-auto px-5 py-6">
      <h1 className="brand-display text-3xl font-medium text-ink">Mis reservas</h1>
      <p className="mb-6 mt-1 text-ink-muted">
        Tus pedidos por confirmar y tus reservas, todo en un lugar.
      </p>
      <div className="flex max-w-2xl flex-col gap-4">
        <SolicitudesPanel />
        <ReservasPanel />
      </div>
    </div>
  );
}
