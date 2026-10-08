import { useContext, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { useReadOnly } from '@/context/ReadOnly';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { useWidth } from '@/components/shared/ExerciseTrend';
import { MEASURES, measureStatus, weeklySeries } from '@/utils/body';
import type { BodyMeasurement, MeasureKey } from '@/types';

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDate = (date: string) => dayMonth.format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
const num = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
const signed = (value: number) => value === 0 ? '±0' : `${value > 0 ? '+' : '−'}${num(Math.abs(value))}`;
const today = () => new Date().toISOString().slice(0, 10);
// Typed with a comma or a dot; blank is "not measured", never zero.
const parse = (raw: string) => {
  const value = Number(raw.replace(',', '.').trim());
  return raw.trim() && Number.isFinite(value) && value > 0 ? value : undefined;
};
const FIELD = 'h-12 w-full rounded-xl bg-(--color-bg-input) px-3 text-[17px] lb-figure';

/** A day's measurements: weight is asked for, the rest only if the person took them. */
export function MeasurementSheet({ isOpen, onClose, initial }: { isOpen: boolean; onClose: () => void; initial?: BodyMeasurement }) {
  const ctx = useContext(AppContext);
  const all = ctx?.state.bodyMeasurements ?? [];
  const last = all[all.length - 1];
  const [date, setDate] = useState(initial?.date ?? today());
  const [values, setValues] = useState<Partial<Record<MeasureKey, string>>>(() => Object.fromEntries(
    MEASURES.flatMap(({ key }) => typeof initial?.[key] === 'number' ? [[key, num(initial[key]!)]] : []),
  ));
  const weight = parse(values.weight ?? '');

  const save = () => {
    if (!ctx || weight === undefined || !date) return;
    const entry: BodyMeasurement = { date, weight };
    for (const { key } of MEASURES) {
      const value = parse(values[key] ?? '');
      if (key !== 'weight' && value !== undefined) entry[key] = value;
    }
    // A day moved to another date is not left behind on the old one.
    if (initial && initial.date !== date) ctx.dispatch({ type: 'DELETE_MEASUREMENT', payload: initial.date });
    ctx.dispatch({ type: 'SAVE_MEASUREMENT', payload: entry });
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={initial ? 'Ölçüyü düzenle' : 'Ölçü gir'}>
      <div className="flex flex-col gap-3 pb-2">
        <label className="flex items-center justify-between gap-3 text-[15px]">
          Tarih
          <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)}
            className="h-11 rounded-xl bg-(--color-bg-input) px-3 text-[16px]" />
        </label>
        {MEASURES.map(({ key, label, unit }) => (
          <label key={key} className="grid grid-cols-[1fr_8rem] items-center gap-3">
            <span className="text-[15px]">
              {label} <span className="text-(--color-text-secondary)">({unit})</span>
              {key !== 'weight' && <span className="block text-[13px] text-(--color-text-secondary)">isteğe bağlı</span>}
            </span>
            <input inputMode="decimal" value={values[key] ?? ''} aria-label={`${label} (${unit})`}
              placeholder={key === 'weight' && last ? num(last.weight) : '—'}
              onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value.replace(/[^0-9.,]/g, '') }))}
              className={FIELD} />
          </label>
        ))}
        <button onClick={save} disabled={weight === undefined || !date}
          className="mt-2 h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold disabled:opacity-40">
          Kaydet
        </button>
        {initial && (
          <button onClick={() => { ctx?.dispatch({ type: 'DELETE_MEASUREMENT', payload: initial.date }); onClose(); }}
            className="h-12 text-[15px] text-(--lb-drop)">Bu kaydı sil</button>
        )}
      </div>
    </BottomSheet>
  );
}

function GoalSheet({ measure, onClose }: { measure: typeof MEASURES[number]; onClose: () => void }) {
  const ctx = useContext(AppContext);
  const current = ctx?.state.bodyGoals?.[measure.key];
  const [raw, setRaw] = useState(current === undefined ? '' : num(current));
  const value = parse(raw);
  const set = (next: number | null) => { ctx?.dispatch({ type: 'SET_BODY_GOAL', payload: { key: measure.key, value: next } }); onClose(); };
  return (
    <BottomSheet isOpen onClose={onClose} title={`${measure.label} hedefi`}>
      <div className="flex flex-col gap-3 pb-2">
        <label className="grid grid-cols-[1fr_8rem] items-center gap-3 text-[15px]">
          Hedef ({measure.unit})
          <input inputMode="decimal" autoFocus value={raw} onChange={e => setRaw(e.target.value.replace(/[^0-9.,]/g, ''))} className={FIELD} />
        </label>
        <button onClick={() => value !== undefined && set(value)} disabled={value === undefined}
          className="h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold disabled:opacity-40">Kaydet</button>
        {current !== undefined && <button onClick={() => set(null)} className="h-12 text-[15px] text-(--color-text-secondary)">Hedefi kaldır</button>}
      </div>
    </BottomSheet>
  );
}

const HEIGHT = 120;
const PAD = { top: 14, right: 12, bottom: 22, left: 40 };

/** A measurement week by week, with the target as a dashed line. */
function BodyChart({ series, goal, label }: { series: { week: string; value: number }[]; goal?: number; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const values = [...series.map(point => point.value), ...(goal === undefined ? [] : [goal])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || 1;
  const y = (value: number) => PAD.top + (1 - (value - (min - pad)) / (max - min + 2 * pad)) * (HEIGHT - PAD.top - PAD.bottom);
  const step = series.length > 1 ? (width - PAD.left - PAD.right) / (series.length - 1) : 0;
  const x = (index: number) => PAD.left + step * index;
  return (
    <div ref={ref} className="mt-2">
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={`${label}: haftalık ortalama`} className="block">
          {goal !== undefined && (
            <g>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(goal)} y2={y(goal)} style={{ stroke: 'var(--lb-gain)' }} strokeDasharray="4 4" />
              <text x={PAD.left - 6} y={y(goal) + 3.5} textAnchor="end" className="lb-figure" fontSize="10" style={{ fill: 'var(--lb-gain)' }}>{num(goal)}</text>
            </g>
          )}
          {[series[0], series[series.length - 1]].map((point, i) => (
            <text key={i} x={x(i ? series.length - 1 : 0)} y={HEIGHT - 6} textAnchor={i ? 'end' : 'start'} className="lb-figure" fontSize="10"
              style={{ fill: 'var(--color-text-secondary)' }}>{shortDate(point.week)} haftası</text>
          ))}
          <polyline fill="none" points={series.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')}
            style={{ stroke: 'var(--color-text-secondary)' }} strokeWidth="1.5" strokeLinejoin="round" />
          {series.map((point, index) => (
            <circle key={point.week} cx={x(index)} cy={y(point.value)} r={index === series.length - 1 ? 4.5 : 3}
              style={{ fill: 'var(--color-text-primary)', stroke: 'var(--color-bg-primary)' }} strokeWidth="2" />
          ))}
        </svg>
      )}
    </div>
  );
}

/**
 * Weight and the other measurements over time, with targets. In a coach's
 * view of an athlete it is the athlete's record, shown read-only.
 */
export function BodyMeasurements() {
  const ctx = useContext(AppContext);
  const readOnly = useReadOnly();
  const [entryOpen, setEntryOpen] = useState(false);
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);
  const [goalFor, setGoalFor] = useState<typeof MEASURES[number] | null>(null);
  if (!ctx) return null;
  const measurements = ctx.state.bodyMeasurements ?? [];
  const goals = ctx.state.bodyGoals ?? {};
  const shown = MEASURES.map(measure => ({ measure, status: measureStatus(measurements, measure.key, goals[measure.key]) }))
    .filter(item => item.status);

  return (
    <div>
      {!readOnly && (
        <button onClick={() => setEntryOpen(true)} className="mb-4 h-12 px-5 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">
          Ölçü gir
        </button>
      )}
      {!shown.length && (
        <p className="lb-label py-6">
          {readOnly ? 'Henüz ölçü girilmedi.' : 'Kilonu haftada bir gir; istersen bel, kol gibi ölçülerini de. Burada haftalık seyrini ve hedefe ne kaldığını görürsün.'}
        </p>
      )}
      {shown.map(({ measure, status }) => {
        const goal = goals[measure.key];
        const series = weeklySeries(measurements, measure.key);
        const toGoal = status!.toGoal;
        const reached = goal !== undefined && toGoal !== null
          && (toGoal === 0 || (goal !== status!.first && Math.sign(toGoal) !== Math.sign(goal - status!.first)));
        return (
          <section key={measure.key} className="py-4 border-b lb-rule">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[16px] font-semibold">{measure.label}</h3>
              <p className="lb-figure">
                <span className="text-[26px] font-semibold">{num(status!.latest)}</span>
                <span className="text-[13px] text-(--color-text-secondary) ml-1">{measure.unit}</span>
              </p>
            </div>
            <p className="lb-label mt-0.5">
              Başlangıç {num(status!.first)} → şimdi {num(status!.latest)} ({signed(status!.change)}) · son {shortDate(status!.latestDate)}
            </p>
            {goal !== undefined ? (
              <button disabled={readOnly} onClick={() => setGoalFor(measure)} className="mt-1 text-[15px] text-left" style={{ color: 'var(--lb-gain)' }}>
                Hedef {num(goal)} {measure.unit} · {reached ? 'hedefe ulaşıldı' : `${num(Math.abs(toGoal!))} ${measure.unit} kaldı`}
              </button>
            ) : !readOnly && (
              <button onClick={() => setGoalFor(measure)} className="mt-1 text-[15px] text-(--color-text-secondary) underline underline-offset-4">Hedef belirle</button>
            )}
            {series.length > 1 && <BodyChart series={series} goal={goal} label={measure.label} />}
          </section>
        );
      })}
      {measurements.length > 0 && (
        <section className="mt-6">
          <h3 className="lb-label">Kayıtlar</h3>
          <ul>
            {[...measurements].reverse().slice(0, 8).map(entry => (
              <li key={entry.date}>
                <button disabled={readOnly} onClick={() => setEditing(entry)}
                  className="w-full flex items-baseline gap-3 py-2.5 border-b lb-rule text-left">
                  <span className="w-16 shrink-0 text-[15px] text-(--color-text-secondary)">{shortDate(entry.date)}</span>
                  <span className="flex-1 min-w-0 text-[15px] truncate">
                    {MEASURES.filter(({ key }) => typeof entry[key] === 'number').map(({ key, label, unit }) =>
                      key === 'weight' ? `${num(entry.weight)} ${unit}` : `${label} ${num(entry[key]!)}${unit === '%' ? '%' : ` ${unit}`}`).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {entryOpen && <MeasurementSheet isOpen onClose={() => setEntryOpen(false)} />}
      {editing && <MeasurementSheet isOpen initial={editing} onClose={() => setEditing(null)} />}
      {goalFor && <GoalSheet measure={goalFor} onClose={() => setGoalFor(null)} />}
    </div>
  );
}
