'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Scroll-linked parallax for full-bleed media: drifts vertically as its parent
 * crosses the viewport. The media inside must be oversized (e.g. scale-[1.2])
 * so the drift never exposes an edge. Disabled under reduced motion.
 */
export function Parallax({
  children,
  factor = 0.18,
  className,
}: {
  children: ReactNode;
  /** Fraction of the parent's height the media drifts across the viewport. */
  factor?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const parent = el.parentElement ?? el;
    let raf = 0;

    const update = () => {
      raf = 0;
      const r = parent.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) return;
      const progress = (vh - r.top) / (vh + r.height);
      el.style.transform = `translateY(${((progress - 0.5) * r.height * factor).toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [factor]);

  return (
    <div ref={ref} aria-hidden="true" className={cn('will-change-transform', className)}>
      {children}
    </div>
  );
}
