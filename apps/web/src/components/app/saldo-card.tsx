'use client';

import { Button, toast } from '@heroui/react';

import { WidgetCard } from '@/components/app/widget-card';
import { formatBRL } from '@/lib/format';
import { fundingMethod } from '@/lib/lodgings';
import { traveler } from '@/lib/mock/traveler';

const LOAD_COPY = {
  ramp: 'Pronto vas a poder cargar con Ripio',
  qr: 'Pronto vas a poder cargar por transferencia (QR) — hace falta una wallet, Ripio u otra',
} as const;

export function SaldoCard() {
  const method = fundingMethod(traveler.countryCode);
  return (
    <WidgetCard title="Tu saldo">
      <p className="font-mono text-2xl font-semibold text-ink">{formatBRL(traveler.saldoBRL, { withCode: true })}</p>
      <p className="text-xs text-ink-muted">Saldo de Nomito para tus reservas.</p>
      <Button
        variant="secondary"
        fullWidth
        onPress={() => toast(LOAD_COPY[method])}
      >
        Cargar
      </Button>
    </WidgetCard>
  );
}
