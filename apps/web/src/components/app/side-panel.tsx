import { ReservasPanel } from '@/components/app/reservas-panel';
import { SaldoCard } from '@/components/app/saldo-card';
import { SolicitudesPanel } from '@/components/app/solicitudes-panel';

export function SidePanel() {
  return (
    <div className="flex flex-col gap-4">
      <SaldoCard />
      <SolicitudesPanel />
      <ReservasPanel />
    </div>
  );
}
