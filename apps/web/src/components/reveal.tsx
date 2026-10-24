'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Scroll-in reveal: fades + rises once when it enters the viewport. `delay`
 * staggers siblings. Renders instantly visible under reduced motion. Children
 * that fill their grid cell need `className="h-full"` on the wrapper too.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 16,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? 'none' : `translateY(${y}px)`,
    transition: `opacity 0.55s ease-out ${delay}ms, transform 0.6s cubic-bezier(0.2, 0.65, 0.3, 1) ${delay}ms`,
  };

  return (
    <div ref={ref} className={cn('will-change-transform', className)} style={style}>
      {children}
    </div>
  );
}
