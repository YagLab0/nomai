'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Drawer } from '@heroui/react';

import { ChatList } from '@/components/app/chat/chat-list';
import { Logo, NavList, UserChip } from '@/components/app/nav-list';
import { SidePanel } from '@/components/app/side-panel';

export function MobileBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
    setChatsOpen(false);
  }, [pathname]);
  return (
    <header className="flex items-center justify-between gap-3 border-b border-sand bg-paper px-4 py-3 lg:hidden">
      <div className="flex items-center gap-2">
        <Drawer isOpen={chatsOpen} onOpenChange={setChatsOpen}>
          <Button isIconOnly variant="tertiary" aria-label="Abrir conversaciones">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </Button>
          <Drawer.Backdrop>
            <Drawer.Content placement="left">
              <Drawer.Dialog className="bg-paper">
                <Drawer.CloseTrigger />
                <Drawer.Header>
                  <Drawer.Heading className="font-brand">Chats</Drawer.Heading>
                </Drawer.Header>
                <Drawer.Body className="flex min-h-0 flex-col">
                  <ChatList onSelectChat={() => setChatsOpen(false)} />
                </Drawer.Body>
              </Drawer.Dialog>
            </Drawer.Content>
          </Drawer.Backdrop>
        </Drawer>
        <Logo />
      </div>
      <div className="flex items-center gap-2">
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
