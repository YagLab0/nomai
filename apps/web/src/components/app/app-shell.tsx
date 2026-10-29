'use client';

import {
  AssistantRuntimeProvider,
  InMemoryThreadListAdapter,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from '@assistant-ui/react';
import { Toast } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { BookingQuoteTool } from '@/components/app/chat/booking-quote-tool';
import { ChatList } from '@/components/app/chat/chat-list';
import { useNomitoThreadRuntime } from '@/components/app/chat/nomito-runtime';
import { ShortlistTool } from '@/components/app/chat/shortlist-tool';
import { MobileBar } from '@/components/app/mobile-bar';
import { Logo, NavList, UserChip } from '@/components/app/nav-list';
import { SidePanel } from '@/components/app/side-panel';
import { mockAdapter } from '@/lib/nomito/mock-adapter';
import { createNomitoThreadListAdapter } from '@/lib/nomito/thread-list';

// 'mock' keeps the fake path for demos/tests — an in-memory thread list over
// the mock adapter. The real path persists threads in Supabase and binds one
// durable eve session per chat (components/app/chat/nomito-runtime.ts).
const IS_MOCK = process.env.NEXT_PUBLIC_NOMAI_CHAT_BACKEND === 'mock';

// Adapter references must stay stable across renders — replacing them reloads
// the whole thread list.
const nomitoAdapter = createNomitoThreadListAdapter();
const mockListAdapter = new InMemoryThreadListAdapter();

function useMockThreadRuntime() {
  return useLocalRuntime(mockAdapter);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Deep link: /app?chat=<remoteId> opens that thread at mount. Read once —
  // the runtime owns switching afterwards (a controlled threadId of
  // `undefined` means "always a new thread" and would keep resetting main).
  const [initialChat] = useState(() =>
    typeof window === 'undefined'
      ? undefined
      : (new URLSearchParams(window.location.search).get('chat') ?? undefined),
  );

  const runtime = useRemoteThreadListRuntime({
    adapter: IS_MOCK ? mockListAdapter : nomitoAdapter,
    runtimeHook: IS_MOCK ? useMockThreadRuntime : useNomitoThreadRuntime,
    initialThreadId: initialChat,
    onThreadIdChange: (threadId) =>
      router.replace(threadId ? `/app?chat=${threadId}` : '/app'),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ShortlistTool />
      <BookingQuoteTool />
      <Toast.Provider />
      <div className="flex h-dvh flex-col bg-paper text-ink lg:flex-row">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-sand p-5 lg:flex">
          <Logo />
          <div className="mt-8">
            <NavList />
          </div>
          <div className="mt-6 flex min-h-0 flex-1 flex-col">
            <ChatList />
          </div>
          <div className="pt-4">
            <UserChip />
          </div>
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
