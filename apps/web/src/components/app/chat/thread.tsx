'use client';

import { AuiIf, ThreadPrimitive } from '@assistant-ui/react';
import { Suspense } from 'react';

import { AskFromUrl } from '@/components/app/chat/ask-from-url';
import { ChatHeader } from '@/components/app/chat/chat-header';
import { Composer } from '@/components/app/chat/composer';
import { EmptyState } from '@/components/app/chat/empty-state';
import { AssistantMessage, UserMessage } from '@/components/app/chat/messages';

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col bg-paper">
      <Suspense>
        <AskFromUrl />
      </Suspense>
      <ChatHeader />
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto scroll-smooth">
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <EmptyState />
        </AuiIf>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
          <ThreadPrimitive.Messages>
            {({ message }) => (message.role === 'user' ? <UserMessage /> : <AssistantMessage />)}
          </ThreadPrimitive.Messages>
        </div>
        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto bg-gradient-to-t from-paper via-paper to-paper/0 px-4 pb-4 pt-2">
          <div className="mx-auto w-full max-w-2xl">
            <Composer />
          </div>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
