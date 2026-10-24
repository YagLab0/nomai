'use client';

import { useEffect, useRef, useState } from 'react';

import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Counts from 0 to `to` once when it scrolls into view (ease-out cubic).
 * Snaps to the final value under reduced motion.
 */
export function CountUp({
  to,
  format,
  duration = 1200,
  className,
}: {
  to: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        if (reduced) {
          setValue(to);
          return;
        }
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          setValue(to * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {format ? format(value) : Math.round(value).toLocaleString('es-AR')}
    </span>
  );
}

/** BRL-formatted count-up, callable from server components (no function prop). */
export function CountUpBRL({
  to,
  withCode = true,
  className,
}: {
  to: number;
  withCode?: boolean;
  className?: string;
}) {
  return <CountUp to={to} format={(n) => formatBRL(n, { withCode })} className={className} />;
}
