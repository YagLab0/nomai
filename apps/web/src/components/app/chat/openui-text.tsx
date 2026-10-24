'use client';

import { useAui, type TextMessagePartProps } from '@assistant-ui/react';
import {
  BuiltinActionType,
  Renderer,
  type ActionEvent,
  type OpenUIError,
} from '@openuidev/react-lang';

import { library } from '@/lib/openui/library';
import { parseSegments } from '@/lib/openui/segments';

/**
 * Assistant text part: splits the model's reply into prose and fenced
 * ```openui-lang programs. Prose renders in the classic bubble; each program
 * renders through the OpenUI Renderer against the nomai catalog.
 */

export function BubbleText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap rounded-2xl rounded-tl-md bg-terra-soft px-4 py-2.5 text-ink">
      {text}
    </p>
  );
}

function LangSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mt-3 h-20 w-full animate-pulse rounded-2xl border border-sand"
    />
  );
}

export function OpenUIText({ text, status }: TextMessagePartProps) {
  const aui = useAui();
  const isStreaming = status.type === 'running';

  const onAction = (event: ActionEvent) => {
    if (event.type === BuiltinActionType.ContinueConversation) {
      let message = event.humanFriendlyMessage ?? '';
      if (event.formState && Object.keys(event.formState).length > 0) {
        message += `\n\nForm values: ${JSON.stringify(event.formState)}`;
      }
      aui.thread().append({ role: 'user', content: [{ type: 'text', text: message }] });
      return;
    }
    if (event.type === BuiltinActionType.OpenUrl) {
      const url = event.params.url;
      if (typeof url === 'string') window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const onError = (errors: OpenUIError[]) => {
    if (errors.length > 0 && process.env.NODE_ENV === 'development') {
      console.error('[openui] program errors', errors);
    }
  };

  return (
    <>
      {parseSegments(text, { isStreaming }).map((segment, i) => {
        if (segment.type === 'prose') return <BubbleText key={i} text={segment.text} />;
        if (segment.type === 'openui') {
          return (
            <div key={i} className="w-full min-w-0">
              <Renderer
                response={segment.code}
                library={library}
                isStreaming={isStreaming}
                onAction={onAction}
                onError={onError}
              />
            </div>
          );
        }
        return <LangSkeleton key={i} />;
      })}
    </>
  );
}
