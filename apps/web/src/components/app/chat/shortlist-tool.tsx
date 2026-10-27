'use client';

import { makeAssistantToolUI, useAui } from '@assistant-ui/react';
import { Button } from '@heroui/react';

import { formatBRL } from '@/lib/format';
import { formatLocalPrice, nightlyBRL, type Lodging } from '@/lib/lodgings';
import { SHORTLIST_TOOL, type ShortlistArgs } from '@/lib/nomito/tools';

function TicketCard({ lodging }: { lodging: Lodging }) {
  const aui = useAui();
  const choose = () =>
    aui.thread().append({
      role: 'user',
      content: [{ type: 'text', text: `Quiero reservar ${lodging.name}, ${lodging.city}` }],
    });

  return (
    <li className="flex overflow-hidden rounded-2xl border border-sand bg-white">
      <div className="min-w-0 flex-1 p-4">
        <p className="font-brand text-lg font-medium leading-tight text-ink">{lodging.name}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{lodging.city}</p>
        <p className="mt-2 text-sm leading-snug text-ink">{lodging.blurb}</p>
        <span className="mt-3 inline-flex rounded-full bg-agua-soft px-2.5 py-0.5 text-xs font-medium text-agua">
          pago en garantía
        </span>
      </div>

      <div className="relative flex w-32 shrink-0 flex-col items-center justify-between gap-2 border-l-2 border-dashed border-sand p-3 text-center sm:w-36">
        <span aria-hidden="true" className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-paper" />
        <span aria-hidden="true" className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-paper" />
        <span className="font-mono text-xs tracking-widest text-ink-muted">{lodging.code ?? lodging.city}</span>
        <div>
          <p className="font-mono text-sm font-semibold text-ink">{formatLocalPrice(lodging)}</p>
          <p className="font-mono text-xs text-ink-muted">≈ {formatBRL(nightlyBRL(lodging))} / noche</p>
        </div>
        <Button size="sm" fullWidth onPress={choose}>
          Elegir
        </Button>
      </div>
    </li>
  );
}

export const ShortlistTool = makeAssistantToolUI<ShortlistArgs, unknown>({
  toolName: SHORTLIST_TOOL,
  render: ({ args }) => (
    <ul className="mt-3 flex flex-col gap-3" aria-label="Alojamientos sugeridos">
      {args.options?.map((l) => <TicketCard key={l.id} lodging={l} />)}
    </ul>
  ),
});
