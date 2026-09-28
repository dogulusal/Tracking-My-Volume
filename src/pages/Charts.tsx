import { useContext, useEffect, useMemo, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { ExerciseTrend, STATUS_INK } from '@/components/shared/ExerciseTrend';
import { AppContext } from '@/context/AppContext';
import { currentPhaseIndex, startedPhases } from '@/utils/phases';
import { buildPhaseGrid } from '../../supabase/functions/_shared/historyGrid.mjs';

const CHARTS_STATE_KEY = 'charts-page-state-v1';
const COUNTED = [
  { status: 'improved', label: 'ilerleme' },
  { status: 'same', label: 'aynı' },
  { status: 'decreased', label: 'düşüş' },
  { status: 'new', label: 'referans' },
] as const;
type Counted = typeof COUNTED[number]['status'];

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
            <div className="grid md:grid-cols-2 md:gap-x-10">
              {charted.map((row, index) => (
                <div key={row.exerciseId} className="lb-settle py-5 border-b lb-rule" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                  <ExerciseTrend row={row} startWeek={grid!.startWeek} />
                </div>
              ))}
            </div>
          )}
          {unrecorded.length > 0 && (
            <p className="lb-label mt-5">Bu fazda kaydı olmayan: {unrecorded.map(row => row.name).join(', ')}</p>
          )}
        </>
      )}
    </PageContainer>
  );
}
