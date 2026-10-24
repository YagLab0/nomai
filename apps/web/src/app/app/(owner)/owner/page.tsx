import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { OwnerCatalogPanel } from '@/components/owners/owner-catalog-panel';
import { OwnerDashboard } from '@/components/owners/owner-dashboard';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Panel del dueño · nomai' };

const hasSupabase = hasSupabaseEnv;

export default async function OwnerPanelPage() {
  // No Supabase: the browser catalog drives the panel, like the API's mock source.
  if (!hasSupabase) {
    return <OwnerCatalogPanel />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/app/owner');
  }

  return (
    <OwnerDashboard
      userId={user.id}
      userEmail={user.email}
      userName={user.user_metadata?.full_name || user.user_metadata?.name}
    />
  );
}
