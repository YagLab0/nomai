'use client';

import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { Toast } from '@heroui/react';

import { BookingQuoteTool } from '@/components/app/chat/booking-quote-tool';
import { ShortlistTool } from '@/components/app/chat/shortlist-tool';
import { MobileBar } from '@/components/app/mobile-bar';
import { Logo, NavList, UserChip } from '@/components/app/nav-list';
import { SidePanel } from '@/components/app/side-panel';
import { eveAdapter } from '@/lib/nomito/eve-adapter';
import { mockAdapter } from '@/lib/nomito/mock-adapter';

export function AppShell({ children }: { children: React.ReactNode }) {
  // 'mock' keeps the fake path for demos/tests; the real eve agent is the default.
  const adapter =
    process.env.NEXT_PUBLIC_NOMAI_CHAT_BACKEND === 'mock' ? mockAdapter : eveAdapter;
  const runtime = useLocalRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ShortlistTool />
      <BookingQuoteTool />
      <Toast.Provider />
      <div className="flex h-dvh flex-col bg-paper text-ink lg:flex-row">
        <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-sand p-5 lg:flex">
          <div className="flex flex-col gap-8">
            <Logo />
            <NavList />
          </div>
          <UserChip />
        </aside>
        <MobileBar />
        <main className="min-h-0 min-w-0 flex-1">{children}</main>
        <aside
          aria-label="Tu cuenta"
          className="hidden w-80 shrink-0 overflow-y-auto border-l border-sand bg-paper p-5 lg:block"
        >
          <SidePanel />
        </aside>
      </div>
    </AssistantRuntimeProvider>
  );
}
