'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, toast } from '@heroui/react';

import { WidgetCard } from '@/components/app/widget-card';
import { formatBRL, formatFiat } from '@/lib/format';
import { traveler } from '@/lib/mock/traveler';
import { hasSupabaseEnv } from '@/lib/supabase/env';

interface WalletBalance {
  currency: string;
  amount: string;
  country: string;
}

interface WalletData {
  country_code: string | null;
  balances: WalletBalance[];
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unavailable' }
  | { kind: 'ready'; lines: string[] };

const GENERIC_ERROR = 'No pudimos obtener tu saldo, probá de nuevo';
const CURRENCY_UNAVAILABLE = 'La carga todavía no está disponible';

/**
 * Traveler's balance card (ADR-0003, issues #16 and #39).
 *
 * Security & UX rules:
 * - Lists the Agent wallet's wFIAT balances, each formatted as its own fiat
 *   ("$ 95.000 ARS", "R$ 500 BRL") — wFIAT is backed 1:1, no conversion.
 * - The Traveler's country wFIAT always shows, even at $ 0; any other wFIAT
 *   shows only when it holds a positive balance. No country is required.
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
      if (res.ok && Array.isArray(data?.balances)) {
        const visible = data.balances.filter(
          (b) => b.country === data.country_code || Number(b.amount) > 0,
        );
        setState({
          kind: 'ready',
          lines: visible.map((b) => formatFiat(Number(b.amount), b.currency)),
        });
      } else if (!hasSupabaseEnv && res.status === 401) {
        // Demo mode without Supabase is the only mock-balance fallback.
        setState({ kind: 'ready', lines: [formatBRL(traveler.saldoBRL, { withCode: true })] });
      } else if (data?.error === 'currency_unavailable') {
        setState({ kind: 'unavailable' });
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
      {state.kind === 'unavailable' && (
        <p className="text-sm text-ink-muted">{CURRENCY_UNAVAILABLE}</p>
      )}
      {state.kind === 'ready' &&
        (state.lines.length > 0 ? (
          <ul>
            {state.lines.map((line) => (
              <li
                key={line}
                data-testid="saldo-balance"
                className="font-mono text-2xl font-semibold text-ink"
              >
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Aún no tenés saldo.</p>
        ))}
      <p className="text-xs text-ink-muted">Saldo de Nomito para tus reservas.</p>
      {state.kind === 'error' ? (
        <Button variant="secondary" fullWidth onPress={load}>
          Reintentar
        </Button>
      ) : state.kind === 'unavailable' ? null : (
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
