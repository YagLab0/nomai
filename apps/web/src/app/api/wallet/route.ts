import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/**
 * GET /api/wallet - Returns the Traveler's Agent wallet wFIAT balances.
 *
 * Security constraint (ADR-0003, Issue #16):
 * The Traveler never touches web3 and never sees the hex address in UI.
 * The API answers `{ country_code, network, balances }` — each balance a
 * `{ token, currency, country, amount }` decimal string in fiat terms (wFIAT
 * is backed 1:1, no conversion). We strip the address before forwarding.
 *
 * The Supabase access token rides as `Authorization: Bearer` (same contract as
 * /credits/*). The API creates the Agent wallet on this first read (#33) and
 * answers failures with stable codes (`wallet_unavailable`, `rpc_unreachable`,
 * `currency_unavailable` — #39), which we propagate untouched: an error never
 * becomes a fabricated zero.
 */
export async function GET() {
  // Demo mode: no Supabase — the saldo card falls back to the mock balance.
  if (!hasSupabaseEnv) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!user || !session?.access_token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch on-chain wFIAT balances via API
    let upstream: Response;
    try {
      upstream = await fetch(`${API_URL}/wallet/${user.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
    } catch {
      return NextResponse.json({ error: 'wallet_api_unreachable' }, { status: 502 });
    }

    if (!upstream.ok) {
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
      });
    }

    const info = (await upstream.json()) as {
      country_code?: string | null;
      network?: string;
      balances?: { token: string; currency: string; country: string; amount: string }[];
    };

    return NextResponse.json({
      ok: true,
      country_code: info.country_code ?? null,
      network: info.network,
      balances: info.balances ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
