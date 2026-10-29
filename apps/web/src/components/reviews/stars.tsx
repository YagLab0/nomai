'use client';

import { StarIcon } from '@/components/icons';

const SIZES = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-6 w-6' } as const;

/**
 * A 1–5 star rating on the nomai scale (ADR-0008). Half steps render as a
 * clipped fill — the same convention lodging cards already use via `rating`.
 */
export function Stars({
  rating,
  size = 'sm',
  className = '',
}: {
  rating: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const star = SIZES[size];
  return (
    <span
      role="img"
      aria-label={`${rating.toFixed(1)} de 5`}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.min(1, Math.max(0, rating - (i - 1)));
        return fill >= 0.75 ? (
          <StarIcon key={i} className={`${star} text-terra`} />
        ) : fill <= 0.25 ? (
          <StarIcon key={i} className={`${star} text-sand`} />
        ) : (
          <span key={i} className={`relative ${star}`} aria-hidden="true">
            <StarIcon className={`absolute inset-0 ${star} text-sand`} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <StarIcon className={`${star} text-terra`} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Interactive 1–5 picker used inside ReviewModal. */
export function StarInput({
  value,
  onChange,
  size = 'lg',
  'aria-label': ariaLabel = 'Calificación en estrellas',
}: {
  value: number;
  onChange: (v: number) => void;
  size?: keyof typeof SIZES;
  'aria-label'?: string;
}) {
  const star = SIZES[size];
  return (
    <span role="radiogroup" aria-label={ariaLabel} className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} estrella${i === 1 ? '' : 's'}`}
          onClick={() => onChange(i)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-terra"
        >
          <StarIcon className={`${star} ${i <= value ? 'text-terra' : 'text-sand'}`} />
        </button>
      ))}
    </span>
  );
}
