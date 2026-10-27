'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, toast } from '@heroui/react';

import { WidgetCard } from '@/components/app/widget-card';
import { formatBRL } from '@/lib/format';
import { traveler } from '@/lib/mock/traveler';
import { hasSupabaseEnv } from '@/lib/supabase/env';

interface WalletData {
  balance: number;
  currency: string;
  formatted: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; formatted: string };

const GENERIC_ERROR = 'No pudimos obtener tu saldo, probá de nuevo';

/**
 * Traveler's balance card (ADR-0003, Issue #16).
 *
 * Security & UX rules:
 * - Shows balance strictly in local fiat ("$ 120.000 ARS" or "R$ 1.920,00").
 * - The traveler NEVER touches web3 and NEVER sees the Celo hex address in the UI.
 * - An API or network failure is never shown as a $ 0 balance (#35).
 */
export function SaldoCard() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/wallet', { cache: 'no-store' });
      const data = (await res.json().catch(() => null)) as
        | (Partial<WalletData> & { error?: string })
        | null;
      if (res.ok && data?.formatted) {
        setState({ kind: 'ready', formatted: data.formatted });
      } else if (!hasSupabaseEnv && res.status === 401) {
        // Demo mode without Supabase is the only mock-balance fallback.
        setState({ kind: 'ready', formatted: formatBRL(traveler.saldoBRL, { withCode: true }) });
      } else {
        setState({
          kind: 'error',
          message:
            data?.error === 'wallet_unavailable'
              ? 'No pudimos preparar tu cuenta, probá de nuevo'
              : GENERIC_ERROR,
        });
      }
    } catch {
      setState({ kind: 'error', message: GENERIC_ERROR });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <WidgetCard title="Tu saldo">
      {state.kind === 'loading' && (
        <p
          aria-busy="true"
          aria-label="Cargando saldo"
          className="h-8 w-28 animate-pulse rounded bg-sand/50 motion-reduce:animate-none"
        />
      )}
      {state.kind === 'error' && <p className="text-sm text-ink-muted">{state.message}</p>}
      {state.kind === 'ready' && (
        <p data-testid="saldo-balance" className="font-mono text-2xl font-semibold text-ink">
          {state.formatted}
        </p>
      )}
      <p className="text-xs text-ink-muted">Saldo de Nomito para tus reservas.</p>
      {state.kind === 'error' ? (
        <Button variant="secondary" fullWidth onPress={load}>
          Reintentar
        </Button>
      ) : (
        <Button
          variant="secondary"
          fullWidth
          onPress={() => toast('Pronto vas a poder cargar con Ripio')}
        >
          Cargar
        </Button>
      )}
    </WidgetCard>
  );
}
