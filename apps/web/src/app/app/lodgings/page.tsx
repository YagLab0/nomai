import type { Metadata } from 'next';

import { LodgingExplorer } from '@/components/marketplace/lodging-explorer';

export const metadata: Metadata = { title: 'Explorar · nomai' };

export default function AppLodgingsPage() {
  return (
    <div className="h-full overflow-y-auto px-5 py-6">
      <h1 className="brand-display text-3xl font-medium text-ink">Explorar</h1>
      <p className="mb-6 mt-1 text-ink-muted">Elegí uno y pedile a Nomito que lo reserve.</p>
      <LodgingExplorer mode="app" />
    </div>
  );
}
