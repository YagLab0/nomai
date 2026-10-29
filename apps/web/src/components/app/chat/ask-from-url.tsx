'use client';

import { useAui } from '@assistant-ui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { ASK_PARAM } from '@/lib/nomito/ask';

/** Reads `/app?ask=...` once, opens a fresh thread, sends it as the
 * Traveler's first message and cleans the URL. */
export function AskFromUrl() {
  const aui = useAui();
  const router = useRouter();
  const ask = useSearchParams().get(ASK_PARAM);
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!ask || sent.current === ask) return;
    sent.current = ask;
    aui.threads.switchToNewThread();
    aui.thread().append({ role: 'user', content: [{ type: 'text', text: ask }] });
    router.replace('/app');
  }, [ask, aui, router]);

  return null;
}
