'use client';

import { useEffect, useRef, useState } from 'react';

export interface OwnerSection {
  id: string;
  label: string;
  /** A count chip next to the label (e.g. unread messages). */
  badge?: number;
  /** Paint the badge as an alert (terra) instead of a neutral count. */
  alert?: boolean;
}

/**
 * The Owner panel's sticky section bar: jumps to each block of the page and
 * highlights the one being read (scroll-spy). Scrolls sideways on phones.
 */
export function OwnerSectionNav({ sections }: { sections: OwnerSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const [headerHeight, setHeaderHeight] = useState(0);
  const navRef = useRef<HTMLElement>(null);
  const ids = sections.map((s) => s.id).join(',');

  // OwnerShell's header is sticky too, so this bar parks right below it —
  // never over it — and re-measures when the header wraps at another width.
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const measure = () => setHeaderHeight(header.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const targets = ids
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;

    // The reading line sits where an anchor lands: below the sticky header and
    // this bar, at the sections' scroll-margin. The last section whose heading
    // crossed it is the one being read — the first intersecting one is not
    // enough, or a tall previous section keeps winning after the user jumps.
    const edge = () => {
      const margin = parseFloat(getComputedStyle(targets[0]).scrollMarginTop) || 0;
      const navHeight = navRef.current?.getBoundingClientRect().height ?? 0;
      return Math.max(headerHeight + navHeight + 8, margin);
    };

    let frame = 0;
    const update = () => {
      frame = 0;
      const limit = edge();
      let current = targets[0].id;
      for (const target of targets) {
        if (target.getBoundingClientRect().top <= limit + 1) current = target.id;
      }
      // On a short page the last section never crosses the line: at the very
      // bottom of the scroll, highlight it anyway.
      const doc = document.documentElement;
      if (window.scrollY + window.innerHeight >= doc.scrollHeight - 2) {
        current = targets[targets.length - 1].id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ids, headerHeight]);

  return (
    <nav
      ref={navRef}
      aria-label="Secciones del panel"
      style={{ top: headerHeight }}
      className="sticky z-30 -mx-4 border-b border-sand bg-paper/90 px-4 backdrop-blur sm:mx-0 sm:rounded-full sm:border sm:px-2"
    >
      <ul className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
        {sections.map((s) => {
          const current = s.id === active;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={current ? 'location' : undefined}
                onClick={() => setActive(s.id)}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-terra ${
                  current ? 'bg-ink text-white' : 'text-ink-muted hover:bg-sand/60 hover:text-ink'
                }`}
              >
                {s.label}
                {s.badge ? (
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold leading-none ${
                      s.alert ? 'bg-terra text-white' : current ? 'bg-white/20 text-white' : 'bg-sand text-ink'
                    }`}
                  >
                    {s.badge}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
