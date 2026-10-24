'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from '@heroui/react';

import { NomitoAvatar } from '@/components/nomito-avatar';
import { traveler } from '@/lib/mock/traveler';
import { createClient } from '@/lib/supabase/client';

const ITEMS = [
  { label: 'Inicio', href: '/app' },
  { label: 'Explorar', href: '/app/lodgings' },
  { label: 'Reservas' },
  { label: 'Ayuda' },
] as const;

const itemClass =
  'flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-terra';

export function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-xl font-brand text-2xl font-semibold tracking-tight text-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
    >
      <NomitoAvatar size="sm" shape="icon" decorative />
      nomai
    </Link>
  );
}

export function NavList() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {ITEMS.map((item) =>
        'href' in item ? (
          <Link
            key={item.label}
            href={item.href}
            aria-current={pathname === item.href ? 'page' : undefined}
            className={`${itemClass} ${
              pathname === item.href ? 'bg-terra-soft text-terra-deep' : 'text-ink-muted hover:bg-sand/50 hover:text-ink'
            }`}
          >
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
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [userProfile, setUserProfile] = useState<{ name: string; subtitle: string; initials: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const metadata = user.user_metadata || {};
        const name = (metadata.full_name as string) || (metadata.name as string) || user.email?.split('@')[0] || 'Viajero';
        const subtitle = user.email || (metadata.phone as string) || '';
        const initials = name
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? '')
          .join('') || name.slice(0, 2).toUpperCase();
        setUserProfile({ name, subtitle, initials });
      }
    });
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch {
      toast('Error al cerrar sesión');
      setSigningOut(false);
    }
  }

  const name = userProfile?.name ?? traveler.name;
  const subtitle = userProfile?.subtitle ?? traveler.from;
  const initials = userProfile?.initials ?? traveler.initials;

  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-agua-soft text-sm font-semibold text-agua"
        >
          {initials}
        </span>
        <span className="min-w-0 text-sm leading-tight">
          <span className="block truncate font-medium text-ink">{name}</span>
          <span className="block truncate text-xs text-ink-muted">{subtitle}</span>
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <Link
          href="/app/owner"
          className="rounded-lg font-medium text-ink-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-terra"
        >
          Modo dueño
        </Link>
        <button
          type="button"
          disabled={signingOut}
          onClick={handleSignOut}
          className="rounded-lg font-medium text-ink-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-terra disabled:opacity-50"
        >
          {signingOut ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </div>
    </div>
  );
}
