'use client';

import Link from 'next/link';
import { Button, Drawer } from '@heroui/react';

const LINKS = [
  { name: 'Cómo funciona', href: '/#como-funciona' },
  { name: 'Alojamientos', href: '/lodgings' },
  { name: 'Para dueños', href: '/#duenos' },
];

const linkClass =
  'rounded-md text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-terra';

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-sand bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="font-brand text-2xl font-semibold tracking-tight text-terra-deep">
          nomai
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {l.name}
            </Link>
          ))}
          <Link href="/login" className={linkClass}>
            Ingresar
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-terra px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-terra-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
          >
            Crear cuenta
          </Link>
        </nav>

        <Drawer>
          <Button isIconOnly variant="tertiary" aria-label="Abrir menú" className="md:hidden">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </Button>
          <Drawer.Backdrop>
            <Drawer.Content placement="left">
              <Drawer.Dialog className="bg-paper">
                <Drawer.CloseTrigger />
                <Drawer.Header>
                  <Drawer.Heading className="font-brand text-terra-deep">nomai</Drawer.Heading>
                </Drawer.Header>
                <Drawer.Body className="flex flex-col gap-1">
                  {[...LINKS, { name: 'Ingresar', href: '/login' }].map((l) => (
                    <Link key={l.href} href={l.href} className="rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-sand/50">
                      {l.name}
                    </Link>
                  ))}
                </Drawer.Body>
                <Drawer.Footer>
                  <Link
                    href="/signup"
                    className="w-full rounded-full bg-terra px-4 py-3 text-center text-base font-medium text-white hover:bg-terra-deep"
                  >
                    Crear cuenta
                  </Link>
                </Drawer.Footer>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      </div>
    </header>
  );
}
