'use client';

import Link from 'next/link';
import { Toast } from '@heroui/react';

import { Logo } from '@/components/app/nav-list';
import { CheckBadgeIcon } from '@/components/icons';
import { currentOwner } from '@/lib/mock/owner';

/**
 * The Owner's chrome: a slim top bar, no Nomito runtime — ADR-0001 has no
 * Owner-side Agent. One account is both Traveler and Owner, so the chip
 * toggles back to "Modo viajero".
 */
function OwnerChip() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-terra-soft text-sm font-semibold text-terra-deep"
      >
        {currentOwner.initials}
      </span>
      <span className="hidden min-w-0 text-sm leading-tight sm:block">
        <span className="flex items-center gap-1 truncate font-medium text-ink">
          {currentOwner.name}
          {currentOwner.verified && <CheckBadgeIcon className="h-3.5 w-3.5 shrink-0 text-agua" />}
          {currentOwner.verified && <span className="sr-only">(dueño verificado)</span>}
        </span>
        <span className="block truncate text-xs text-ink-muted">{currentOwner.city}</span>
      </span>
    </div>
  );
}

export function OwnerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      <Toast.Provider />
      <header className="sticky top-0 z-10 border-b border-sand bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <Logo />
          <nav aria-label="Dueño" className="flex items-center gap-1">
            <span
              aria-current="page"
              className="rounded-xl bg-terra-soft px-3 py-2 text-sm font-medium text-terra-deep"
            >
              Panel
            </span>
            <Link
              href={`/owners/${currentOwner.slug}`}
              className="rounded-xl px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-sand/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
            >
              Mi escaparate
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="hidden rounded-full border border-sand px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-terra hover:text-ink focus-visible:outline-2 focus-visible:outline-terra xs:block sm:block"
            >
              Modo viajero
            </Link>
            <OwnerChip />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-5 sm:py-8">{children}</main>
    </div>
  );
}
