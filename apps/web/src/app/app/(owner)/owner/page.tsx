import type { Metadata } from 'next';

import { OwnerDashboard } from '@/components/owners/owner-dashboard';

export const metadata: Metadata = { title: 'Panel · nomai' };

export default function OwnerPanelPage() {
  return <OwnerDashboard />;
}
