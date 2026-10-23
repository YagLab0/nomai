'use client';

import { Button, toast } from '@heroui/react';

import { WidgetCard } from '@/components/app/widget-card';
import { formatBRL } from '@/lib/format';
import { traveler } from '@/lib/mock/traveler';

export function SaldoCard() {
  return (
    <WidgetCard title="Tu saldo">
      <p className="font-mono text-2xl font-semibold text-ink">{formatBRL(traveler.saldoBRL, { withCode: true })}</p>
      <p className="text-xs text-ink-muted">Saldo de Nomito para tus reservas.</p>
      <Button
        variant="secondary"
        fullWidth
        onPress={() => toast('Pronto vas a poder cargar con Ripio')}
      >
        Cargar
      </Button>
    </WidgetCard>
  );
}
