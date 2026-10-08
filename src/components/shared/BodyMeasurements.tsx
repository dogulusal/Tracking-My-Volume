import { useContext, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { useReadOnly } from '@/context/ReadOnly';
import { BottomSheet } from '@/components/shared/BottomSheet';
import { useWidth } from '@/components/shared/ExerciseTrend';
import { MEASURES, estimatedBodyFat, formMeasures, localDay, measureStatus, pointsOf, weeklySeries, type Point } from '@/utils/body';
import type { BodyMeasurement, BodyProfile, MeasureKey } from '@/types';

const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortDate = (date: string) => dayMonth.format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
const num = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
const signed = (value: number) => value === 0 ? '±0' : `${value > 0 ? '+' : '−'}${num(Math.abs(value))}`;
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

/** The trend at a glance, as in the İlerleme list: no axes, the latest dot larger. */
function MiniLine({ series, className = '' }: { series: { value: number }[]; className?: string }) {
  const [ref, width] = useWidth<HTMLSpanElement>();
  const height = 28;
  const min = Math.min(...series.map(point => point.value));
  const max = Math.max(...series.map(point => point.value));
  const y = (value: number) => max === min ? height / 2 : 4 + (1 - (value - min) / (max - min)) * (height - 8);
  const x = (index: number) => series.length > 1 ? 3 + (index / (series.length - 1)) * (width - 6) : width / 2;
  return (
    <span ref={ref} className={`block ${className}`} style={{ height }} aria-hidden="true">
      {width > 0 && series.length > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <polyline fill="none" points={series.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')}
            style={{ stroke: 'var(--color-text-secondary)' }} strokeOpacity="0.7" strokeWidth="1.25" strokeLinejoin="round" />
          <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].value)} r="3" style={{ fill: 'var(--color-text-primary)' }} />
        </svg>
      )}
    </span>
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
                  <span className="block text-[12px] text-(--color-text-secondary)">{signed(status.change)}</span>
                </span>
                <span aria-hidden="true" className={`w-3 shrink-0 text-(--color-text-secondary) transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
              </button>
              {open && (
                <div className="lb-settle pb-5">
                  <p className="lb-label">Başlangıç {num(status.first)} → şimdi {num(status.latest)} ({signed(status.change)}) · son {shortDate(status.latestDate)}</p>
                  {goal !== undefined ? (
                    <button disabled={readOnly} onClick={() => setGoalFor(row)} className="mt-1 text-[15px] text-left" style={{ color: 'var(--lb-gain)' }}>
                      Hedef {num(goal)} {row.unit} · {reached ? 'hedefe ulaşıldı' : `${num(Math.abs(status.toGoal!))} ${row.unit} kaldı`}
                    </button>
                  ) : !readOnly && row.goalKey && (
                    <button onClick={() => setGoalFor(row)} className="mt-1 text-[15px] text-(--color-text-secondary) underline underline-offset-4">Hedef belirle</button>
                  )}
                  {row.note && <p className="mt-1 text-[13px] leading-snug text-(--color-text-secondary)">{row.note}</p>}
                  {series.length > 1 ? <BodyChart series={series} goal={goal} label={row.label} />
                    : <p className="mt-2 text-[13px] text-(--color-text-secondary)">Grafik ikinci haftanın ölçüsüyle çizilir.</p>}
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
