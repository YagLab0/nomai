import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

/**
 * GET /api/wallet - Returns the Traveler's Agent wallet balance in local fiat.
 *
 * Security constraint (ADR-0003, Issue #16):
 * The Traveler never touches web3 and never sees the hex address in UI.
 * Address is strictly server-side; this endpoint returns only the fiat balance.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Read traveler profile to check country_code
    const { data: traveler } = await supabase
      .from('travelers')
      .select('country_code')
      .eq('id', user.id)
      .maybeSingle();

    const currency = traveler?.country_code === 'BR' ? 'BRL' : 'ARS';

    // Verify / ensure agent_wallet exists (RLS ensures user only sees their own)
    const { data: wallet } = await supabase
      .from('agent_wallets')
      .select('id, network')
      .eq('traveler_id', user.id)
      .maybeSingle();

    if (!wallet) {
      // Auto-provision via API
      await fetch(`${API_URL}/wallet/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traveler_id: user.id }),
      }).catch(() => null);
    }

    // Fetch on-chain balance via API
    let balanceNumber = 0;
    try {
      const res = await fetch(`${API_URL}/wallet/${user.id}`, { cache: 'no-store' });
      if (res.ok) {
        const info = await res.json();
        balanceNumber = parseFloat(info.balance ?? '0') || 0;
      }
    } catch {
      // Fallback if API is offline
    }

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
