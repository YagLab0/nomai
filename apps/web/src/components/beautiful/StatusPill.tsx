// Vendored from beautiful-ui (MIT) — see VENDORED.md
import { cn } from "@/lib/utils";

const tones = {
  green: "bg-agua-soft text-agua",
  orange: "bg-terra-soft text-terra",
  red: "bg-terra-deep/10 text-terra-deep",
  accent: "bg-terra-soft text-terra-deep",
  neutral: "bg-paper text-ink-muted ring-1 ring-sand",
} as const;

type Tone = keyof typeof tones;

/* the leading dot lives on a separate element, so its color stays a small lookup */
const dotColor: Record<Tone, string> = {
  green: "bg-agua",
  orange: "bg-terra",
  red: "bg-terra-deep",
  accent: "bg-terra",
  neutral: "bg-ink-muted/60",
};

export function StatusPill({
  tone = "neutral",
  children,
  dot = true,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium leading-none",
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", dotColor[tone])} />}
      {children}
    </span>
  );
}
