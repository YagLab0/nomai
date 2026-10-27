'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@heroui/react';

import { FundingStep } from '@/components/app/funding-step';
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
  | { kind: 'ready'; lines: string[]; countryCode: string | null };

const GENERIC_ERROR = 'No pudimos obtener tu saldo, probá de nuevo';
const CURRENCY_UNAVAILABLE = 'La carga todavía no está disponible';

/**
 * Traveler's balance card (ADR-0003, issues #16, #39 and #40).
 *
 * Security & UX rules:
 * - Lists the Agent wallet's wFIAT balances, each formatted as its own fiat
 *   ("$ 95.000 ARS", "R$ 500 BRL") — wFIAT is backed 1:1, no conversion.
 * - The Traveler's country wFIAT always shows, even at $ 0; any other wFIAT
 *   shows only when it holds a positive balance. No country is required.
 * - "Cargar" opens the Funding step: amount + wFIAT (+ payer country the
 *   first time only), then the Ripio ramp in a NEW TAB. Coming back to this
 *   tab re-reads the saldo; "Actualizar" does it on demand.
 * - The traveler NEVER touches web3 and NEVER sees the Celo hex address in
 *   the UI — it exists only inside the ramp URL the new tab opens.
 * - An API or network failure is never shown as a $ 0 balance (#35).
 */
export function SaldoCard() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [funding, setFunding] = useState(false);
  /** A ramp link was opened: refocus re-reads the saldo + "Actualizar" shows. */
  const [linkOpened, setLinkOpened] = useState(false);

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
          countryCode: data.country_code ?? null,
          lines: visible.map((b) => formatFiat(Number(b.amount), b.currency)),
        });
      } else if (!hasSupabaseEnv && res.status === 401) {
        // Demo mode without Supabase is the only mock-balance fallback.
        setState({ kind: 'ready', countryCode: null, lines: [formatBRL(traveler.saldoBRL, { withCode: true })] });
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

  // Once a ramp link was opened, returning to the nomai tab re-reads the
  // saldo — the Funding may already be on-chain.
  useEffect(() => {
    if (!linkOpened) return;
    const refresh = () => void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [linkOpened, load]);

  return (
    <WidgetCard title="Tu saldo">
      {state.kind === 'ready' && funding ? (
        <FundingStep
          countryCode={state.countryCode}
          onOpened={() => {
            setFunding(false);
            setLinkOpened(true);
          }}
          onCancel={() => setFunding(false)}
        />
      ) : (
        <>
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
          {linkOpened && (
            <p className="text-xs text-ink-muted">
              Terminá la carga en la pestaña de Ripio — tu saldo se actualiza solo al volver.
            </p>
          )}
          {state.kind === 'error' ? (
            <Button variant="secondary" fullWidth onPress={load}>
              Reintentar
            </Button>
          ) : state.kind === 'unavailable' ? null : (
            <>
              {linkOpened && (
                <Button variant="secondary" fullWidth onPress={load}>
                  Actualizar
                </Button>
              )}
              <Button variant="secondary" fullWidth onPress={() => setFunding(true)}>
                Cargar
              </Button>
            </>
          )}
        </>
      )}
    </WidgetCard>
  );
}
