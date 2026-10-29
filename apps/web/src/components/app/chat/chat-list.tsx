'use client';

import {
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
} from '@assistant-ui/react';
import { useState } from 'react';

/**
 * The Traveler's saved conversations — a ThreadListPrimitive-driven list
 * backed by the Supabase adapter (lib/nomito/thread-list.ts). Mounted in the
 * desktop rail and inside the mobile chats drawer; both share the same
 * runtime so switching here drives `?chat=` and the open thread.
 *
 * `onSelectChat` lets the mobile drawer close itself on any thread action.
 */
export function ChatList({ onSelectChat }: { onSelectChat?: () => void }) {
  return (
    <ThreadListPrimitive.Root
      className="flex min-h-0 flex-1 flex-col"
      onClickCapture={onSelectChat}
    >
      <ThreadListPrimitive.New className="mb-2 flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-sand px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-terra hover:text-terra focus-visible:outline-2 focus-visible:outline-terra">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nuevo chat
      </ThreadListPrimitive.New>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ThreadListPrimitive.Items components={{ ThreadListItem: ChatListItem }} />
      </div>
    </ThreadListPrimitive.Root>
  );
}

const itemClass =
  'group relative flex items-center rounded-xl text-sm transition-colors focus-within:bg-sand/60 hover:bg-sand/60 data-[active]:bg-terra-soft data-[active]:text-terra-deep';

function ChatListItem() {
  const aui = useAui();
  const [editing, setEditing] = useState(false);

  const commitRename = (value: string) => {
    setEditing(false);
    const title = value.trim();
    if (title) void aui.threadListItem.rename(title);
  };

  return (
    <ThreadListItemPrimitive.Root className={itemClass}>
      {editing ? (
        <form
          className="min-w-0 flex-1 px-2 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            commitRename(new FormData(e.currentTarget).get('title') as string);
          }}
        >
          <input
            name="title"
            autoFocus
            defaultValue={aui.threadListItem.getState().title ?? ''}
            maxLength={120}
            aria-label="Renombrar conversación"
            className="w-full rounded-lg border border-sand bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-terra"
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            onBlur={(e) => commitRename(e.currentTarget.value)}
          />
        </form>
      ) : (
        <>
          <ThreadListItemPrimitive.Trigger className="min-w-0 flex-1 cursor-pointer truncate px-3 py-2 text-left text-ink-muted outline-none focus-visible:outline-2 focus-visible:outline-terra group-data-[active]:text-terra-deep">
            <ThreadListItemPrimitive.Title fallback="Nueva conversación" />
          </ThreadListItemPrimitive.Trigger>
          <ThreadListItemMorePrimitive.Root>
            <ThreadListItemMorePrimitive.Trigger
              aria-label="Opciones de la conversación"
              className="mr-1 rounded-lg p-1 text-ink-muted opacity-0 outline-none transition-opacity hover:bg-sand focus:opacity-100 focus-visible:outline-2 focus-visible:outline-terra group-hover:opacity-100"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="currentColor"
              >
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </ThreadListItemMorePrimitive.Trigger>
            <ThreadListItemMorePrimitive.Content
              sideOffset={4}
              align="start"
              className="z-50 min-w-36 rounded-xl border border-sand bg-paper p-1 shadow-lg"
            >
              <ThreadListItemMorePrimitive.Item
                className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-sand/60"
                onSelect={() => setEditing(true)}
              >
                Renombrar
              </ThreadListItemMorePrimitive.Item>
              <ThreadListItemMorePrimitive.Item
                className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-sand/60"
                onSelect={() => void aui.threadListItem.archive()}
              >
                Archivar
              </ThreadListItemMorePrimitive.Item>
              <ThreadListItemMorePrimitive.Item
                className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-terra outline-none data-[highlighted]:bg-sand/60"
                onSelect={() => void aui.threadListItem.delete()}
              >
                Eliminar
              </ThreadListItemMorePrimitive.Item>
            </ThreadListItemMorePrimitive.Content>
          </ThreadListItemMorePrimitive.Root>
        </>
      )}
    </ThreadListItemPrimitive.Root>
  );
}
