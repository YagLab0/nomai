'use client';

import { useAui, type TextMessagePartProps } from '@assistant-ui/react';
import {
  BuiltinActionType,
  Renderer,
  type ActionEvent,
  type OpenUIError,
} from '@openuidev/react-lang';
import { ProseText } from '@/components/app/chat/prose-text';
import { library } from '@/lib/openui/library';
import { parseSegments } from '@/lib/openui/segments';
import type { ReactNode } from 'react';

/**
 * Assistant text part: splits the model's reply into prose and fenced
 * ```openui-lang programs. Prose renders as bare markdown text (no bubble —
 * same look as TextContent inside programs); each program renders through the
 * OpenUI Renderer against the nomai catalog.
 */

/**
 * Machine tail an OpenUI submit appends to the sent user message so the Agent
 * reads exact formState values. The user bubble hides it — see UserText.
 */
export const FORM_VALUES_MARKER = '\n\nForm values: ';

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-sand/80 ${className}`} />;
}

function SkeletonCardShell({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-md rounded-2xl border border-sand bg-white p-4"
    >
      {children}
    </div>
  );
}

/** Skeleton placeholder while an ```openui-lang program streams in. Scans
 * the partial code for component calls and shapes each placeholder like the
 * card that is actually coming — never the old flat rectangle. */
const SKELETON_FOR: Record<string, 'listing' | 'media' | 'map' | 'summary' | 'rows' | 'text' | 'pills' | 'card'> = {
  ListingCard: 'listing',
  RecommendationCard: 'listing',
  ListingCarousel: 'media',
  ImageGrid: 'media',
  MapCard: 'map',
  ReviewSummary: 'summary',
  ReviewList: 'rows',
  TaskRows: 'rows',
  DetailList: 'rows',
  Table: 'rows',
  MetricRow: 'rows',
  BookingCard: 'card',
  QuoteCard: 'card',
  FundingCard: 'card',
  ApprovalCard: 'card',
  ClaimCard: 'card',
  ReviewForm: 'card',
  QuoteForm: 'card',
  AvailabilityPicker: 'card',
  SectionHeader: 'text',
  TextContent: 'text',
  ChipRow: 'pills',
  AmenityChips: 'pills',
  StatusBadge: 'pills',
  Stepper: 'pills',
};

function SkeletonVariant({ kind }: { kind: string }) {
  switch (kind) {
    case 'listing':
      return (
        <SkeletonCardShell>
          <div className="flex gap-3">
            <SkeletonBar className="h-20 w-24 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2 py-1">
              <SkeletonBar className="h-3.5 w-3/4" />
              <SkeletonBar className="h-3 w-1/2" />
              <SkeletonBar className="h-3 w-2/3" />
            </div>
          </div>
          <SkeletonBar className="mt-3 h-9 w-full rounded-xl" />
        </SkeletonCardShell>
      );
    case 'media':
      return (
        <SkeletonCardShell>
          <div className="grid grid-cols-3 gap-2">
            <SkeletonBar className="h-20 rounded-xl" />
            <SkeletonBar className="h-20 rounded-xl" />
            <SkeletonBar className="h-20 rounded-xl" />
          </div>
        </SkeletonCardShell>
      );
    case 'map':
      return <SkeletonBar className="h-44 w-full rounded-2xl" />;
    case 'summary':
      return (
        <SkeletonCardShell>
          <SkeletonBar className="h-7 w-24" />
          <div className="mt-3 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <SkeletonBar className="h-2.5 w-24 shrink-0" />
                <SkeletonBar className="h-1.5 flex-1 rounded-full" />
                <SkeletonBar className="h-2.5 w-7 shrink-0" />
              </div>
            ))}
          </div>
        </SkeletonCardShell>
      );
    case 'rows':
      return (
        <div className="w-full max-w-md space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <SkeletonBar key={i} className="h-11 w-full rounded-2xl" />
          ))}
        </div>
      );
    case 'text':
      return (
        <div className="w-full max-w-md space-y-2" aria-hidden="true">
          <SkeletonBar className="h-3.5 w-4/5" />
          <SkeletonBar className="h-3 w-3/5" />
        </div>
      );
    case 'pills':
      return (
        <div className="flex gap-2" aria-hidden="true">
          <SkeletonBar className="h-8 w-24 rounded-full" />
          <SkeletonBar className="h-8 w-28 rounded-full" />
          <SkeletonBar className="h-8 w-20 rounded-full" />
        </div>
      );
    case 'card':
    default:
      return (
        <SkeletonCardShell>
          <SkeletonBar className="h-4 w-1/2" />
          <div className="mt-3 space-y-2.5">
            <div className="flex justify-between gap-4">
              <SkeletonBar className="h-3 w-1/3" />
              <SkeletonBar className="h-3 w-16" />
            </div>
            <div className="flex justify-between gap-4">
              <SkeletonBar className="h-3 w-1/4" />
              <SkeletonBar className="h-3 w-14" />
            </div>
            <div className="flex justify-between gap-4">
              <SkeletonBar className="h-3.5 w-2/5" />
              <SkeletonBar className="h-3.5 w-20" />
            </div>
          </div>
          <SkeletonBar className="mt-4 h-11 w-full rounded-xl" />
        </SkeletonCardShell>
      );
  }
}

function ProgramSkeleton({ code }: { code: string }) {
  const seen = new Set<string>();
  const kinds: string[] = [];
  for (const m of code.matchAll(/\b([A-Z][A-Za-z]+)\s*\(/g)) {
    const kind = SKELETON_FOR[m[1]];
    if (kind && !seen.has(m[1])) {
      seen.add(m[1]);
      kinds.push(kind);
    }
  }
  if (kinds.length === 0) kinds.push('card');
  return (
    <div className="mt-3 flex w-full flex-col gap-3">
      {kinds.slice(0, 5).map((kind, i) => (
        <SkeletonVariant key={`${kind}-${i}`} kind={kind} />
      ))}
    </div>
  );
}

export function OpenUIText({ text, status }: TextMessagePartProps) {
  const aui = useAui();
  const isStreaming = status.type === 'running';

  const onAction = (event: ActionEvent) => {
    if (event.type === BuiltinActionType.ContinueConversation) {
      let message = event.humanFriendlyMessage ?? '';
      if (event.formState && Object.keys(event.formState).length > 0) {
        message += `${FORM_VALUES_MARKER}${JSON.stringify(event.formState)}`;
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
        if (segment.type === 'prose') return <ProseText key={i} text={segment.text} />;
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
        return <ProgramSkeleton key={i} code={segment.code} />;
      })}
    </>
  );
}
