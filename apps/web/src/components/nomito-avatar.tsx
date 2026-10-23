import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-8 w-8 text-lg',
  md: 'h-11 w-11 text-2xl',
  lg: 'h-20 w-20 text-5xl',
} as const;

export interface NomitoAvatarProps {
  size?: keyof typeof SIZES;
  className?: string;
}

/** Nomito, the Agent's face: terracotta disc, lowercase n, agua sun-dot. */
export function NomitoAvatar({ size = 'md', className }: NomitoAvatarProps) {
  return (
    <span
      role="img"
      aria-label="Nomito"
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center rounded-full bg-terra font-brand font-semibold leading-none text-paper',
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden="true" className="-translate-y-[6%]">n</span>
      <span
        aria-hidden="true"
        className="absolute right-[10%] top-[10%] h-[22%] w-[22%] rounded-full bg-agua ring-2 ring-terra"
      />
    </span>
  );
}
