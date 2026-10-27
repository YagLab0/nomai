import { NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  // Demo mode: no Supabase — there is no auth server to exchange codes with.
  const code = hasSupabaseEnv ? searchParams.get('code') : null;
  const next = searchParams.get('next') ?? '/app';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const travelerId = data?.user?.id;
      const accessToken = data?.session?.access_token;
      if (travelerId) {
        const apiUrl = process.env.NOMAI_API_URL ?? 'http://localhost:3001';
        fetch(`${apiUrl}/wallet/provision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ traveler_id: travelerId }),
        }).catch(() => null);
      }

      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';
      const target = next.startsWith('/') && !next.startsWith('//') ? next : '/app';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${target}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${target}`);
      } else {
        return NextResponse.redirect(`${origin}${target}`);
      }
    }
  }

  // Return user to login page with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
