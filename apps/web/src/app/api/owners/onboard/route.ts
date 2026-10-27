import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { proxyOwnerRequest } from '../proxy';

export const dynamic = 'force-dynamic';

/**
 * GET returns the caller's business (user-session read; RLS scopes it).
 * POST proxies to POST {NOMAI_API_URL}/owners/onboard — the onboarding
 * actions (claim, update-payout, create business + property + draft
 * listing) run in apps/api, which holds the secret key now; the user-scoped
 * inserts still execute under the caller's RLS there.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ business: null }, { status: 401 });
    }

    const { data: business, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ business });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return proxyOwnerRequest(request, '/owners/onboard');
}
