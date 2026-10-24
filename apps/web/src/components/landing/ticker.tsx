/**
 * FX tape: the wFIAT pairs money actually travels between Traveler and Owner.
 * Pure CSS marquee, paused under reduced motion; decorative, so aria-hidden.
 */
const HOPS = [
  'wARS → wBRL',
  'wBRL → wPEN',
  'wPEN → wCOP',
  'wCOP → wMXN',
  'wMXN → wCLP',
  'wCLP → wUYU',
  'wUYU → wARS',
];

export function Ticker() {
  const items = [...HOPS, ...HOPS];
  return (
    <div aria-hidden="true" className="overflow-hidden border-y border-sand bg-white/50 py-3">
      <div className="flex w-max animate-[ticker_30s_linear_infinite]">
        {items.map((hop, i) => (
          <span
            key={i}
            className="flex shrink-0 items-center gap-10 pr-10 font-mono text-sm tracking-wide text-ink-muted"
          >
            {hop}
            <span className="h-1.5 w-1.5 rounded-full bg-terra/50" />
          </span>
        ))}
      </div>
    </div>
  );
}
