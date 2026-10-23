/** Layered hill silhouettes drawn in CSS colors: the Quebrada as a flat landscape. */

function ridge(seed: number, base: number, amp: number, w = 400, h = 200): string {
  const pts: string[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const x = (w / steps) * i;
    const y =
      base +
      Math.sin(i * 0.31 + seed) * amp +
      Math.sin(i * 0.73 + seed * 2.1) * amp * 0.45 +
      Math.cos(i * 0.12 + seed * 0.7) * amp * 0.6;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${pts.join(' ')} L${w} ${h} L0 ${h} Z`;
}

export function HillArt({
  palette,
  seed,
  stripes = false,
  className,
}: {
  palette: [string, string, string, string];
  seed: number;
  stripes?: boolean;
  className?: string;
}) {
  const id = `stripes-${seed}`;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMax slice"
      className={className}
    >
      <rect width="400" height="200" fill={palette[0]} />
      <circle cx={80 + seed * 40} cy="46" r="18" fill="var(--agua)" opacity="0.85" />
      <path d={ridge(seed, 110, 14)} fill={palette[1]} />
      {stripes ? (
        <>
          <defs>
            <clipPath id={id}>
              <path d={ridge(seed + 3, 128, 18)} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id})`}>
            {['var(--terra)', 'var(--terra-soft)', 'var(--agua)', 'var(--terra-deep)', 'var(--sand)', 'var(--terra)', 'var(--agua-soft)'].map(
              (c, i) => (
                <rect key={i} x="0" y={90 + i * 16} width="400" height="16" fill={c} />
              ),
            )}
          </g>
        </>
      ) : (
        <path d={ridge(seed + 3, 128, 18)} fill={palette[2]} />
      )}
      <path d={ridge(seed + 7, 168, 12)} fill={palette[3]} />
    </svg>
  );
}
