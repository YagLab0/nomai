import type { Metadata } from 'next';

import { Thread } from '@/components/app/chat/thread';

export const metadata: Metadata = { title: 'Nomito · nomai' };

export default function AppHomePage() {
  return <Thread />;
}
