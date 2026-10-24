'use client';

import { NomitoAvatar } from '@/components/nomito-avatar';

export function ChatHeader() {
  return (
    <header className="flex items-center gap-3 border-b border-sand bg-paper px-4 py-3">
      <NomitoAvatar size="md" shape="icon" />
      <div className="min-w-0 flex-1">
        <h1 className="font-brand text-lg font-medium leading-tight text-ink">Nomito</h1>
        <p className="truncate text-sm text-ink-muted">Te busca alojamiento en Latinoamérica</p>
      </div>
    </header>
  );
}
