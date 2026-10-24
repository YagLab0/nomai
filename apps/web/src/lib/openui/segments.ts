/**
 * Streaming-tolerant splitter for assistant text that mixes prose with fenced
 * ```openui-lang programs (OpenUI Lang inline mode).
 *
 * - `prose`   — plain text, rendered as the usual chat bubble.
 * - `openui`  — the body of a complete ```openui-lang / ```openui fenced block.
 * - `pending` — a fence opened but not yet closed at end of text. While
 *   streaming this renders as a skeleton; once the message finishes, an
 *   unclosed fence's partial body is emitted as `openui` instead so parse
 *   errors surface rather than disappearing silently.
 */

export type Segment =
  | { type: 'prose'; text: string }
  | { type: 'openui'; code: string }
  | { type: 'pending' };

/** ```openui-lang or ```openui on its own line (also matches at end of text). */
const OPEN_RE = /```(?:openui-lang|openui)\b[^\S\r\n]*(?:\r?\n|$)/;

/** A bare ``` closing fence on its own line. */
const CLOSE_RE = /(?:^|\r?\n)```[^\S\r\n]*(?=\r?\n|$)/g;

export function parseSegments(text: string, opts?: { isStreaming?: boolean }): Segment[] {
  const isStreaming = opts?.isStreaming ?? false;
  const segments: Segment[] = [];
  let rest = text;

  for (;;) {
    const open = OPEN_RE.exec(rest);
    if (!open) break;

    pushProse(segments, rest.slice(0, open.index));
    const body = rest.slice(open.index + open[0].length);

    CLOSE_RE.lastIndex = 0;
    const close = CLOSE_RE.exec(body);
    if (!close) {
      // Unclosed fence at the tail.
      if (isStreaming) {
        segments.push({ type: 'pending' });
      } else if (body.trim().length > 0) {
        // Stream ended mid-program: render the partial code anyway so the
        // resulting parse errors are visible instead of swallowed.
        segments.push({ type: 'openui', code: body });
      }
      return segments;
    }

    segments.push({ type: 'openui', code: body.slice(0, close.index) });
    rest = body.slice(close.index + close[0].length);
  }

  pushProse(segments, rest);
  return segments;
}

function pushProse(segments: Segment[], text: string): void {
  // Whitespace-only runs between blocks carry no content — skip them so they
  // don't render empty bubbles.
  if (text.trim().length > 0) segments.push({ type: 'prose', text });
}
