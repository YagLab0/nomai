import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const API_URL = process.env.NOMAI_API_URL ?? 'http://localhost:3001';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = (await request.json().catch(() => ({}))) as { traveler_id?: string };
    const travelerId = user?.id || body.traveler_id;

    if (!travelerId) {
      return NextResponse.json(
        { error: 'traveler_id or active session required' },
        { status: 400 }
      );
    }

    const res = await fetch(`${API_URL}/wallet/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ traveler_id: travelerId }),
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
