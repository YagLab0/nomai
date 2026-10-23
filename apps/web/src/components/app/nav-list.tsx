'use client';

import Link from 'next/link';
import { toast } from '@heroui/react';

import { traveler } from '@/lib/mock/traveler';

const ITEMS = [
  { label: 'Inicio', active: true },
  { label: 'Reservas', active: false },
  { label: 'Ayuda', active: false },
] as const;

const itemClass =
  'flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-terra';

export function Logo() {
  return (
    <Link href="/" className="font-brand text-2xl font-semibold tracking-tight text-terra-deep">
      nomai
    </Link>
  );
}

export function NavList() {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {ITEMS.map((item) =>
        item.active ? (
          <Link key={item.label} href="/app" aria-current="page" className={`${itemClass} bg-terra-soft text-terra-deep`}>
            {item.label}
          </Link>
        ) : (
          <button
            key={item.label}
            type="button"
            className={`${itemClass} text-left text-ink-muted hover:bg-sand/50 hover:text-ink`}
            onClick={() => toast(`${item.label}: pronto`)}
          >
            {item.label}
          </button>
        ),
      )}
    </nav>
  );
}

export function UserChip() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-agua-soft text-sm font-semibold text-agua"
      >
        {traveler.initials}
      </span>
      <span className="min-w-0 text-sm leading-tight">
        <span className="block truncate font-medium text-ink">{traveler.name}</span>
        <span className="block truncate text-xs text-ink-muted">{traveler.from}</span>
      </span>
    </div>
  );
}
