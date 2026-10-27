import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// POST /api/oauth/decision — the consent form's target. Approves or denies
// the pending Supabase OAuth authorization and bounces the browser back to
// the third-party client with the returned redirect_url (code or error).
export async function POST(request: Request) {
  const form = await request.formData();
  const authorizationId = form.get('authorization_id');
  const decision = form.get('decision');

  if (typeof authorizationId !== 'string' || !authorizationId) {
    return NextResponse.json({ error: 'missing authorization_id' }, { status: 400 });
  }
  if (decision !== 'approve' && decision !== 'deny') {
    return NextResponse.json({ error: 'invalid decision' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);

  if (error || !data?.redirect_url) {
    return NextResponse.json(
      { error: error?.message ?? 'oauth decision failed' },
      { status: 400 },
    );
  }

  return NextResponse.redirect(data.redirect_url);
}
