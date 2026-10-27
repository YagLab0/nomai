'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { Button, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { BOOKING_QUOTE_TOOL, type BookingQuoteArgs } from '@/lib/nomito/tools';

const CONFIRM_LATENCY_MS = 1200;

function QuoteCard({ quote }: { quote: BookingQuoteArgs }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const confirm = () => {
    setState('loading');
    timer.current = setTimeout(() => setState('done'), CONFIRM_LATENCY_MS);
  };

  return (
    <section
      aria-label={`Detalle de reserva: ${quote.lodging}`}
      className="mt-3 overflow-hidden rounded-2xl border border-sand bg-white"
    >
      <dl className="divide-y divide-sand px-4">
        {quote.lines.map((line) => (
          <div
            key={line.label}
            className={`flex items-baseline justify-between gap-4 py-2.5 text-sm ${
              line.kind === 'total' ? 'font-semibold text-ink' : 'text-ink'
            }`}
          >
            <dt className={line.kind === 'fee' ? 'text-terra-deep' : line.kind === 'total' ? '' : 'text-ink-muted'}>
              {line.label}
            </dt>
            <dd className="shrink-0 font-mono">{line.value}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t-2 border-dashed border-sand p-4" aria-live="polite">
        {state === 'done' ? (
          <p className="flex items-center gap-2 rounded-xl bg-agua-soft px-3 py-2.5 text-sm font-medium text-agua">
            <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-agua text-xs text-white">
              ✓
            </span>
            Reserva confirmada · pago en garantía
          </p>
        ) : (
          <Button fullWidth size="lg" isPending={state === 'loading'} onPress={confirm}>
            {({ isPending }) => (
              <>
                {isPending && <Spinner color="current" size="sm" />}
                {isPending ? 'Confirmando…' : 'Confirmar reserva'}
              </>
            )}
          </Button>
        )}
      </div>
    </section>
  );
}

export const BookingQuoteTool = makeAssistantToolUI<BookingQuoteArgs, unknown>({
  toolName: BOOKING_QUOTE_TOOL,
  render: ({ args }) => <QuoteCard quote={args} />,
});
