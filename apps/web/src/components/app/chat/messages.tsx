'use client';

import { MessagePrimitive } from '@assistant-ui/react';

import { MonedasChip } from '@/components/app/chat/monedas-chip';
import { OpenUIText } from '@/components/app/chat/openui-text';
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

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex items-start gap-3">
      <NomitoAvatar size="sm" className="mt-1" />
      <div className="flex min-w-0 max-w-[90%] flex-1 flex-col items-start gap-2">
        <MessagePrimitive.Parts components={{ Text: OpenUIText }} />
        <MonedasChip />
      </div>
    </MessagePrimitive.Root>
  );
}
