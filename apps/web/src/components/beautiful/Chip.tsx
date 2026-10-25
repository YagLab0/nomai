// Vendored from beautiful-ui (MIT) — see VENDORED.md
/** Monospace token chip — for code values like `updated_at`. */
export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "orange";
  className?: string;
}) {
  const tones = {
    neutral: "bg-paper text-ink-muted ring-1 ring-sand",
    accent: "bg-terra-soft text-terra-deep",
    orange: "bg-terra-soft text-terra",
  };
  return (
    <code
      className={`inline rounded-md px-1.5 py-0.5 font-mono text-[12px]
        leading-none align-[-1px] ${tones[tone]} ${className}`}
    >
      {children}
    </code>
  );
}
