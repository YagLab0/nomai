'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Shared markdown renderer for assistant prose — used both for prose segments
 * outside ```openui-lang fences and for TextContent inside programs, so model
 * text looks identical wherever it lands. Bare text (no bubble), nomai tokens.
 */
export function ProseText({ text }: { text: string }) {
  return (
    <div className="w-full text-sm leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-ink">{children}</strong>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-terra-deep underline underline-offset-2"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <p className="mt-3 font-brand text-lg font-medium leading-tight first:mt-0">
              {children}
            </p>
          ),
          h2: ({ children }) => (
            <p className="mt-3 font-brand text-lg font-medium leading-tight first:mt-0">
              {children}
            </p>
          ),
          h3: ({ children }) => (
            <p className="mt-2 font-brand text-base font-medium leading-tight first:mt-0">
              {children}
            </p>
          ),
          code: ({ children }) => (
            <code className="rounded bg-sand px-1 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
