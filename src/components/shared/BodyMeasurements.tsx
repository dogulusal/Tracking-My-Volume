import { useContext, useState, type PointerEvent } from 'react';
import { AppContext } from '@/context/AppContext';
import { useReadOnly } from '@/context/ReadOnly';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { useWidth } from '@/components/shared/ExerciseTrend';
import { MEASURES, MIN_SPAN, chartScale, estimatedBodyFat, formMeasures, localDay, measureStatus, pointsOf, seriesChange, weekOffsets, weeklySeries, type Point } from '@/utils/body';
import type { BodyMeasurement, BodyProfile, MeasureKey } from '@/types';

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDate = (date: string) => dayMonth.format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
const num = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
const signed = (value: number) => value === 0 ? '±0' : `${value > 0 ? '+' : '−'}${num(Math.abs(value))}`;
// The chart's values keep their tenth, so a column of them reads evenly: 83,0 beside 82,6.
const tenth = (value: number) => value.toFixed(1).replace('.', ',');
const withUnit = (figure: string, unit: string) => unit === '%' ? `${figure}%` : `${figure} ${unit}`;
// Typed with a comma or a dot; blank is "not measured", never zero.
const parse = (raw: string) => {
  const value = Number(raw.replace(',', '.').trim());
  return raw.trim() && Number.isFinite(value) && value > 0 ? value : undefined;
};
const decimal = (raw: string) => raw.replace(/[^0-9.,]/g, '');
const FIELD = 'h-12 w-full rounded-xl bg-(--color-bg-input) px-3 text-[17px] lb-figure';
type SexChoice = BodyProfile['sex'] | 'none' | null;
const SEXES: { value: Exclude<SexChoice, null | undefined>; label: string }[] = [
  { value: 'female', label: 'Kadın' }, { value: 'male', label: 'Erkek' }, { value: 'none', label: 'Belirtmek istemiyorum' },
];
const measureOf = (key: MeasureKey) => MEASURES.find(measure => measure.key === key)!;

/** Sex and height, both optional: asked with the first measurement and changed from the panel later. */
function ProfileFields({ sex, height, onSex, onHeight }: {
  sex: SexChoice; height: string; onSex: (sex: Exclude<SexChoice, null | undefined>) => void; onHeight: (raw: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="text-[15px]">Cinsiyet <span className="text-[13px] text-(--color-text-secondary)">· isteğe bağlı</span></span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SEXES.map(option => (
            <button key={option.value} type="button" aria-pressed={sex === option.value} onClick={() => onSex(option.value)}
              className={`h-11 px-3.5 rounded-full text-[15px] ${sex === option.value ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-input)'}`}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <label className="grid grid-cols-[1fr_8rem] items-center gap-3">
        <span className="text-[15px]">Boy <span className="text-(--color-text-secondary)">(cm)</span>
          <span className="block text-[13px] text-(--color-text-secondary)">isteğe bağlı</span>
        </span>
        <input inputMode="decimal" value={height} aria-label="Boy (cm)" placeholder="—" onChange={e => onHeight(decimal(e.target.value))} className={FIELD} />
      </label>
      <p className="text-[13px] leading-snug text-(--color-text-secondary)">
        Cinsiyete göre önce gösterilecek ölçüler seçilir; cinsiyet ve boyla yağ oranı bel ve boyundan tahmin edilir.
      </p>
    </div>
  );
}

const profileOf = (sex: SexChoice, height: string): BodyProfile => {
  const profile: BodyProfile = {};
  if (sex === 'male' || sex === 'female') profile.sex = sex;
  const heightCm = parse(height);
  if (heightCm) profile.heightCm = heightCm;
  return profile;
};

/** A day's measurements: weight is asked for, the rest only if the person took them. */
export function MeasurementSheet({ isOpen, onClose, initial }: { isOpen: boolean; onClose: () => void; initial?: BodyMeasurement }) {
  const ctx = useContext(AppContext);
  const all = ctx?.state.bodyMeasurements ?? [];
  const last = all[all.length - 1];
  const profile = ctx?.state.bodyProfile;
  // The first measurement asks for sex and height; afterwards they are changed from the panel.
  const askProfile = profile === undefined;
  const [sex, setSex] = useState<SexChoice>(profile?.sex ?? null);
  const [height, setHeight] = useState('');
  const [date, setDate] = useState(initial?.date ?? localDay());
  const [values, setValues] = useState<Partial<Record<MeasureKey, string>>>(() => Object.fromEntries(
    MEASURES.flatMap(({ key }) => typeof initial?.[key] === 'number' ? [[key, num(initial[key]!)]] : []),
  ));
  const { first, other } = formMeasures(sex === 'male' || sex === 'female' ? sex : undefined);
  const [showOther, setShowOther] = useState(() => other.some(key => typeof initial?.[key] === 'number'));
  const weight = parse(values.weight ?? '');

  const save = () => {
    if (!ctx || weight === undefined || !date) return;
    const entry: BodyMeasurement = { date, weight };
    for (const { key } of MEASURES) {
      const value = parse(values[key] ?? '');
      if (key !== 'weight' && value !== undefined) entry[key] = value;
    }
    if (askProfile) ctx.dispatch({ type: 'SET_BODY_PROFILE', payload: profileOf(sex, height) });
    // A day moved to another date is not left behind on the old one.
    if (initial && initial.date !== date) ctx.dispatch({ type: 'DELETE_MEASUREMENT', payload: initial.date });
    ctx.dispatch({ type: 'SAVE_MEASUREMENT', payload: entry });
    onClose();
  };

  const field = (key: MeasureKey) => {
    const { label, unit } = measureOf(key);
    return (
      <label key={key} className="grid grid-cols-[1fr_8rem] items-center gap-3">
        <span className="text-[15px]">
          {label} <span className="text-(--color-text-secondary)">({unit})</span>
          {key !== 'weight' && <span className="block text-[13px] text-(--color-text-secondary)">isteğe bağlı</span>}
        </span>
        <input inputMode="decimal" value={values[key] ?? ''} aria-label={`${label} (${unit})`}
          placeholder={key === 'weight' && last ? num(last.weight) : '—'}
          onChange={e => setValues(prev => ({ ...prev, [key]: decimal(e.target.value) }))}
          className={FIELD} />
      </label>
    );
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={initial ? 'Ölçüyü düzenle' : 'Ölçü gir'}>
      <div className="flex flex-col gap-3 pb-2">
        {askProfile && (
          <div className="pb-3 border-b border-(--color-border)">
            <ProfileFields sex={sex} height={height} onSex={setSex} onHeight={setHeight} />
          </div>
        )}
        <label className="flex items-center justify-between gap-3 text-[15px]">
          Tarih
          <input type="date" value={date} max={localDay()} onChange={e => setDate(e.target.value)}
            className="h-11 rounded-xl bg-(--color-bg-input) px-3 text-[16px]" />
        </label>
        {field('weight')}
        {first.map(field)}
        <button type="button" onClick={() => setShowOther(open => !open)} aria-expanded={showOther}
          className="min-h-11 text-left text-[15px] text-(--color-text-secondary)">
          {showOther ? '− Diğer ölçüleri gizle' : `+ Diğer ölçüler (${other.map(key => measureOf(key).label.toLocaleLowerCase('tr-TR')).join(', ')})`}
        </button>
        {showOther && other.map(field)}
        <p className="text-[13px] leading-snug text-(--color-text-secondary)">Hep aynı koşulda ölç: sabah, aç karnına; mezurayı sıkmadan.</p>
        <button onClick={save} disabled={weight === undefined || !date}
          className="mt-1 h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold disabled:opacity-40">
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

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const ctx = useContext(AppContext);
  const profile = ctx?.state.bodyProfile;
  const [sex, setSex] = useState<SexChoice>(profile?.sex ?? (profile ? 'none' : null));
  const [height, setHeight] = useState(profile?.heightCm ? num(profile.heightCm) : '');
  return (
    <BottomSheet isOpen onClose={onClose} title="Cinsiyet ve boy">
      <div className="flex flex-col gap-3 pb-2">
        <ProfileFields sex={sex} height={height} onSex={setSex} onHeight={setHeight} />
        <button onClick={() => { ctx?.dispatch({ type: 'SET_BODY_PROFILE', payload: profileOf(sex, height) }); onClose(); }}
          className="mt-1 h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold">Kaydet</button>
      </div>
    </BottomSheet>
  );
}

function GoalSheet({ goalKey, label, unit, onClose }: { goalKey: MeasureKey; label: string; unit: string; onClose: () => void }) {
  const ctx = useContext(AppContext);
  const current = ctx?.state.bodyGoals?.[goalKey];
  const [raw, setRaw] = useState(current === undefined ? '' : num(current));
  const value = parse(raw);
  const set = (next: number | null) => { ctx?.dispatch({ type: 'SET_BODY_GOAL', payload: { key: goalKey, value: next } }); onClose(); };
  return (
    <BottomSheet isOpen onClose={onClose} title={`${label} hedefi`}>
      <div className="flex flex-col gap-3 pb-2">
        <label className="grid grid-cols-[1fr_8rem] items-center gap-3 text-[15px]">
          Hedef ({unit})
          <input inputMode="decimal" autoFocus value={raw} onChange={e => setRaw(decimal(e.target.value))} className={FIELD} />
        </label>
        <button onClick={() => value !== undefined && set(value)} disabled={value === undefined}
          className="h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold disabled:opacity-40">Kaydet</button>
        {current !== undefined && <button onClick={() => set(null)} className="h-12 text-[15px] text-(--color-text-secondary)">Hedefi kaldır</button>}
      </div>
    </BottomSheet>
  );
}

/**
 * The trend at a glance, as in the İlerleme list: no axes, the latest dot
 * larger. Never narrower than MIN_SPAN, so half a centimetre does not look
 * like four.
 */
function MiniLine({ series, className = '' }: { series: { week: string; value: number }[]; className?: string }) {
  const [ref, width] = useWidth<HTMLSpanElement>();
  const height = 28;
  const values = series.map(point => point.value);
  const widen = Math.max(0, MIN_SPAN - (Math.max(...values) - Math.min(...values))) / 2;
  const min = Math.min(...values) - widen;
  const max = Math.max(...values) + widen;
  const offsets = weekOffsets(series);
  const last = offsets[offsets.length - 1] || 1;
  const y = (value: number) => 4 + (1 - (value - min) / (max - min)) * (height - 8);
  const x = (index: number) => series.length > 1 ? 3 + (offsets[index] / last) * (width - 6) : width / 2;
  return (
    <span ref={ref} className={`block ${className}`} style={{ height }} aria-hidden="true">
      {width > 0 && series.length > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <polyline fill="none" points={series.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')}
            style={{ stroke: 'var(--color-text-secondary)' }} strokeOpacity="0.7" strokeWidth="1.25" strokeLinejoin="round" />
          <circle cx={x(series.length - 1)} cy={y(values[values.length - 1])} r="3" style={{ fill: 'var(--color-text-primary)' }} />
        </svg>
      )}
    </span>
  );
}

const PAD = { top: 26, right: 4, bottom: 40, left: 34 };
// Taller on a wide screen, where a wide and low chart flattens the change.
const heightFor = (width: number) => width >= 700 ? 300 : 230;
// Room kept between the axis and the first and last weeks, for their labels.
const INSET = 16;
// The width a value and a date need; closer ones are left unwritten.
const VALUE_GAP = 34;
const DATE_GAP = 40;

/**
 * Where a week's value is written: above a peak, below a dip, and on a slope
 * on the side the line leaves free.
 */
function labelPlace(values: number[], index: number) {
  const value = values[index];
  const prev = values[index - 1] ?? value;
  const next = values[index + 1] ?? value;
  if (value >= prev && value >= next) return { dx: 0, dy: -11, anchor: 'middle' as const };
  if (value <= prev && value <= next) return { dx: 0, dy: 18, anchor: 'middle' as const };
  return prev > value ? { dx: 7, dy: -8, anchor: 'start' as const } : { dx: -7, dy: -8, anchor: 'end' as const };
}

/** The weeks given room for a label, the latest, the first, the highest and the lowest first. */
function labelled(xs: number[], values: number[], gap: number): Set<number> {
  const last = xs.length - 1;
  const order = [last, 0, values.indexOf(Math.max(...values)), values.indexOf(Math.min(...values))];
  for (let index = last - 1; index > 0; index--) order.push(index);
  const picked = new Set<number>();
  for (const index of order) if ([...picked].every(other => Math.abs(xs[index] - xs[other]) >= gap)) picked.add(index);
  return picked;
}

/**
 * A move's colour against the target, as gain and drop are coloured
 * elsewhere: green toward it, red away; none without a target or a move.
 */
function goalInk(from: number, to: number, goal?: number) {
  if (goal === undefined || Math.abs(to - from) < 0.05) return undefined;
  return Math.sign(to - from) === Math.sign(goal - from) ? 'var(--lb-gain)' : 'var(--lb-drop)';
}

/**
 * A measurement week by week, full size: a gridline per unit or round step
 * with its value, each week's value written by its dot, the target as a
 * dashed line. With a target each dot is green or red for the week's move
 * toward or away from it. Tapping a week tells it and its change from the
 * week before.
 */
function BodyChart({ series, goal, label, unit }: { series: { week: string; value: number }[]; goal?: number; label: string; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const values = series.map(point => point.value);
  // The target joins the scale while the weeks still fill most of it; a far
  // one is only written above the chart.
  const span = Math.max(Math.max(...values) - Math.min(...values), MIN_SPAN);
  const goalShown = goal !== undefined && Math.max(0, Math.min(...values) - goal, goal - Math.max(...values)) <= span * 1.5;
  const { lo, hi, ticks } = chartScale(goalShown ? [...values, goal] : values);
  const height = heightFor(width);
  const plotBottom = height - PAD.bottom;
  const y = (value: number) => plotBottom - ((value - lo) / (hi - lo)) * (plotBottom - PAD.top);
  const offsets = weekOffsets(series);
  const lastOffset = offsets[offsets.length - 1] || 1;
  const xs = offsets.map(offset => PAD.left + INSET + (offset / lastOffset) * Math.max(0, width - PAD.left - PAD.right - 2 * INSET));
  const valueLabels = labelled(xs, values, VALUE_GAP);
  const dateLabels = labelled(xs, offsets, DATE_GAP);
  const shown = active ?? series.length - 1;
  const fromPrev = shown > 0 ? Math.round((values[shown] - values[shown - 1]) * 10) / 10 : null;

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const left = event.currentTarget.getBoundingClientRect().left;
    const at = event.clientX - left;
    setActive(xs.reduce((best, x, index) => Math.abs(x - at) < Math.abs(xs[best] - at) ? index : best, 0));
  };

  return (
    <div className="mt-4">
      <p className="lb-label">
        <span className="text-(--color-text-primary)">{shortDate(series[shown].week)} haftası</span>
        {' · '}<span className="lb-figure text-(--color-text-primary) font-semibold">{withUnit(tenth(values[shown]), unit)}</span>
        {fromPrev !== null && <> · önceki ölçülen haftaya göre <span className="lb-figure font-semibold"
          style={{ color: goalInk(values[shown - 1], values[shown], goal) }}>{signed(fromPrev)}</span></>}
      </p>
      <div ref={ref} className="mt-1">
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${label}: haftalık ortalama`} className="block select-none"
            style={{ touchAction: 'pan-y' }} onPointerMove={pick} onPointerDown={pick}
            onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null); }}>
            <text x={PAD.left - 8} y={PAD.top - 12} textAnchor="end" fontSize="10" style={{ fill: 'var(--color-text-secondary)' }}>{unit}</text>
            {ticks.map(tick => (
              <g key={tick}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} style={{ stroke: 'var(--lb-rule)' }} />
                {!(goalShown && Math.abs(y(tick) - y(goal)) < 11) && (
                  <text x={PAD.left - 8} y={y(tick) + 3.5} textAnchor="end" className="lb-figure" fontSize="11"
                    style={{ fill: 'var(--color-text-secondary)' }}>{num(tick)}</text>
                )}
              </g>
            ))}
            {goalShown && (
              <g>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(goal)} y2={y(goal)} style={{ stroke: 'var(--lb-gain)' }} strokeWidth="1.5" strokeDasharray="5 4" />
                <text x={PAD.left - 8} y={y(goal) + 3.5} textAnchor="end" className="lb-figure" fontSize="11" fontWeight="600"
                  style={{ fill: 'var(--lb-gain)' }}>{num(goal)}</text>
              </g>
            )}
            <line x1={xs[shown]} x2={xs[shown]} y1={PAD.top - 6} y2={plotBottom} style={{ stroke: 'var(--lb-rule-strong)' }} />
            {series.slice(1).map((point, i) => (
              // Solid across a week without a measurement: the waist taken every
              // other week is not a broken line; the gap shows in the spacing.
              <line key={point.week} x1={xs[i]} y1={y(values[i])} x2={xs[i + 1]} y2={y(values[i + 1])}
                style={{ stroke: 'var(--color-text-secondary)' }} strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />
            ))}
            {series.map((point, index) => (
              <circle key={point.week} cx={xs[index]} cy={y(point.value)} r={index === shown ? 5.5 : 3.5}
                style={{ fill: (index > 0 && goalInk(values[index - 1], point.value, goal)) || 'var(--color-text-primary)', stroke: 'var(--color-bg-primary)' }}
                strokeWidth="2" />
            ))}
            {series.map((point, index) => {
              if (!valueLabels.has(index) && index !== shown) return null;
              const { dx, dy, anchor } = labelPlace(values, index);
              return (
                <text key={point.week} x={xs[index] + dx} y={y(point.value) + dy} textAnchor={anchor} className="lb-figure"
                  fontSize="12" fontWeight={index === shown ? 700 : 500}
                  style={{ fill: index === shown ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{tenth(point.value)}</text>
              );
            })}
            {series.map((point, index) => dateLabels.has(index) && (
              <text key={point.week} x={xs[index]} y={height - 6} textAnchor="middle" className="lb-figure" fontSize="10"
                style={{ fill: index === shown ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{shortDate(point.week)}</text>
            ))}
          </svg>
        )}
      </div>
      {goal !== undefined && (
        <p className="lb-label mt-1 flex gap-4">
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: 'var(--lb-gain)' }} />hedefe yaklaştı</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: 'var(--lb-drop)' }} />uzaklaştı</span>
        </p>
      )}
    </div>
  );
}

/** One figure of the result above the chart. */
function Stat({ figure, note, color }: { figure: string; note: string; color?: string }) {
  return (
    <span className="block min-w-0">
      <span className="block lb-figure text-[20px] font-semibold leading-tight whitespace-nowrap" style={{ color }}>{figure}</span>
      <span className="block text-[12px] leading-snug text-(--color-text-secondary)">{note}</span>
    </span>
  );
}

type Row = { id: string; label: string; badge?: string; unit: string; points: Point[]; goalKey: MeasureKey | null; note?: string };

/**
 * Weight and the other measurements over time, with targets: one line each,
 * as the İlerleme list, opening to the full chart. In a coach's view of an
 * athlete it is the athlete's record, shown read-only.
 */
export function BodyMeasurements() {
  const ctx = useContext(AppContext);
  const readOnly = useReadOnly();
  const [entryOpen, setEntryOpen] = useState(false);
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);
  const [goalFor, setGoalFor] = useState<Row | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>('weight');
  if (!ctx) return null;
  const measurements = ctx.state.bodyMeasurements ?? [];
  const goals = ctx.state.bodyGoals ?? {};
  const profile = ctx.state.bodyProfile;

  const rows: Row[] = MEASURES.map(({ key, label, unit }) => ({ id: key, label, unit, points: pointsOf(measurements, key), goalKey: key }));
  // The estimate keeps its own line: a scale's reading and a tape's estimate
  // differ by several points and would make a jagged line together.
  const estimate = estimatedBodyFat(measurements, profile);
  const measuredFat = pointsOf(measurements, 'bodyFat').length > 0;
  if (estimate.length) {
    rows.push({ id: 'bodyFatEstimate', label: 'Yağ oranı', badge: 'tahmini', unit: '%', points: estimate, goalKey: measuredFat ? null : 'bodyFat',
      note: `US Navy yöntemi: ${profile?.sex === 'female' ? 'bel, kalça, boyun' : 'bel, boyun'} ve boydan. Birkaç puan yanılabilir; değişimi izlemek için.` });
  }
  const shown = rows.filter(row => row.points.length);
  const canEstimate = measurements.some(entry => entry.waist && entry.neck) && !(profile?.sex && profile.heightCm);
  const profileText = [profile?.sex === 'female' ? 'Kadın' : profile?.sex === 'male' ? 'Erkek' : null, profile?.heightCm ? `${num(profile.heightCm)} cm` : null]
    .filter(Boolean).join(' · ');

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {!readOnly && (
          <button onClick={() => setEntryOpen(true)} className="h-12 px-5 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">
            Ölçü gir
          </button>
        )}
        {(profile !== undefined || !readOnly) && (
          <button disabled={readOnly} onClick={() => setProfileOpen(true)} className="min-h-11 text-[15px] text-(--color-text-secondary) text-left">
            {profileText || 'Cinsiyet ve boy girilmedi'}{!readOnly && <span className="underline underline-offset-4 ml-2">{profileText ? 'Düzenle' : 'Ekle'}</span>}
          </button>
        )}
      </div>
      {!shown.length && (
        <p className="lb-label py-6">
          {readOnly ? 'Henüz ölçü girilmedi.' : 'Kilonu haftada bir gir; istersen bel, kol gibi ölçülerini de. Burada haftalık seyrini ve hedefe ne kaldığını görürsün.'}
        </p>
      )}
      <ul>
        {shown.map(row => {
          const goal = row.goalKey ? goals[row.goalKey] : undefined;
          const status = measureStatus(row.points, goal)!;
          const series = weeklySeries(row.points);
          // From week to week, as the chart: a daily weigh-in's swing is left out.
          const trend = seriesChange(series)!;
          const trendInk = goalInk(series[0].value, series[series.length - 1].value, goal);
          const open = openId === row.id;
          const reached = goal !== undefined && status.toGoal !== null
            && (status.toGoal === 0 || (goal !== status.first && Math.sign(status.toGoal) !== Math.sign(goal - status.first)));
          return (
            <li key={row.id} className="border-b lb-rule">
              <button type="button" onClick={() => setOpenId(id => id === row.id ? null : row.id)} aria-expanded={open}
                className="lb-press w-full flex items-center gap-3 -mx-2 px-2 py-3 rounded text-left">
                <span className="w-28 sm:w-40 md:w-auto md:flex-1 shrink-0 min-w-0">
                  <span className="block text-[15px] font-medium truncate">{row.label}</span>
                  {row.badge && <span className="block text-[12px] text-(--color-text-secondary)">{row.badge}</span>}
                </span>
                {/* As in the İlerleme list: on a wide screen the trend keeps a fixed width. */}
                <MiniLine series={series} className="flex-1 min-w-0 md:flex-none md:w-56" />
                <span className="w-24 shrink-0 text-right lb-figure whitespace-nowrap">
                  <span className="text-[17px] font-semibold">{num(status.latest)}</span>
                  <span className="text-[12px] text-(--color-text-secondary) ml-0.5">{row.unit}</span>
                  <span className="block text-[12px] text-(--color-text-secondary)">{signed(trend.change)}</span>
                </span>
                <span aria-hidden="true" className={`w-3 shrink-0 text-(--color-text-secondary) transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
              </button>
              {open && (
                <div className="lb-settle pb-5">
                  {/* The result first, in figures: how much, how fast, how far the target is. */}
                  <div className="grid grid-cols-3 gap-3 max-w-xl">
                    {series.length > 1 && <Stat color={trendInk} figure={withUnit(signed(trend.change), row.unit)} note={`${trend.weeks} haftada`} />}
                    {series.length > 1 && <Stat color={trendInk} figure={trend.perWeek === null ? '—' : withUnit(signed(trend.perWeek), row.unit)} note="haftada ortalama" />}
                    {goal !== undefined ? (
                      <button disabled={readOnly} onClick={() => setGoalFor(row)} className="text-left min-w-0">
                        <Stat color="var(--lb-gain)" figure={reached ? 'Ulaşıldı' : withUnit(num(Math.abs(status.toGoal!)), row.unit)}
                          note={reached ? `hedef ${num(goal)}` : `kaldı · hedef ${num(goal)}`} />
                      </button>
                    ) : !readOnly && row.goalKey && (
                      <button onClick={() => setGoalFor(row)} className="self-start min-h-11 text-left text-[15px] text-(--color-text-secondary) underline underline-offset-4">Hedef belirle</button>
                    )}
                  </div>
                  {row.note && <p className="mt-3 text-[13px] leading-snug text-(--color-text-secondary)">{row.note}</p>}
                  {series.length > 1 ? <BodyChart series={series} goal={goal} label={row.label} unit={row.unit} />
                    : <p className="mt-3 text-[13px] text-(--color-text-secondary)">Grafik ikinci haftanın ölçüsüyle çizilir.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canEstimate && !readOnly && (
        <button onClick={() => setProfileOpen(true)} className="mt-3 text-left text-[13px] leading-snug text-(--color-text-secondary)">
          Cinsiyetini ve boyunu girersen yağ oranını bel ve boyun ölçünden tahmin ederiz. <span className="underline underline-offset-4">Gir</span>
        </button>
      )}
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
      {goalFor?.goalKey && <GoalSheet goalKey={goalFor.goalKey} label={goalFor.label} unit={goalFor.unit} onClose={() => setGoalFor(null)} />}
      {profileOpen && <ProfileSheet onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
