'use client';

import { MessagePrimitive } from '@assistant-ui/react';

import { MonedasChip } from '@/components/app/chat/monedas-chip';
import { NomitoAvatar } from '@/components/nomito-avatar';

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-terra px-4 py-2.5 text-paper">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function BubbleText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap rounded-2xl rounded-tl-md bg-terra-soft px-4 py-2.5 text-ink">
      {text}
    </p>
  );
}

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex items-start gap-3">
      <NomitoAvatar size="sm" className="mt-1" />
      <div className="flex min-w-0 max-w-[90%] flex-1 flex-col items-start [&>*:not(:first-child)]:w-full">
        <MessagePrimitive.Parts components={{ Text: BubbleText }} />
        <MonedasChip />
      </div>
    </MessagePrimitive.Root>
  );
}
