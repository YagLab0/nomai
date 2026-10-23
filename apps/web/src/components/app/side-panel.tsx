import { BusquedasCard } from '@/components/app/busquedas-card';
import { MonedasCard } from '@/components/app/monedas-card';
import { ReservasCard } from '@/components/app/reservas-card';
import { SaldoCard } from '@/components/app/saldo-card';

export function SidePanel() {
  return (
    <div className="flex flex-col gap-4">
      <MonedasCard />
      <SaldoCard />
      <ReservasCard />
      <BusquedasCard />
    </div>
  );
}
