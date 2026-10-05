import { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { useReadOnly } from '@/context/ReadOnly';
import { BottomSheet } from '@/components/shared/BottomSheet';
import {
  MUSCLE_GROUPS, UNASSIGNED, blockPeriods, exerciseKey, groupOf, loggedExercises, muscleVolume, suggestedGroup, weeklyPeriods,
} from '@/utils/muscleGroups';

type Mode = 'week' | 'block';
const MODE_KEY = 'volume-period-mode';
const nf = new Intl.NumberFormat('tr-TR');

const signed = (value: number) => value === 0 ? '±0' : `${value > 0 ? '+' : '−'}${nf.format(Math.abs(value))}`;
// Neutral shading: the busiest period of a group is the darkest cell of its row.
const shade = (ratio: number) => ratio > 0 ? `color-mix(in srgb, var(--color-text-primary) ${Math.round(6 + ratio * 30)}%, transparent)` : undefined;

/**
 * Working sets per muscle group, week by week or in four-week blocks, across
 * every day and phase. Sets are the only measure shown: tonnage (kg × reps)
 * cannot compare a leg press with a lateral raise, and the user found the
 * "volume in kg" figure meaningless.
 */
export function MuscleVolume() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('MuscleVolume must be used within AppProvider');
  const { state, dispatch } = ctx;
  const readOnly = useReadOnly();
  const [mode, setModeState] = useState<Mode>(() => {
    try { return localStorage.getItem(MODE_KEY) === 'block' ? 'block' : 'week'; } catch { return 'week'; }
  });
  const [picked, setPicked] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const setMode = (next: Mode) => {
    setModeState(next);
    setPicked(null);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ }
  };

  const periods = useMemo(() => mode === 'week'
    ? weeklyPeriods(state.phases, state.currentWeek)
    : blockPeriods(state.phases, state.currentWeek), [mode, state.phases, state.currentWeek]);
  const rows = useMemo(() => muscleVolume(state, periods), [state, periods]);
  const index = Math.min(picked ?? periods.length - 1, periods.length - 1);
  const period = periods[index];

  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [mode, periods.length]);

  if (!period) return <p className="lb-label py-10 text-center">Henüz kayıt yok.</p>;

  const totals = periods.map((_, i) => ({ sets: rows.reduce((sum, row) => sum + row.cells[i].sets, 0) }));
  const current = totals[index];
  // Compared with the nearest earlier period of the same length: a phase's
  // short last block would make the next full block look like a jump.
  let previousIndex = index - 1;
  while (previousIndex >= 0 && periods[previousIndex].weeks.length !== period.weeks.length) previousIndex--;
  const previous = previousIndex >= 0 ? totals[previousIndex] : null;
  const previousPeriod = previousIndex >= 0 ? periods[previousIndex] : null;
  const inProgress = period.weeks.includes(state.currentWeek);
  const ranked = rows.map(row => ({ ...row, now: row.cells[index], before: previousIndex >= 0 ? row.cells[previousIndex] : null }))
    .sort((a, b) => b.now.sets - a.now.sets);
  const top = Math.max(1, ...ranked.map(row => row.now.sets));
  const exercises = loggedExercises(state);
  const unassigned = exercises.filter(item => groupOf(item.name, state.muscleGroups) === UNASSIGNED);
  // Phase headings over the trend table's columns.
  const spans: { name: string; count: number }[] = [];
  for (const item of periods) {
    const last = spans[spans.length - 1];
    if (last?.name === item.phaseName) last.count++;
    else spans.push({ name: item.phaseName, count: 1 });
  }
  const columnWidth = mode === 'week' ? 44 : 76;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex rounded-lg border lb-rule overflow-hidden text-xs font-semibold" role="group" aria-label="Dönem">
          {(['week', 'block'] as const).map(item => (
            <button key={item} type="button" onClick={() => setMode(item)} aria-pressed={mode === item}
              className={`lb-press px-3 py-1.5 ${mode === item ? 'bg-(--color-text-primary) text-(--color-bg-primary)' : 'text-(--color-text-secondary)'}`}>
              {item === 'week' ? 'Haftalık' : '4 haftalık'}
            </button>
          ))}
        </div>
        {!readOnly && (
          <button type="button" onClick={() => setEditing(true)} className="lb-press px-3 py-1.5 border lb-rule text-xs font-semibold rounded-lg">
            Bölgeleri düzenle
          </button>
        )}
      </div>

      {/* The chosen period */}
      <section className="lb-settle py-5 border-y lb-rule">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="lb-label">
              {period.phaseName} · {period.label}
              {period.weeks.length > 1 && mode === 'block' && period.weeks.length < 4 ? ` · ${period.weeks.length} hafta` : ''}
              {inProgress ? ' · devam ediyor' : ''}
            </p>
            <p className="lb-figure text-3xl font-semibold mt-2">
              {current.sets}<span className="text-sm font-medium text-(--color-text-secondary) ml-1.5">set</span>
            </p>
            {previous && previousPeriod && (
              <p className="lb-label mt-1.5">{previousPeriod.phaseName} {previousPeriod.label} ile fark {signed(current.sets - previous.sets)} set</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button type="button" aria-label="Önceki dönem" disabled={index === 0} onClick={() => setPicked(index - 1)}
              className="lb-press w-9 h-9 rounded-lg border lb-rule disabled:opacity-30">‹</button>
            <button type="button" aria-label="Sonraki dönem" disabled={index === periods.length - 1} onClick={() => setPicked(index + 1)}
              className="lb-press w-9 h-9 rounded-lg border lb-rule disabled:opacity-30">›</button>
          </div>
        </div>

        <ul className="mt-6 space-y-3">
          {ranked.map(row => (
            <li key={row.group} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:grid-cols-[7rem_minmax(0,1fr)_6rem] items-center gap-3">
              <span className={`text-sm ${row.group === UNASSIGNED ? 'text-(--color-text-secondary)' : 'font-medium'}`}>{row.group}</span>
              <span className="h-2 rounded-full" style={{ background: 'var(--lb-rule)' }}>
                <span className="block h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${(row.now.sets / top) * 100}%`, background: 'var(--color-text-primary)', opacity: row.group === UNASSIGNED ? 0.35 : 0.8 }} />
              </span>
              <span className="lb-figure text-sm text-right whitespace-nowrap">
                {row.now.sets}<span className="text-xs text-(--color-text-secondary)"> set</span>
                {row.before && <span className="text-xs text-(--color-text-secondary) ml-2">{signed(row.now.sets - row.before.sets)}</span>}
              </span>
            </li>
          ))}
        </ul>
        {unassigned.length > 0 && (
          // Beside the names, not among them: a phone's 44px button would
          // open up the lines once the list wraps.
          <div className="lb-label mt-5 flex items-center gap-3">
            <p className="flex-1 min-w-0">Bir bölgeye atanmamış: {unassigned.map(item => item.name).join(', ')}</p>
            {!readOnly && <button type="button" onClick={() => setEditing(true)} className="lb-press shrink-0 px-1 underline hover:text-(--color-text-primary)">Bölge seç</button>}
          </div>
        )}
      </section>

      {/* Every period at once: set counts, shaded within each group's own range */}
      <h2 className="text-sm font-semibold mt-8 mb-3">Seyir <span className="lb-label font-normal">· set sayısı, bir döneme dokun</span></h2>
      <div ref={scrollRef} className="lb-scroll overflow-x-auto pb-1">
        <table className="border-separate border-spacing-0 text-xs" style={{ tableLayout: 'fixed', width: 112 + periods.length * columnWidth }}>
          <colgroup>
            <col style={{ width: 112 }} />
            {periods.map(item => <col key={item.key} style={{ width: columnWidth }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-(--color-bg-primary)" />
              {spans.map((span, i) => (
                <th key={`${span.name}-${i}`} colSpan={span.count} className="lb-label text-left font-medium px-1.5 pb-1 border-l lb-rule truncate">{span.name}</th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-(--color-bg-primary) lb-label text-left font-medium pb-2">Bölge</th>
              {periods.map((item, i) => (
                <th key={item.key} className="px-0.5 pb-2 font-normal">
                  <button type="button" onClick={() => setPicked(i)} aria-pressed={i === index}
                    className={`lb-press lb-figure w-full rounded-md py-1 ${i === index ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'text-(--color-text-secondary)'}`}>
                    {item.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const most = Math.max(1, ...row.cells.map(cell => cell.sets));
              return (
                <tr key={row.group}>
                  <th className="sticky left-0 z-10 bg-(--color-bg-primary) text-left font-medium text-sm py-1 pr-2 truncate">{row.group}</th>
                  {row.cells.map((cell, i) => (
                    <td key={periods[i].key} onClick={() => setPicked(i)} className="p-0.5 cursor-pointer">
                      <span className={`lb-figure flex h-8 items-center justify-center rounded-md ${i === index ? 'ring-1 ring-(--color-text-primary)' : ''}`}
                        style={{ background: shade(cell.sets / most), color: cell.sets ? undefined : 'var(--color-text-secondary)' }}>
                        {cell.sets || '·'}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <th className="sticky left-0 z-10 bg-(--color-bg-primary) text-left lb-label font-medium pt-2">Toplam</th>
              {totals.map((total, i) => (
                <td key={periods[i].key} className={`lb-figure text-center pt-2 ${i === index ? 'font-semibold' : 'text-(--color-text-secondary)'}`}>{total.sets || ''}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <BottomSheet isOpen={editing} onClose={() => setEditing(false)} title="Bölgeleri düzenle">
        <p className="lb-label mb-4">Adından bölgesi anlaşılan hareketler otomatik gruplanır. Yanlış olanı ya da atanmamış olanı buradan seç; aynı adlı hareket tüm günlerde değişir.</p>
        <ul>
          {[...exercises].sort((a, b) => {
            const rank = (item: typeof a) => { const g = groupOf(item.name, state.muscleGroups); return g === UNASSIGNED ? -1 : MUSCLE_GROUPS.indexOf(g); };
            return rank(a) - rank(b) || a.name.localeCompare(b.name, 'tr');
          }).map(item => {
            const suggestion = suggestedGroup(item.name);
            const chosen = state.muscleGroups?.[exerciseKey(item.name)] ?? '';
            return (
              <li key={item.key} className="flex items-center justify-between gap-3 py-2.5 border-b lb-rule">
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{item.name}</span>
                  <span className="lb-label">{item.sets} set</span>
                </span>
                <select value={chosen} aria-label={`${item.name} bölgesi`}
                  onChange={event => dispatch({ type: 'SET_MUSCLE_GROUP', payload: { key: item.key, group: event.target.value || null } })}
                  className={`shrink-0 px-2 py-1.5 bg-(--color-bg-input) border rounded-lg text-sm ${!chosen && !suggestion ? 'border-(--lb-drop)' : 'lb-rule'}`}>
                  <option value="">{suggestion ? `Otomatik · ${suggestion}` : 'Seç…'}</option>
                  {MUSCLE_GROUPS.map(group => <option key={group} value={group}>{group}</option>)}
                </select>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </div>
  );
}
