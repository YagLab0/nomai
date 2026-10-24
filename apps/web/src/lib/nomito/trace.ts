/**
 * Live "thinking" trace for the in-flight assistant message. The eve adapter
 * folds `step.started`/`step.completed` and `reasoning.appended`/
 * `reasoning.completed` stream events into this ordered list and ships it
 * through `metadata.custom[TRACE_KEY]`; the chat renders it as a ThinkingState
 * block. Labels are Traveler-facing Spanish summaries — reasoning text is
 * whitespace-collapsed and truncated, never a verbatim internal dump.
 */
export const TRACE_KEY = 'nomitoTrace';

export type NomitoTraceEntry = {
  kind: 'step' | 'reasoning';
  /** Step: a short Spanish summary. Reasoning: the truncated gist. */
  label: string;
  done: boolean;
};

const FIRST_STEP_LABEL = 'Analizando el pedido';
const NEXT_STEP_LABEL = 'Comparando opciones';
const REASONING_MAX = 200;

/** Provisional Spanish summary for a model step; tool calls refine it later. */
export function stepSummary(stepIndex: number): string {
  return stepIndex === 0 ? FIRST_STEP_LABEL : NEXT_STEP_LABEL;
}

/** Reasoning for the trace: collapsed, ~200 chars max, cut on a word boundary. */
export function summarizeReasoning(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= REASONING_MAX) return clean;
  const cut = clean.slice(0, REASONING_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 0))}…`;
}

/** Narrows the raw `metadata.custom[TRACE_KEY]` value, defensively. */
export function readTrace(value: unknown): NomitoTraceEntry[] {
  return Array.isArray(value) ? (value as NomitoTraceEntry[]) : [];
}
