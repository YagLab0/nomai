import { HillArt } from '@/components/landing/hills';
import type { ArtTone, Lodging } from '@/lib/lodgings';

type Palette = Parameters<typeof HillArt>[0]['palette'];

const TONES: Record<ArtTone, { palette: Palette; stripes?: boolean }> = {
  terra: { palette: ['var(--terra-soft)', 'var(--sand)', 'var(--terra)', 'var(--terra-deep)'] },
  agua: { palette: ['var(--agua-soft)', 'var(--agua)', 'var(--terra)', 'var(--terra-deep)'] },
  sand: { palette: ['var(--sand)', 'var(--terra-soft)', 'var(--terra)', 'var(--terra-deep)'] },
  'siete-colores': {
    palette: ['var(--terra-soft)', 'var(--agua)', 'var(--terra)', 'var(--terra-deep)'],
    stripes: true,
  },
};

/** Flat landscape placeholder for a Lodging, seeded from its id so each card differs. */
export function LodgingArt({ lodging, className }: { lodging: Lodging; className?: string }) {
  const seed = [...lodging.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 9;
  const tone = TONES[lodging.tone];
  return <HillArt palette={tone.palette} stripes={tone.stripes} seed={seed} className={className} />;
}
