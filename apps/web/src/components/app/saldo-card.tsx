'use client';

import { useEffect, useState } from 'react';
import { Button, toast } from '@heroui/react';

import { WidgetCard } from '@/components/app/widget-card';
import { formatBRL } from '@/lib/format';
import { traveler } from '@/lib/mock/traveler';

interface WalletData {
  balance: number;
  currency: string;
  formatted: string;
}

/**
 * Traveler's balance card (ADR-0003, Issue #16).
 *
 * Security & UX rules:
 * - Shows balance strictly in local fiat ("$ 120.000 ARS" or "R$ 1.920,00").
 * - The traveler NEVER touches web3 and NEVER sees the Celo hex address in the UI.
 */
export function SaldoCard() {
  const [wallet, setWallet] = useState<WalletData | null>(null);

  useEffect(() => {
    fetch('/api/wallet')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: WalletData | null) => {
        if (data?.formatted) {
          setWallet(data);
        }
      })
      .catch(() => null);
  }, []);

  const displayBalance = wallet?.formatted ?? formatBRL(traveler.saldoBRL, { withCode: true });

  return (
    <WidgetCard title="Tu saldo">
      <p className="font-mono text-2xl font-semibold text-ink">{displayBalance}</p>
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
