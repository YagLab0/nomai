import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-8 w-8',
  md: 'h-11 w-11',
  lg: 'h-20 w-20',
} as const;

const SHAPES = {
  /** Round avatar for chat messages and headers. */
  disc: 'rounded-full',
  /** Rounded-square app icon, same art as `src/app/icon.svg`. */
  icon: 'rounded-[24%]',
} as const;

export interface NomitoAvatarProps {
  size?: keyof typeof SIZES;
  shape?: keyof typeof SHAPES;
  className?: string;
}

/**
 * Nomito, the Agent's face: a loro alisero (Amazona tucumana, the parrot of the
 * Yungas of Salta, Jujuy and Tucumán) in bold ink outlines. Agua plumage, terra
 * forehead. The wrapper's background shows around the bird and its shape clips
 * the art, so `className="bg-paper"` re-skins it.
 */
export function NomitoAvatar({ size = 'md', shape = 'disc', className }: NomitoAvatarProps) {
  return (
    <span
      role="img"
      aria-label="Nomito"
      className={cn(
        'relative inline-flex shrink-0 select-none overflow-hidden bg-terra',
        SIZES[size],
        SHAPES[shape],
        className,
      )}
    >
      <NomitoArt className="h-full w-full" />
    </span>
  );
}

/** The parrot alone, on a transparent 100×100 canvas. Decorative. */
export function NomitoArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className}>
      <g transform="translate(-5 3)" stroke="#2A1E17" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round">
        {/* head and neck */}
        <path d="M-6 106C-8 58 16 20 48 17c16-2 26 7 30 17l2 26c-6 16-14 30-16 46Z" fill="#3E9C93" />
        {/* nape */}
        <path d="M-6 106C-4 72 10 46 30 34c-8 18-6 44 4 72Z" fill="#2C7A72" />
        {/* face */}
        <path d="M36 31c-9 15-5 35 11 43 11 5 21 2 27-6l2-30C66 28 50 24 36 31Z" fill="#8ACFC5" />
        {/* red forehead, the alisero's mark */}
        <path d="M40 27c12-11 30-9 38 6-10-2-20-1-28 5-4-4-8-7-10-11Z" fill="#B4552D" />
        {/* wing */}
        <circle cx="4" cy="96" r="22" fill="#8ACFC5" />
        {/* lower mandible */}
        <path d="M70 58c8 1 13 6 13 13-6 3-13 1-16-6Z" fill="#7A6A5E" />
        {/* hooked upper mandible */}
        <path d="M72 34c12-4 23 6 23 21 0 10-4 18-10 24 0-9-3-16-13-19Z" fill="#EADFD2" />
      </g>
      <g transform="translate(-5 3)">
        <circle cx="56" cy="48" r="12" fill="#FBF6F0" />
        <circle cx="56" cy="48" r="7.5" fill="#2A1E17" />
        <circle cx="58.6" cy="45.4" r="2.5" fill="#FBF6F0" />
      </g>
    </svg>
  );
}
