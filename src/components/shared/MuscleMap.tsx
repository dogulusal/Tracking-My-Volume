import type { Region } from '@/data/muscleRegions';

// A shape of a region on one side of the body: ellipses and rounded boxes,
// mirrored left and right. A pictogram, not anatomy: enough to say where.
type Shape = { region: Region; d: string } | { region: Region; cx: number; cy: number; rx: number; ry: number };

const pair = (region: Region, cx: number, cy: number, rx: number, ry: number): Shape[] =>
  [{ region, cx, cy, rx, ry }, { region, cx: 100 - cx, cy, rx, ry }];
const box = (region: Region, x: number, y: number, w: number, h: number, r = 4): Shape =>
  ({ region, d: `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - 2 * r}a${r},${r} 0 0 1 -${r},-${r}v-${h - 2 * r}a${r},${r} 0 0 1 ${r},-${r}z` });

const FRONT: Shape[] = [
  ...pair('Yan omuz', 24, 43, 5, 8),
  ...pair('Ön omuz', 32, 41, 6, 7),
  box('Üst göğüs', 38, 35, 11, 9), box('Üst göğüs', 51, 35, 11, 9),
  box('Göğüs', 37, 45, 12, 12), box('Göğüs', 51, 45, 12, 12),
  ...pair('Biceps', 22, 61, 5, 11),
  ...pair('Ön kol', 19, 87, 4.5, 12),
  box('Karın', 42, 60, 16, 33, 5),
  ...pair('Dış kalça', 34, 101, 4, 7),
  ...pair('Ön bacak', 40.5, 126, 7, 22),
  ...pair('İç bacak', 47, 119, 2.8, 14),
  ...pair('Baldır', 41, 168, 5, 14),
];

const BACK: Shape[] = [
  { region: 'Trapez', d: 'M50,26 L64,37 L50,54 L36,37 Z' },
  ...pair('Yan omuz', 24, 43, 5, 8),
  ...pair('Arka omuz', 31, 41, 6.5, 7),
  ...pair('Triceps', 22, 61, 5, 11),
  ...pair('Ön kol', 19, 87, 4.5, 12),
  { region: 'Kanat', d: 'M36,47 L44,52 L46,79 L38,75 L33,58 Z' },
  { region: 'Kanat', d: 'M64,47 L56,52 L54,79 L62,75 L67,58 Z' },
  box('Orta sırt', 44.5, 41, 11, 20, 3),
  box('Bel', 43, 79, 14, 14, 4),
  ...pair('Dış kalça', 33, 99, 4, 7),
  ...pair('Kalça', 43, 103, 8, 9),
  ...pair('Arka bacak', 42, 129, 7, 20),
  ...pair('Baldır', 42, 167, 6, 14),
];

function Figure({ shapes, label, fillOf }: { shapes: Shape[]; label: string; fillOf: (region: Region) => string }) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 100 190" className="w-[84px] h-[160px]" aria-hidden="true">
        <circle cx="50" cy="15" r="9.5" style={{ fill: 'var(--color-bg-input)' }} />
        <rect x="46" y="24" width="8" height="6" rx="2" style={{ fill: 'var(--color-bg-input)' }} />
        {shapes.map((shape, index) => 'd' in shape
          ? <path key={index} d={shape.d} style={{ fill: fillOf(shape.region) }} />
          : <ellipse key={index} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} style={{ fill: fillOf(shape.region) }} />)}
      </svg>
      <figcaption className="text-[12px] text-(--color-text-secondary)">{label}</figcaption>
    </figure>
  );
}

/**
 * Where a movement works, front and back: the main region solid, the ones
 * that also work in a lighter shade. Monochrome on purpose — colour in this
 * app means gain, drop or a first record.
 */
export function MuscleMap({ regions }: { regions: Region[] }) {
  const [main, ...also] = regions;
  const fillOf = (region: Region) => region === main ? 'var(--color-text-primary)'
    : also.includes(region) ? 'color-mix(in srgb, var(--color-text-primary) 40%, var(--color-bg-input))'
    : 'var(--color-bg-input)';
  const label = main ? `Çalıştırdığı bölgeler: ${main} (ana)${also.length ? `, ${also.join(', ')}` : ''}` : 'Bölge seçilmedi';
  return (
    <div role="img" aria-label={label} className="flex justify-center gap-8">
      <Figure shapes={FRONT} label="Ön" fillOf={fillOf} />
      <Figure shapes={BACK} label="Arka" fillOf={fillOf} />
    </div>
  );
}
