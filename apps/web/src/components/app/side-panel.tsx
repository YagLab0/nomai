import { ReservasPanel } from '@/components/app/reservas-panel';
import { SaldoCard } from '@/components/app/saldo-card';

export function SidePanel() {
  return (
    <div className="flex flex-col gap-4">
      <SaldoCard />
      <ReservasPanel />
    </div>
  );
}
