'use client';

import { useState } from 'react';
import { Button } from '@heroui/react';

import { AlojamientoCard } from '@/components/owners/alojamiento-card';
import { LodgingWizard } from '@/components/owners/lodging-wizard';
import { ReservaCard } from '@/components/owners/reserva-card';
import { catalog } from '@/lib/catalog';
import { useLodgings } from '@/lib/use-lodgings';
import { formatNumber, formatShortDate } from '@/lib/format';
import type { Lodging } from '@/lib/lodgings';
import { currentOwner, monthNetARS, ownerBookings } from '@/lib/mock/owner';

/** The Owner's panel: Resumen → Reservas → Tus alojamientos (owner-views §3). */
export function OwnerDashboard() {
  const nextArrival = ownerBookings.find((b) => b.status === 'confirmada');
  const nextLodging = nextArrival && catalog.byId(nextArrival.lodgingId);
  /** The open wizard: `{}` creates, `{ lodging }` edits. */
  const [wizard, setWizard] = useState<{ lodging?: Lodging } | null>(null);
  const lodgings = useLodgings().filter((l) => l.ownerSlug === currentOwner.slug);

  return (
    <div className="flex flex-col gap-10">
      <header>
        <p className="text-sm font-medium text-terra-deep">Panel del dueño</p>
        <h1 className="brand-display mt-1 text-4xl font-medium leading-tight text-ink sm:text-5xl">
          Hola, {currentOwner.name.split(' ')[0]}
        </h1>
      </header>

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card bg-terra p-6 text-white">
          <p className="text-sm text-white/80">Este mes cobraste</p>
          <p className="mt-2 font-mono text-4xl font-semibold tracking-tight">
            $ {formatNumber(monthNetARS)}
          </p>
          <p className="mt-2 text-xs text-white/70">neto de devoluciones · al instante en tu Ripio</p>
        </div>
        {nextArrival && nextLodging && (
          <div className="rounded-card border border-sand bg-white p-6">
            <p className="text-sm text-ink-muted">Próxima llegada</p>
            <p className="mt-2 font-brand text-2xl font-medium text-ink">
              {nextArrival.traveler.name} · {formatShortDate(nextArrival.checkIn)}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {nextLodging.name} · {nextArrival.nights} noches
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="reservas-heading">
        <h2 id="reservas-heading" className="font-brand text-2xl font-medium text-ink">
          Reservas
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Cada reserva ya está cobrada en tu Ripio.</p>
        <div className="mt-4 flex flex-col gap-4">
          {ownerBookings.map((b) => (
            <ReservaCard key={b.id} booking={b} />
          ))}
        </div>
      </section>

      <section aria-labelledby="alojamientos-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="alojamientos-heading" className="font-brand text-2xl font-medium text-ink">
              Tus alojamientos
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Lo que los viajeros ven en tu escaparate y en el catálogo.
            </p>
          </div>
          <Button onPress={() => setWizard({})}>Agregar alojamiento</Button>
        </div>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {lodgings.map((l) => (
            <AlojamientoCard key={l.id} lodging={l} onEdit={() => setWizard({ lodging: l })} />
          ))}
        </div>
      </section>

      {wizard && (
        <LodgingWizard
          key={wizard.lodging?.id ?? 'new'}
          owner={currentOwner}
          lodging={wizard.lodging}
          isOpen
          onOpenChange={(open) => !open && setWizard(null)}
        />
      )}
    </div>
  );
}
