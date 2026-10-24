import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { OwnerDashboard } from '@/components/owners/owner-dashboard';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Panel del dueño · nomai' };

export default async function OwnerPanelPage() {
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
