import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export async function POST() {
  // Demo mode: no Supabase — nothing to provision.
  if (!hasSupabaseEnv) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // A wallet can only be provisioned for the signed-in Traveler — the
    // session user id IS the traveler id. Any traveler_id in the request
    // body is ignored (previously it let anyone provision wallets for
    // arbitrary ids — see decisions D6).
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const res = await fetch(`${API_URL}/wallet/provision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The API verifies the Traveler via Bearer token (src/auth.ts).
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ traveler_id: user.id }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      ok: true,
      provisioned: true,
      network: data.wallet?.network ?? 'celo-sepolia',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
