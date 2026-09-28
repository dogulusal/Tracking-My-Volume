import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { formatSetLine, type GridRow, type GridSet } from '../../../supabase/functions/_shared/historyGrid.mjs';
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
const HEIGHT = 136;
const PAD = { top: 24, right: 8, bottom: 22, left: 40 };

// The heaviest set of the week; among equal weights, the first one logged.
const topSet = (sets: GridSet[]) => sets.reduce((best, set) => (set.weight > best.weight ? set : best), sets[0]);
const repsLabel = (set: GridSet) => `${set.reps}${RIR_LABEL[set.intensity] ?? ''}`;
const kg = (value: number) => String(Math.round(value * 100) / 100);

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

/**
 * One exercise across a phase: the heaviest set's weight per week, a dot per
 * record coloured like its History cell, reps above each dot. Hovering or
 * tapping a week shows that week's sets in the header.
 */
export function ExerciseTrend({ row, startWeek }: { row: GridRow; startWeek: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const areaId = useId();

  const cells = row.cells;
  const step = cells.length ? Math.max(0, width - PAD.left - PAD.right) / cells.length : 0;
  const x = (index: number) => PAD.left + step * (index + 0.5);
  const plotBottom = HEIGHT - PAD.bottom;

  const recorded = cells.flatMap((cell, index) => cell.sets?.length ? [{ index, top: topSet(cell.sets), status: cell.status ?? 'same' }] : []);
  const weights = recorded.map(point => point.top.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min;
  // A flat line sits in the middle rather than on an edge.
  const lo = span ? min - span * 0.18 : min - 1;
  const hi = span ? max + span * 0.18 : max + 1;
  const y = (value: number) => plotBottom - ((value - lo) / (hi - lo)) * (plotBottom - PAD.top);
  const points = recorded.map(point => ({ ...point, x: x(point.index), y: y(point.top.weight) }));

  const shownIndex = active ?? points[points.length - 1]?.index ?? null;
  const shown = shownIndex === null ? null : cells[shownIndex];
  const shownTop = shown?.sets?.length ? topSet(shown.sets) : null;
  const shownStatus = shown?.status ?? null;
  let detail = 'Kayıt yok';
  if (shownStatus === 'holiday') detail = 'Tatil';
  else if (shown?.sets?.length && shownStatus) {
    detail = getStatusLabel(shownStatus as ExerciseStatus);
    if (shown.sets.length > 1) detail += ` · ${shown.sets.map(formatSetLine).join(' / ')}`;
  }

  const showReps = step >= 26;
  const labelEvery = step ? Math.max(1, Math.ceil(26 / step)) : 1;
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    if (!step) return;
    const left = event.currentTarget.getBoundingClientRect().left;
    const index = Math.floor((event.clientX - left - PAD.left) / step);
    setActive(Math.max(0, Math.min(cells.length - 1, index)));
  };

  const area = points.length > 1
    ? `M${points[0].x},${points[0].y} ${points.slice(1).map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${plotBottom} L${points[0].x},${plotBottom} Z`
    : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{row.name}</h3>
          <p className="lb-label mt-1 flex items-center gap-1.5 min-w-0">
            <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0"
              style={{ background: shownStatus && STATUS_INK[shownStatus] ? STATUS_INK[shownStatus] : 'transparent',
                boxShadow: shownStatus && STATUS_INK[shownStatus] ? undefined : 'inset 0 0 0 1px var(--lb-rule-strong)' }} />
            <span className="truncate">
              {shownIndex !== null && <span className="lb-figure">H{cells[shownIndex].week - startWeek}</span>} · {detail}
            </span>
          </p>
        </div>
        <p className="lb-figure shrink-0 whitespace-nowrap text-right">
          {shownTop ? (
            <>
              <span className="text-xl font-semibold">{kg(shownTop.weight)}</span>
              <span className="text-xs text-(--color-text-secondary) ml-0.5">kg</span>
              <span className="text-sm text-(--color-text-secondary) ml-1.5">× {repsLabel(shownTop)}</span>
            </>
          ) : <span className="text-xl text-(--color-text-secondary)">—</span>}
        </p>
      </div>

      <div ref={ref} className="mt-2">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" className="block select-none" style={{ touchAction: 'pan-y' }}
            aria-label={`${row.name}: haftalara göre en ağır set`}
            onPointerMove={pick} onPointerDown={pick} onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null); }}>
            <defs>
              <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-text-primary)" stopOpacity="0.10" />
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
            <line x1={PAD.left} x2={width - PAD.right} y1={plotBottom} y2={plotBottom} style={{ stroke: 'var(--lb-rule-strong)' }} />

            {cells.map((cell, index) => cell.status === 'holiday' && (
              <rect key={cell.week} x={PAD.left + step * index + 1} y={PAD.top - 8} width={Math.max(0, step - 2)} height={plotBottom - PAD.top + 8}
                rx="3" style={{ fill: 'var(--color-text-secondary)' }} opacity="0.08" />
            ))}

            {active !== null && (
              <line x1={x(active)} x2={x(active)} y1={PAD.top - 12} y2={plotBottom} style={{ stroke: 'var(--lb-rule-strong)' }} />
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

            {points.map(point => {
              const isShown = point.index === shownIndex;
              return (
                <g key={point.index}>
                  <circle cx={point.x} cy={point.y} r={isShown ? 5.5 : 4}
                    style={{ fill: STATUS_INK[point.status] ?? 'var(--color-text-secondary)', stroke: 'var(--color-bg-primary)' }} strokeWidth="2" />
                  {(showReps || isShown) && (
                    <text x={point.x} y={point.y - 10} textAnchor="middle" className="lb-figure" fontSize="10"
                      style={{ fill: isShown ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                      {repsLabel(point.top)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Counted back from the latest week, so it always has a label. */}
            {cells.map((cell, index) => (cells.length - 1 - index) % labelEvery === 0 && (
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
