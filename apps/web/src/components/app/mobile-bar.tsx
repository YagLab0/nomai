'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Drawer } from '@heroui/react';

import { Logo, NavList, UserChip } from '@/components/app/nav-list';
import { SidePanel } from '@/components/app/side-panel';
import { useMonedas } from '@/components/app/use-monedas';

export function MobileBar() {
  const monedas = useMonedas();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className="flex items-center justify-between gap-3 border-b border-sand bg-paper px-4 py-3 lg:hidden">
      <Logo />
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-terra-soft px-3 py-1 font-mono text-sm text-terra-deep">
          {monedas} monedas
        </span>
        <Drawer isOpen={open} onOpenChange={setOpen}>
          <Button isIconOnly variant="tertiary" aria-label="Abrir menú">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </Button>
          <Drawer.Backdrop>
            <Drawer.Content placement="right">
              <Drawer.Dialog className="bg-paper">
                <Drawer.CloseTrigger />
                <Drawer.Header>
                  <Drawer.Heading className="font-brand">Menú</Drawer.Heading>
                </Drawer.Header>
                <Drawer.Body className="flex flex-col gap-6">
                  <NavList />
                  <SidePanel />
                </Drawer.Body>
                <Drawer.Footer>
                  <UserChip />
                </Drawer.Footer>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
      </div>
    </header>
  );
}
