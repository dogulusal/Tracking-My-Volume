import { useContext, useMemo, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { useReadOnly } from '@/context/ReadOnly';
import { BottomSheet } from '@/components/shared/BottomSheet';
import {
  MUSCLE_GROUPS, UNASSIGNED, exerciseKey, groupOf, loggedExercises, muscleVolume, recentBlocks, suggestedGroup, weeklyPeriods,
} from '@/utils/muscleGroups';

type Mode = 'week' | 'block';
const MODE_KEY = 'volume-period-mode';
const nf = new Intl.NumberFormat('tr-TR');

const signed = (value: number) => value === 0 ? '±0' : `${value > 0 ? '+' : '−'}${nf.format(Math.abs(value))}`;

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
  // A region picked in the ring or the list; kept across periods.
  const [focus, setFocus] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const setMode = (next: Mode) => {
    setModeState(next);
    setPicked(null);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ }
  };

  const periods = useMemo(() => mode === 'week'
    ? weeklyPeriods(state.phases, state.currentWeek)
    : recentBlocks(state.phases, state.currentWeek), [mode, state.phases, state.currentWeek]);
  const rows = useMemo(() => muscleVolume(state, periods), [state, periods]);
  const index = Math.min(picked ?? periods.length - 1, periods.length - 1);
  const period = periods[index];

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
  const exercises = loggedExercises(state);
  const unassigned = exercises.filter(item => groupOf(item.name, state.muscleGroups) === UNASSIGNED);
  // Monochrome on purpose: colour in this app means gain, drop or a first
  // record. Shades step from the largest group to the smallest, in the same
  // order as the list and clockwise round the ring.
  const shadeOf = (rank: number) => 1 - rank * (0.8 / Math.max(1, ranked.length - 1));
  const focused = ranked.find(row => row.group === focus && row.now.sets > 0) ?? null;

  // A container: the ring sits beside its list only when this block itself
  // is wide enough (a tablet, or a desktop showing it alone), not by screen.
  return (
    <div className="@container">
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
              {mode === 'block' ? `${index === periods.length - 1 ? 'Son ' : ''}${period.weeks.length} hafta · ` : ''}{period.title}
              {inProgress ? ' · bu hafta devam ediyor' : ''}
            </p>
            {previous && previousPeriod && (
              <p className="lb-label mt-1.5">{mode === 'block' ? 'Önceki 4 hafta' : previousPeriod.title} ile fark {signed(current.sets - previous.sets)} set</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button type="button" aria-label="Önceki dönem" disabled={index === 0} onClick={() => setPicked(index - 1)}
              className="lb-press w-9 h-9 rounded-lg border lb-rule disabled:opacity-30">‹</button>
            <button type="button" aria-label="Sonraki dönem" disabled={index === periods.length - 1} onClick={() => setPicked(index + 1)}
              className="lb-press w-9 h-9 rounded-lg border lb-rule disabled:opacity-30">›</button>
          </div>
        </div>

        {/* The period as a ring: its total in the middle, each region a slice.
            Tapping a region (in the ring or the list) names it in the middle. */}
        <div className="mt-5 grid gap-5 @xl:grid-cols-[15rem_minmax(0,1fr)] @xl:items-center @xl:gap-10">
          <Ring slices={ranked.map((row, rank) => ({ key: row.group, value: row.now.sets, shade: shadeOf(rank) }))}
            focus={focused?.group ?? null} onFocus={key => setFocus(value => value === key ? null : key)}
            center={focused ? (
              <>
                <span className="text-sm font-medium truncate max-w-[8rem]">{focused.group}</span>
                <span className="lb-figure text-[40px] font-bold leading-none mt-1">{focused.now.sets}</span>
                <span className="lb-label mt-1">set · %{Math.round((focused.now.sets / Math.max(1, current.sets)) * 100)}</span>
              </>
            ) : (
              <>
                <span className="lb-figure text-[48px] font-bold leading-none">{current.sets}</span>
                <span className="lb-label mt-1">toplam set</span>
              </>
            )} />
          <ul className="flex flex-col sm:max-w-sm">
            {ranked.map((row, rank) => (
              <li key={row.group}>
                <button type="button" onClick={() => setFocus(value => value === row.group ? null : row.group)} aria-pressed={focus === row.group}
                  className="lb-press w-full min-h-10 -mx-2 px-2 rounded-lg flex items-center gap-3 text-left"
                  style={focus === row.group ? { background: 'var(--color-bg-card)' } : undefined}>
                  <span aria-hidden="true" className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: 'var(--color-text-primary)', opacity: row.now.sets ? shadeOf(rank) : 0.12 }} />
                  <span className={`flex-1 min-w-0 truncate text-sm ${row.group === UNASSIGNED ? 'text-(--color-text-secondary)' : 'font-medium'}`}>{row.group}</span>
                  <span className="lb-figure text-sm text-right whitespace-nowrap">
                    {row.now.sets}<span className="text-xs text-(--color-text-secondary)"> set</span>
                  </span>
                  <span className="lb-figure w-8 text-xs text-right text-(--color-text-secondary)">{row.before ? signed(row.now.sets - row.before.sets) : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {unassigned.length > 0 && (
          // Beside the names, not among them: a phone's 44px button would
          // open up the lines once the list wraps.
          <div className="lb-label mt-5 flex items-center gap-3">
            <p className="flex-1 min-w-0">Bir bölgeye atanmamış: {unassigned.map(item => item.name).join(', ')}</p>
            {!readOnly && <button type="button" onClick={() => setEditing(true)} className="lb-press shrink-0 px-1 underline hover:text-(--color-text-primary)">Bölge seç</button>}
          </div>
        )}
      </section>

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

/**
 * A ring of slices drawn as dashed circles, starting at twelve o'clock and
 * going clockwise, with a small gap between slices. The focused slice is full
 * strength and the rest fade back.
 */
function Ring({ slices, focus, onFocus, center }: {
  slices: { key: string; value: number; shade: number }[];
  focus: string | null;
  onFocus: (key: string) => void;
  center: React.ReactNode;
}) {
  const size = 240;
  const stroke = 30;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const shown = slices.filter(slice => slice.value > 0);
  const gap = shown.length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div className="relative mx-auto w-[min(15rem,70vw)] aspect-square">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90" role="img"
        aria-label={shown.map(slice => `${slice.key} ${slice.value} set`).join(', ') || 'Bu dönemde set yok'}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-text-primary)" strokeOpacity={0.08} strokeWidth={stroke} />
        {total > 0 && shown.map(slice => {
          const length = (slice.value / total) * circumference;
          const drawn = Math.max(0.5, length - gap);
          const dash = `${drawn} ${circumference - drawn}`;
          const at = -offset;
          offset += length;
          return (
            <circle key={slice.key} cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke="var(--color-text-primary)" strokeWidth={stroke} strokeDasharray={dash} strokeDashoffset={at}
              strokeOpacity={focus === null ? slice.shade : focus === slice.key ? 1 : 0.1}
              onClick={() => onFocus(slice.key)} className="cursor-pointer transition-[stroke-opacity] duration-200" />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">{center}</div>
    </div>
  );
}
