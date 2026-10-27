import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/**
 * GET /api/wallet - Returns the Traveler's Agent wallet balance in local fiat.
 *
 * Security constraint (ADR-0003, Issue #16):
 * The Traveler never touches web3 and never sees the hex address in UI.
 * Address is strictly server-side; this endpoint returns only the fiat balance.
 *
 * The Supabase access token rides as `Authorization: Bearer` (same contract as
 * /credits/*). The API creates the Agent wallet on this first read (#33) and
 * answers failures with stable codes (`wallet_unavailable`, `rpc_unreachable`),
 * which we propagate untouched — an error never becomes a fabricated zero.
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

    // Read traveler profile to check country_code
    const { data: traveler } = await supabase
      .from('travelers')
      .select('country_code')
      .eq('id', user.id)
      .maybeSingle();

    const currency = traveler?.country_code === 'BR' ? 'BRL' : 'ARS';

    // Fetch on-chain balance via API
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

    const info = await upstream.json();
    const balanceNumber = parseFloat(info.balance ?? '0') || 0;

    const formatted =
      currency === 'BRL'
        ? `R$ ${balanceNumber.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$ ${balanceNumber.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;

    return NextResponse.json({
      balance: balanceNumber,
      currency,
      formatted,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
