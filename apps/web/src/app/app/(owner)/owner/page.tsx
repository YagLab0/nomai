import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Panel · nomai' };

export default function OwnerPanelPage() {
  return <h1 className="brand-display text-3xl font-medium text-ink">Panel</h1>;
}
