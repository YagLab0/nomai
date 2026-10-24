// Vendored from beautiful-ui (MIT) — see VENDORED.md
/** Label-left / value-right row — the workhorse of every card in the refs. */
export function TextRow({
  label,
  value,
  meta,
  className = "",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-11 items-center justify-between gap-4 py-2 ${className}`}
    >
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="flex items-baseline gap-2 text-right">
        <span className="font-mono text-sm font-medium text-ink tabular-nums">
          {value}
        </span>
        {meta && <span className="text-[13px] text-ink-muted">{meta}</span>}
      </span>
    </div>
  );
}
