// Vendored from beautiful-ui (MIT) — see VENDORED.md
/** Small progress ring with content in the center — the task-badge from the refs. */
export function ProgressRing({
  progress,
  tone = "orange",
  children,
  size = 28,
}: {
  progress: number; // 0..1
  tone?: "orange" | "green" | "red" | "accent";
  children?: React.ReactNode;
  size?: number;
}) {
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tones = {
    orange: "var(--terra)",
    green: "var(--agua)",
    red: "var(--terra-deep)",
    accent: "var(--terra)",
  };
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(1, Math.max(0, progress)) * 100)}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--sand)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tones[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
          className="motion-reduce:transition-none"
          style={{ transition: "stroke-dashoffset 400ms cubic-bezier(0.23,1,0.32,1)" }}
        />
      </svg>
      <span className="relative font-mono text-[12px] font-semibold tabular-nums">
        {children}
      </span>
    </span>
  );
}
