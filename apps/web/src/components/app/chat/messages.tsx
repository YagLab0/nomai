'use client';

import { MessagePrimitive, useAuiState } from '@assistant-ui/react';

import { MonedasChip } from '@/components/app/chat/monedas-chip';
import { OpenUIText } from '@/components/app/chat/openui-text';
import { NomitoAvatar } from '@/components/nomito-avatar';

/**
 * A failed turn's Traveler-facing notice. The adapters emit `credits:*` codes
 * for spend refusals (issue #17); anything else is a generic agent error.
 */
function MessageError() {
  const status = useAuiState((s) =>
    s.message.role === 'assistant' ? s.message.status : undefined,
  );
  if (status?.type !== 'incomplete' || status.reason !== 'error') return null;

  const code = typeof status.error === 'string' ? status.error : '';
  const copy =
    code === 'credits:no-credits'
      ? 'Te quedaste sin monedas Nomai. Cargá saldo o completá la verificación para sumar más.'
      : code === 'credits:daily-cap'
        ? 'Llegaste al tope de búsquedas gratis de hoy. Volvé mañana o cargá saldo para seguir.'
        : 'Nomito no pudo responder. Probá de nuevo en un rato.';

  return (
    <p role="alert" className="rounded-xl bg-terra-soft px-3 py-2 text-sm text-terra-deep">
      {copy}
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
        <MessagePrimitive.Parts components={{ Text: OpenUIText }} />
        <MonedasChip />
        <MessageError />
      </div>
    </MessagePrimitive.Root>
  );
}
