'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Toast } from '@heroui/react';

import { Logo } from '@/components/app/nav-list';
import { CheckBadgeIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { initialsFor } from '@/lib/api-mapping';

interface OwnerProfile {
  name: string;
  initials: string;
  city?: string;
}

/**
 * The Owner's chrome: a slim top bar, no Nomito runtime — ADR-0001 has no
 * Owner-side Agent. One account is both Traveler and Owner, so the chip
 * toggles back to "Modo viajero".
 */
function OwnerChip() {
  const [profile, setProfile] = useState<OwnerProfile>({
    name: 'Dueño nomai',
    initials: 'DN',
  });

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: bus } = await supabase
        .from('businesses')
        .select('name, slug, properties(city)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (bus?.name) {
        const properties = bus.properties as Array<{ city?: string }> | null;
        const city = properties?.[0]?.city || '';
        setProfile({
          name: bus.name,
          initials: initialsFor(bus.name),
          city,
        });
      } else {
        const name =
          user.user_metadata?.full_name ||
          user.email?.split('@')[0] ||
          'Dueño';
        setProfile({
          name,
          initials: initialsFor(name),
        });
      }
    }
    load();
  }, []);

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-terra-soft text-sm font-semibold text-terra-deep"
      >
        {profile.initials}
      </span>
      <span className="hidden min-w-0 text-sm leading-tight sm:block">
        <span className="flex items-center gap-1 truncate font-medium text-ink">
          {profile.name}
          <CheckBadgeIcon className="h-3.5 w-3.5 shrink-0 text-agua" />
          <span className="sr-only">(dueño verificado)</span>
        </span>
        {profile.city && (
          <span className="block truncate text-xs text-ink-muted">{profile.city}</span>
        )}
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
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="rounded-full border border-sand px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-terra hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
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
