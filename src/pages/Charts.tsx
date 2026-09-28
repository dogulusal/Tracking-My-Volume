import { useContext, useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { STATUS_INK, Sparkline, TrendChart, kg, phaseChange, repsLabel, topSet } from '@/components/shared/ExerciseTrend';
import { AppContext } from '@/context/AppContext';
import { currentPhaseIndex, startedPhases } from '@/utils/phases';
import { buildPhaseGrid, type GridRow } from '../../supabase/functions/_shared/historyGrid.mjs';

const CHARTS_STATE_KEY = 'charts-page-state-v1';
const COUNTED = [
  { status: 'improved', label: 'ilerleme' },
  { status: 'same', label: 'aynı' },
  { status: 'decreased', label: 'düşüş' },
  { status: 'new', label: 'referans' },
] as const;
type Counted = typeof COUNTED[number]['status'];

/** One exercise as a line of the list; opening it draws the full chart. */
function ExerciseLine({ row, startWeek, open, onToggle }: { row: GridRow; startWeek: number; open: boolean; onToggle: () => void }) {
  const last = [...row.cells].reverse().find(cell => cell.sets?.length);
  const top = last?.sets ? topSet(last.sets) : null;
  return (
    <li className="border-b lb-rule">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="lb-press w-full flex items-center gap-3 md:gap-6 -mx-2 px-2 py-3 rounded text-left">
        <span className="flex-1 min-w-0 text-sm font-medium truncate">{row.name}</span>
        <Sparkline cells={row.cells} className="w-20 sm:w-40 lg:w-72 shrink-0" />
        <span className="w-28 md:w-32 shrink-0 flex items-center justify-end gap-2 lb-figure text-sm whitespace-nowrap">
          <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: last?.status ? STATUS_INK[last.status] : undefined }} />
          {top && <span>{kg(top.weight)}<span className="text-(--color-text-secondary)"> × {repsLabel(top)}</span></span>}
        </span>
        <span className="hidden md:block w-24 shrink-0 text-right lb-figure text-xs text-(--color-text-secondary)">{phaseChange(row.cells)}</span>
        <span aria-hidden="true" className={`w-3 shrink-0 text-(--color-text-secondary) transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && <div className="lb-settle pt-1 pb-5"><TrendChart row={row} startWeek={startWeek} /></div>}
    </li>
  );
}

/**
 * Every exercise of a training day across one phase, drawn from the same grid
 * as History: same rows, same records, same colours.
 */
export function Charts() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('Charts must be used within AppProvider');
  const { state } = ctx;
  const currentWeek = state.currentWeek;

  const phases = useMemo(() => startedPhases(state.phases ?? [], currentWeek), [state.phases, currentWeek]);
  const [phaseIndex, setPhaseIndex] = useState(() => currentPhaseIndex(phases, currentWeek));
  const phase = phases[phaseIndex] ?? phases[0];
  const grid = useMemo(() => phase ? buildPhaseGrid(state, phase.id) : null, [state, phase]);
  const programs = grid?.programs ?? [];

  const [programId, setProgramId] = useState(() => {
    try { return localStorage.getItem(CHARTS_STATE_KEY) ?? ''; } catch { return ''; }
  });
  const program = programs.find(p => p.id === programId) ?? programs[0];
  useEffect(() => {
    try { if (program) localStorage.setItem(CHARTS_STATE_KEY, program.id); } catch { /* ignore */ }
  }, [program]);

  const counts = useMemo(() => {
    const result: Record<Counted, number> = { improved: 0, same: 0, decreased: 0, new: 0 };
    for (const row of program?.rows ?? []) {
      for (const cell of row.cells) if (cell.status && cell.status in result) result[cell.status as Counted]++;
    }
    return result;
  }, [program]);
  const compared = counts.improved + counts.same + counts.decreased;
  const charted = program?.rows.filter(row => row.cells.some(cell => cell.sets?.length)) ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const unrecorded = program?.rows.filter(row => !charted.includes(row)) ?? [];

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Grafikler</h1>
        <p className="lb-label mt-1">Her hareketin en ağır seti, hafta hafta. Renkler Geçmiş tablosuyla aynı.</p>
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-3">
        {programs.map(p => (
          <button key={p.id} onClick={() => setProgramId(p.id)}
            className={`lb-press px-3 py-2 rounded-lg text-sm border-b-2 ${
              program?.id === p.id
                ? 'font-semibold border-(--color-text-primary)'
                : 'font-medium border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)'
            }`}>
            {p.name}
          </button>
        ))}
      </div>

      {phases.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 mb-4">
          {phases.map((item, index) => (
            <button key={item.id} onClick={() => setPhaseIndex(index)}
              className={`lb-press px-3 py-1.5 rounded-lg text-xs ${
                phase?.id === item.id
                  ? 'font-semibold text-(--color-text-primary)'
                  : 'font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)'
              }`}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      {!program ? (
        <p className="text-(--color-text-secondary)">Henüz program yok.</p>
      ) : (
        <>
          {/* The phase at a glance: how the compared weeks went */}
          <section className="lb-settle py-5 border-y lb-rule">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <p className="lb-figure text-3xl font-semibold">
                  {compared ? `%${Math.round((counts.improved / compared) * 100)}` : '—'}
                </p>
                <p className="lb-label mt-1.5">
                  {compared ? `${program.name} · ${compared} karşılaştırmada ilerleme` : `${program.name} · karşılaştıracak ikinci kayıt yok`}
                </p>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {COUNTED.map(({ status, label }) => (
                  <li key={status} className="flex items-center gap-1.5 lb-label">
                    <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: STATUS_INK[status] }} />
                    <span className="lb-figure text-sm font-semibold text-(--color-text-primary)">{counts[status]}</span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            {compared > 0 && (
              <div className="mt-4 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {COUNTED.slice(0, 3).map(({ status }) => counts[status] > 0 && (
                  <span key={status} style={{ flexGrow: counts[status], background: STATUS_INK[status] }} />
                ))}
              </div>
            )}
          </section>

          {charted.length === 0 ? (
            <p className="lb-label py-10 text-center">Bu fazda {program.name} için kayıt yok.</p>
          ) : (
            <>
              <div className="hidden md:flex items-center gap-6 pt-5 pb-2 border-b lb-rule lb-label">
                <span className="flex-1">Hareket</span>
                <span className="w-20 sm:w-40 lg:w-72">Seyir · en ağır set</span>
                <span className="w-32 text-right">Son kayıt</span>
                <span className="w-24 text-right">Faz başından</span>
                <span className="w-3" />
              </div>
              <ul className="lb-settle">
                {charted.map(row => (
                  <ExerciseLine key={row.exerciseId} row={row} startWeek={grid!.startWeek} open={openId === row.exerciseId}
                    onToggle={() => setOpenId(id => id === row.exerciseId ? null : row.exerciseId)} />
                ))}
              </ul>
            </>
          )}
          {unrecorded.length > 0 && (
            <p className="lb-label mt-5">Bu fazda kaydı olmayan: {unrecorded.map(row => row.name).join(', ')}</p>
          )}
        </>
      )}
    </PageContainer>
  );
}
