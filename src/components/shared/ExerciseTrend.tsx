import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { formatSetLine, type GridCell, type GridRow, type GridSet } from '../../../supabase/functions/_shared/historyGrid.mjs';
import { getStatusLabel } from '@/utils/statusCalculator';
import type { ExerciseStatus } from '@/types';

// The four meanings of a History cell, in the app's saturated tokens so a
// small dot still reads on either theme.
export const STATUS_INK: Record<string, string> = {
  new: 'var(--lb-ref)',
  improved: 'var(--lb-gain)',
  same: 'var(--color-text-secondary)',
  decreased: 'var(--lb-drop)',
};

const RIR_LABEL: Record<string, string> = { rir1: '+1', rir2: '+2', rir3: '+3', '+1': '+1', '+2': '+2', '+3': '+3' };
const RIR_VALUE: Record<string, number> = { rir1: 1, rir2: 2, rir3: 3, '+1': 1, '+2': 2, '+3': 3 };

// The heaviest set of the week; among equal weights, the first one logged.
export const topSet = (sets: GridSet[]) => sets.reduce((best, set) => (set.weight > best.weight ? set : best), sets[0]);
export const repsLabel = (set: GridSet) => `${set.reps}${RIR_LABEL[set.intensity] ?? ''}`;
export const kg = (value: number) => String(Math.round(value * 100) / 100);

type Recorded = { index: number; top: GridSet; status: string };

/** Records of a row with sets, in week order, with their heaviest set. */
export function recordedPoints(cells: GridCell[]): Recorded[] {
  return cells.flatMap((cell, index) => cell.sets?.length ? [{ index, top: topSet(cell.sets), status: cell.status ?? 'same' }] : []);
}

/** A y scale over the heaviest sets; a flat line sits in the middle. */
function scaleFor(points: Recorded[], top: number, bottom: number, pad: number) {
  const weights = points.map(point => point.top.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min;
  const lo = span ? min - span * pad : min - 1;
  const hi = span ? max + span * pad : max + 1;
  return { min, max, span, y: (value: number) => bottom - ((value - lo) / (hi - lo)) * (bottom - top) };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** The row's trend at a glance: no axes, no labels, one dot per record. */
export function Sparkline({ cells, className = '', height = 32 }: { cells: GridCell[]; className?: string; height?: number }) {
  const [ref, width] = useWidth<HTMLSpanElement>();
  const points = recordedPoints(cells);
  const step = cells.length ? width / cells.length : 0;
  const x = (index: number) => step * (index + 0.5);
  const { y } = scaleFor(points, 5, height - 5, 0.12);
  const last = points[points.length - 1];
  return (
    <span ref={ref} className={`block ${className}`} style={{ height }} aria-hidden="true">
      {width > 0 && points.length > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <polyline fill="none" points={points.map(p => `${x(p.index)},${y(p.top.weight)}`).join(' ')}
            style={{ stroke: 'var(--color-text-secondary)' }} strokeOpacity="0.7" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
          {points.map(point => (
            <circle key={point.index} cx={x(point.index)} cy={y(point.top.weight)} r={point === last ? 3 : 1.75}
              style={{ fill: STATUS_INK[point.status] ?? 'var(--color-text-secondary)' }} />
          ))}
        </svg>
      )}
    </span>
  );
}

/** How the heaviest set moved from the phase's first record to its last. */
export function phaseChange(cells: GridCell[]): string {
  const points = recordedPoints(cells);
  if (points.length < 2) return '—';
  const first = points[0].top;
  const last = points[points.length - 1].top;
  const weight = Math.round((last.weight - first.weight) * 100) / 100;
  if (weight) return `${weight > 0 ? '+' : '−'}${kg(Math.abs(weight))} kg`;
  // Same weight: reps and reserve both count, as they do for the colours.
  const reps = last.reps - first.reps;
  const reserve = (RIR_VALUE[last.intensity] ?? 0) - (RIR_VALUE[first.intensity] ?? 0);
  const parts = [];
  if (reps) parts.push(`${reps > 0 ? '+' : '−'}${Math.abs(reps)} tekrar`);
  if (reserve) parts.push(`${reserve > 0 ? '+' : '−'}${Math.abs(reserve)} RIR`);
  return parts.length ? parts.join(' · ') : 'aynı';
}

const HEIGHT = 168;
const PAD = { top: 28, right: 12, bottom: 24, left: 44 };

/**
 * One exercise across a phase, full size: the heaviest set's weight per week,
 * a dot per record coloured like its History cell. Hovering or tapping a week
 * shows that week's sets; reps are only written for that week.
 */
export function TrendChart({ row, startWeek }: { row: GridRow; startWeek: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const areaId = useId();

  const cells = row.cells;
  const step = cells.length ? Math.max(0, width - PAD.left - PAD.right) / cells.length : 0;
  const x = (index: number) => PAD.left + step * (index + 0.5);
  const plotBottom = HEIGHT - PAD.bottom;
  const recorded = recordedPoints(cells);
  const { min, max, span, y } = scaleFor(recorded, PAD.top, plotBottom, 0.18);
  const points = recorded.map(point => ({ ...point, x: x(point.index), y: y(point.top.weight) }));

  const shownIndex = active ?? points[points.length - 1]?.index ?? null;
  const shown = shownIndex === null ? null : cells[shownIndex];
  const shownTop = shown?.sets?.length ? topSet(shown.sets) : null;
  const shownStatus = shown?.status ?? null;
  let detail = 'Kayıt yok';
  if (shownStatus === 'holiday') detail = 'Tatil';
  else if (shown?.sets?.length && shownStatus) detail = `${getStatusLabel(shownStatus as ExerciseStatus)} · ${shown.sets.map(formatSetLine).join(' / ')}`;

  // Week labels at least ~40 px apart, counted back from the latest week.
  const labelEvery = step ? Math.max(1, Math.ceil(40 / step)) : 1;
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    if (!step) return;
    const left = event.currentTarget.getBoundingClientRect().left;
    const index = Math.floor((event.clientX - left - PAD.left) / step);
    setActive(Math.max(0, Math.min(cells.length - 1, index)));
  };
  const area = points.length > 1
    ? `M${points[0].x},${points[0].y} ${points.slice(1).map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${plotBottom} L${points[0].x},${plotBottom} Z`
    : null;
  const shownPoint = points.find(point => point.index === shownIndex);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="lb-label flex items-center gap-1.5 min-w-0">
          <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0"
            style={{ background: shownStatus && STATUS_INK[shownStatus] ? STATUS_INK[shownStatus] : 'transparent',
              boxShadow: shownStatus && STATUS_INK[shownStatus] ? undefined : 'inset 0 0 0 1px var(--lb-rule-strong)' }} />
          <span className="truncate">
            {shownIndex !== null && <span className="lb-figure text-(--color-text-primary)">H{cells[shownIndex].week - startWeek}</span>} · {detail}
          </span>
        </p>
        <p className="lb-figure shrink-0 whitespace-nowrap">
          {shownTop ? (
            <>
              <span className="text-lg font-semibold">{kg(shownTop.weight)}</span>
              <span className="text-xs text-(--color-text-secondary) ml-0.5">kg</span>
              <span className="text-sm text-(--color-text-secondary) ml-1.5">× {repsLabel(shownTop)}</span>
            </>
          ) : <span className="text-lg text-(--color-text-secondary)">—</span>}
        </p>
      </div>

      <div ref={ref} className="mt-1">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" className="block select-none" style={{ touchAction: 'pan-y' }}
            aria-label={`${row.name}: haftalara göre en ağır set`}
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null); }}>
            <defs>
              <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-text-primary)" stopOpacity="0.08" />
                <stop offset="100%" stopColor="var(--color-text-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Weight scale: the phase's lightest and heaviest top set */}
            {(span ? [max, min] : [max]).map(value => (
              <g key={value}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(value)} y2={y(value)} style={{ stroke: 'var(--lb-rule)' }} strokeDasharray="2 4" />
                <text x={PAD.left - 8} y={y(value) + 3.5} textAnchor="end" className="lb-figure" fontSize="10" style={{ fill: 'var(--color-text-secondary)' }}>{kg(value)}</text>
              </g>
            ))}

            {cells.map((cell, index) => cell.status === 'holiday' && (
              <rect key={cell.week} x={PAD.left + step * index + 1} y={PAD.top - 8} width={Math.max(0, step - 2)} height={plotBottom - PAD.top + 8}
                rx="3" style={{ fill: 'var(--color-text-secondary)' }} opacity="0.08" />
            ))}

            {shownIndex !== null && (
              <line x1={x(shownIndex)} x2={x(shownIndex)} y1={PAD.top - 10} y2={plotBottom} style={{ stroke: 'var(--lb-rule)' }} />
            )}

            {area && <path d={area} fill={`url(#${areaId})`} />}
            {points.slice(1).map((point, i) => {
              const previous = points[i];
              // Weeks without a record between two dots: keep the line, dashed.
              return (
                <line key={point.index} x1={previous.x} y1={previous.y} x2={point.x} y2={point.y}
                  style={{ stroke: 'var(--color-text-secondary)' }} strokeWidth="1.5" strokeLinecap="round"
                  strokeDasharray={point.index - previous.index > 1 ? '3 4' : undefined} />
              );
            })}

            {points.map(point => (
              <circle key={point.index} cx={point.x} cy={point.y} r={point.index === shownIndex ? 5.5 : 3.5}
                style={{ fill: STATUS_INK[point.status] ?? 'var(--color-text-secondary)', stroke: 'var(--color-bg-primary)' }} strokeWidth="2" />
            ))}
            {shownPoint && (
              <text x={shownPoint.x} y={shownPoint.y - 11} textAnchor="middle" className="lb-figure" fontSize="11" fontWeight="600"
                style={{ fill: 'var(--color-text-primary)' }}>
                {repsLabel(shownPoint.top)}
              </text>
            )}

            {/* The shown week always has its label; regular ones near it step aside. */}
            {cells.map((cell, index) => (index === shownIndex || ((cells.length - 1 - index) % labelEvery === 0
              && (shownIndex === null || Math.abs(index - shownIndex) >= labelEvery))) && (
              <text key={cell.week} x={x(index)} y={HEIGHT - 6} textAnchor="middle" className="lb-figure" fontSize="10"
                style={{ fill: index === shownIndex ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                H{cell.week - startWeek}
              </text>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
