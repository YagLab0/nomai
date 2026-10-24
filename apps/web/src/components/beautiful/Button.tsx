// Vendored from beautiful-ui (MIT) — see VENDORED.md
"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "./focus";

const filledShadow = "shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]";

const variants = {
  primary: `bg-ink text-paper hover:opacity-90 ${filledShadow}`,
  secondary: "bg-white text-ink ring-1 ring-sand shadow-sm hover:bg-paper aria-expanded:bg-sand/50",
  ghost: "bg-sand/40 text-ink hover:bg-sand",
  accent: `bg-terra text-white hover:bg-terra-deep ${filledShadow}`,
  success: `bg-agua text-white hover:brightness-95 ${filledShadow}`,
  /* transparent until hovered — for dense toolbars/action rows */
  quiet: "text-ink hover:bg-sand/50",
} as const;

const sizes = {
  /* compact toolbar pill — fixed height, lighter weight */
  xs: "h-7 rounded-full px-2.5 text-[12px] font-normal leading-none gap-1",
  /* canonical action pill — 27px tall, roomy sides */
  sm: "h-[27px] px-3 text-[13px] leading-none rounded-full gap-1.5",
  md: "px-4 py-[9px] text-sm leading-none rounded-full gap-2",
} as const;

export type ButtonVariant = keyof typeof variants;
type ButtonSize = keyof typeof sizes;
type ButtonVariantProps = { variant?: ButtonVariant | null; size?: ButtonSize | null };

/* Pill-shaped by default — the app's core button style. Explicit symmetric
 * padding (not a fixed height) so the top/bottom spacing is always equal.
 * Upstream builds this with class-variance-authority; same signature here. */
export function buttonVariants({ variant, size }: ButtonVariantProps = {}) {
  return cn(
    `inline-flex items-center justify-center font-medium select-none
     transition-[transform,background-color,opacity] duration-150 ease-out
     active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none
     motion-reduce:active:scale-100`,
    focusRing,
    variants[variant ?? "secondary"],
    sizes[size ?? "md"],
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariantProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
