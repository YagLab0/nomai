// Vendored from beautiful-ui (MIT) — see VENDORED.md
type Tone = "neutral" | "green" | "orange" | "red" | "accent";

const TONES: Record<Tone, { cls: string; ring: string }> = {
  neutral: { cls: "bg-paper text-ink-muted", ring: "var(--ring-1 ring-sand)" },
  green: { cls: "bg-agua-soft text-agua", ring: "0 0 0 1px color-mix(in srgb, var(--agua) 28%, transparent)" },
  orange: { cls: "bg-terra-soft text-terra", ring: "0 0 0 1px color-mix(in srgb, var(--terra) 28%, transparent)" },
  red: { cls: "bg-terra-deep/10 text-terra-deep", ring: "0 0 0 1px color-mix(in srgb, var(--terra-deep) 28%, transparent)" },
  accent: { cls: "bg-terra-soft text-terra-deep", ring: "0 0 0 1px color-mix(in srgb, var(--terra) 28%, transparent)" },
};

/** Inline value badge — a plain value (a date, a name, a count) set off in
 *  prose. Softer than a StatusPill (no dot) and not a mono token (see Chip). */
export function ValuePill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={`mx-0.5 inline-flex items-center rounded-full px-1.5 py-0
        align-middle text-[12px] font-medium ${t.cls} ${className}`}
      style={{ boxShadow: t.ring }}
    >
      {children}
    </span>
  );
}
