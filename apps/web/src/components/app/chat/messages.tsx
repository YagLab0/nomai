'use client';

import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import type { TextMessagePartProps } from '@assistant-ui/react';

import { FORM_VALUES_MARKER, OpenUIText } from '@/components/app/chat/openui-text';
import { WaitingState } from '@/components/app/chat/waiting-state';

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

/**
 * User text without the machine tail OpenUI submits append (the Agent still
 * receives it). Falls back to the full text if the friendly part came empty.
 */
function UserText({ text }: TextMessagePartProps) {
  const visible = text.split(FORM_VALUES_MARKER)[0];
  return <>{visible || text}</>;
}

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-terra px-4 py-2.5 text-paper">
        <MessagePrimitive.Parts components={{ Text: UserText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full flex-col items-start gap-2">
      <WaitingState />
      <MessagePrimitive.Parts components={{ Text: OpenUIText }} />
      <MessageError />
    </MessagePrimitive.Root>
  );
}
