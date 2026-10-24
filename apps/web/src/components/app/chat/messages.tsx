'use client';

import { MessagePrimitive, useAuiState } from '@assistant-ui/react';

import { OpenUIText } from '@/components/app/chat/openui-text';
import { ThinkingTrace } from '@/components/app/chat/thinking-trace';
import { ToolRunChips } from '@/components/app/chat/tool-chips';
import { WaitingState } from '@/components/app/chat/waiting-state';
import { NomitoAvatar } from '@/components/nomito-avatar';

/** A failed turn's Traveler-facing notice. */
function MessageError() {
  const status = useAuiState((s) =>
    s.message.role === 'assistant' ? s.message.status : undefined,
  );
  if (status?.type !== 'incomplete' || status.reason !== 'error') return null;

  return (
    <p role="alert" className="rounded-xl bg-terra-soft px-3 py-2 text-sm text-terra-deep">
      Nomito no pudo responder. Probá de nuevo en un rato.
    </p>
  );
}

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
        <WaitingState />
        <ThinkingTrace />
        <ToolRunChips />
        <MessagePrimitive.Parts components={{ Text: OpenUIText }} />
        <MessageError />
      </div>
    </MessagePrimitive.Root>
  );
}
