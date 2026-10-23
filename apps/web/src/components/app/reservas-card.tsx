'use client';

import { toast } from '@heroui/react';

import { WidgetCard } from '@/components/app/widget-card';
import { traveler } from '@/lib/mock/traveler';

export function ReservasCard() {
  const b = traveler.nextBooking;
  return (
    <WidgetCard
      title="Reservas"
      action={
        <button
          type="button"
          className="text-xs font-medium text-terra-deep underline underline-offset-4"
          onClick={() => toast('Pronto vas a ver todas tus reservas')}
        >
          Ver todas
        </button>
      }
    >
      <div className="flex overflow-hidden rounded-xl border border-sand">
        <div className="min-w-0 flex-1 p-3">
          <p className="font-mono text-sm font-semibold text-ink">{b.route}</p>
          <p className="mt-1 truncate text-sm text-ink">{b.lodging}</p>
          <p className="truncate text-xs text-ink-muted">
            {b.town} · {b.dates}
          </p>
        </div>
        <div className="relative flex items-center border-l-2 border-dashed border-sand px-3">
          <span aria-hidden="true" className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-white" />
          <span aria-hidden="true" className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-white" />
          <span className="rounded-full bg-agua-soft px-2 py-0.5 text-xs font-medium text-agua">{b.status}</span>
        </div>
      </div>
    </WidgetCard>
  );
}
