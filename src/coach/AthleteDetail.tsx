import { useContext, useLayoutEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AppContext } from '@/context/AppContext';
import { History } from '@/pages/History';
import { Charts } from '@/pages/Charts';
import { Modal } from '@/components/shared/Modal';
import { useWeekOverview, type WeekDay } from '@/hooks/useWeekOverview';
import { formatSet } from '@/utils/formatters';
import { weekName } from '@/utils/phases';
import { STALL_WEEKS } from '@/utils/progression';
import { AthleteScope } from './AthleteScope';
import { Avatar } from './parts';
import { agoText, needsAttention } from './summary';
import { possessive, sinceText, useCoach } from './store';

const nf = new Intl.NumberFormat('tr-TR');
const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
type Tab = 'week' | 'history' | 'charts';

// The athlete's day tiles as on their home page, without the link into the workout.
function DayTile({ day }: { day: WeekDay }) {
  const { improved, same, decreased, new: first } = day.counts;
  const compared = improved + same + decreased + first;
  return (
    <div className="min-h-14 rounded-[14px] px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center"
      style={{ background: day.status === 'pending' ? 'color-mix(in srgb, var(--color-bg-card) 55%, transparent)' : 'var(--color-bg-card)' }}>
      <span className="text-[12px] leading-tight truncate max-w-full text-(--color-text-secondary)">{day.program.name}</span>
      {day.status === 'done' && compared > 0 && compared === first ? <span className="text-[12px]">ilk kayıt</span>
        : day.status === 'done' && compared > 0 ? (
          <span className="lb-figure text-[18px] font-semibold leading-none" style={{ color: improved > 0 ? 'var(--lb-gain)' : undefined }}>{improved} / {compared}</span>
        ) : day.status === 'done' ? <span className="text-[12px]">kayıtlı</span>
        : day.status === 'holiday' ? <span className="text-[12px] text-(--color-text-secondary)">tatil</span>
        : <span className="text-[12px] text-(--color-text-secondary)">—</span>}
    </div>
  );
}

/** What the athlete's home page says about this week, plus their latest notes. */
function AthleteWeek({ firstName }: { firstName: string }) {
  const ctx = useContext(AppContext);
  const { programs, weekLogs, currentWeek, weekLabel, weekStats, streak, programStatuses, stalled } = useWeekOverview();
  if (!ctx || programs.length === 0) {
    return <p className="mt-6 text-[17px] leading-snug">{firstName} henüz programını kurmadı. İlk antrenmanını kaydedince burada görürsün.</p>;
  }
  const phases = ctx.state.phases;
  const programName = (id: string) => programs.find(program => program.id === id)?.name ?? '';
  // Notes the athlete left, newest first: on the workout and on single movements.
  const notes = [...weekLogs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap(log => [
      ...(log.notes.trim() ? [{ key: `${log.id}-w`, log, text: log.notes.trim(), move: null as string | null }] : []),
      ...log.exercises.filter(exercise => exercise.note?.trim()).map(exercise => ({ key: `${log.id}-${exercise.exerciseId}`, log, text: exercise.note!.trim(), move: exercise.exerciseName })),
    ])
    .slice(0, 4);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-x-14 lg:items-start">
      <div>
        <p className="mt-5 text-[15px] text-(--color-text-secondary)">{weekLabel} · {weekStats.completed}/{weekStats.total} antrenman</p>
        <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, programStatuses.length)}, minmax(0, 1fr))` }}>
          {programStatuses.map(day => <DayTile key={day.program.id} day={day} />)}
        </div>
        <p className="mt-1.5 text-[12px] text-(--color-text-secondary)">Yeşil rakam: geçen haftayı geçtiği hareket sayısı</p>

        <section className="mt-7">
          <h2 className="a-display text-[28px]">{possessive(firstName)} notları</h2>
          {notes.length === 0 ? <p className="mt-1 text-[15px] text-(--color-text-secondary)">Henüz not yok.</p> : (
            <ul className="mt-1">
              {notes.map(note => (
                <li key={note.key} className="py-2.5 border-b border-(--color-bg-card) last:border-b-0">
                  <p className="text-[13px] text-(--color-text-secondary)">
                    {dayMonth.format(new Date(`${note.log.date.slice(0, 10)}T12:00:00`))} · {programName(note.log.programId)} · {weekName(phases, note.log.weekNumber, currentWeek)}{note.move ? ` · ${note.move}` : ''}
                  </p>
                  <p className="mt-0.5 text-[16px] leading-snug">{note.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div>
        <div className="mt-7 grid grid-cols-2 gap-2">
          <div className="a-card px-4 py-3">
            <p className="lb-figure text-[30px] font-bold leading-none">{weekStats.volume > 0 ? nf.format(Math.round(weekStats.volume)) : '—'}{weekStats.volume > 0 && <span className="text-[16px] font-semibold text-(--color-text-secondary)"> kg</span>}</p>
            <p className="mt-1 text-[13px] text-(--color-text-secondary)">bu haftanın hacmi</p>
          </div>
          <div className="a-card px-4 py-3">
            <p className="lb-figure text-[30px] font-bold leading-none">{streak}<span className="text-[16px] font-semibold text-(--color-text-secondary)"> hafta</span></p>
            <p className="mt-1 text-[13px] text-(--color-text-secondary)">üst üste antrenman</p>
          </div>
        </div>
        {stalled.length > 0 && (
          <section className="mt-7">
            <h2 className="a-display text-[28px]">Yerinde sayanlar</h2>
            <p className="mt-1 text-[13px] text-(--color-text-secondary)">En iyi set {STALL_WEEKS} haftadan uzun süredir aşılmadı.</p>
            <ul className="mt-2">
              {stalled.map(({ key, name, stall }) => (
                <li key={key} className="flex items-baseline gap-3 py-2.5 border-b border-(--color-bg-card)">
                  <span className="flex-1 min-w-0 text-[16px] truncate">{name}</span>
                  <span className="lb-figure text-[18px] text-(--color-text-secondary)">{formatSet(stall.best)}</span>
                  <span className="lb-figure w-14 text-right text-[18px] font-semibold">{stall.weeks} hf</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** One athlete, read-only: their week, their History grid and their charts. */
export function AthleteDetail() {
  const { id = '' } = useParams();
  const coach = useCoach();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('week');
  const [removing, setRemoving] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  // Opened from a long list: start at the athlete's name, not where the list was.
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [id]);
  const athlete = coach.athletes.find(item => item.id === id);
  const state = athlete ? coach.athleteState(athlete.id) : null;
  const summary = athlete ? coach.summaries[athlete.id] : undefined;
  if (!athlete || !state || !summary) return <Navigate to="/sporcular" replace />;

  const note = coach.notes[athlete.id] ?? '';
  const firstName = athlete.name.split(' ')[0];
  const tabs: [Tab, string][] = [['week', 'Bu hafta'], ['history', 'Geçmiş'], ['charts', 'Grafikler']];
  const chip = (active: boolean) =>
    `shrink-0 h-11 px-4 rounded-full text-[15px] whitespace-nowrap ${active ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-card) text-(--color-text-secondary)'}`;

  return (
    <div className="max-w-xl lg:max-w-5xl mx-auto px-5 pt-1 pb-8">
      <Link to="/sporcular" className="inline-flex items-center h-11 -ml-1 px-1 text-[15px] text-(--color-text-secondary)">‹ Antrenör</Link>
      <div className="flex items-center gap-3">
        <Avatar name={athlete.name} size={52} alert={Boolean(needsAttention(summary))} />
        <h1 className="min-w-0 a-display text-[clamp(38px,12vw,72px)] tracking-[-0.01em] leading-[0.95]">{athlete.name}</h1>
      </div>
      <p className="mt-2 text-[15px] text-(--color-text-secondary)">
        Son antrenman: {agoText(summary.daysSinceLast)} · {sinceText(athlete.joinedAt)} ekibinde
      </p>

      {/* The coach's own note: a goal, an injury to watch. Never shown to the athlete. */}
      {noteDraft !== null ? (
        <form className="mt-3" onSubmit={event => { event.preventDefault(); coach.setNote(athlete.id, noteDraft); setNoteDraft(null); }}>
          <label htmlFor="coach-note" className="text-[13px] text-(--color-text-secondary)">Notun · yalnız sen görürsün</label>
          <textarea id="coach-note" autoFocus rows={3} value={noteDraft} onChange={event => setNoteDraft(event.target.value)}
            placeholder="Ör. hedef: bench 80 kg · omzuna dikkat"
            className="mt-1 w-full px-3 py-2 rounded-2xl bg-(--color-bg-card) text-[16px] leading-snug outline-none resize-y" />
          <div className="mt-1 flex gap-2">
            <button type="submit" className="h-11 px-5 rounded-full bg-(--color-text-primary) text-(--color-bg-primary) text-[15px] font-semibold">Kaydet</button>
            <button type="button" onClick={() => setNoteDraft(null)} className="h-11 px-4 rounded-full text-[15px] text-(--color-text-secondary)">Vazgeç</button>
          </div>
        </form>
      ) : note ? (
        <button onClick={() => setNoteDraft(note)} className="mt-3 w-full text-left a-card px-4 py-3">
          <span className="block text-[13px] text-(--color-text-secondary)">Notun · yalnız sen görürsün · düzenle</span>
          <span className="block mt-0.5 text-[16px] leading-snug">{note}</span>
        </button>
      ) : (
        <button onClick={() => setNoteDraft('')} className="mt-3 h-11 px-4 rounded-full bg-(--color-bg-card) text-[15px]">+ Not ekle</button>
      )}

      <div className="mt-4 -mx-5 px-5 flex gap-1.5 overflow-x-auto scrollbar-hide" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={chip(tab === key)}>{label}</button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-(--color-text-secondary)">Salt okunur: {possessive(firstName)} ekranlarını görüyorsun, kayıtlarını değiştiremezsin.</p>

      <AthleteScope state={state}>
        {tab === 'week' && <AthleteWeek firstName={firstName} />}
        {tab === 'history' && <div className="mt-3 -mx-1"><History embedded /></div>}
        {tab === 'charts' && <div className="mt-3"><Charts embedded /></div>}
      </AthleteScope>

      <section className="mt-10 pt-4 border-t border-(--color-border)">
        <p className="text-[13px] text-(--color-text-secondary)">Grup</p>
        <div className="mt-1.5 -mx-5 px-5 flex gap-1.5 overflow-x-auto scrollbar-hide">
          <button onClick={() => coach.setGroup(athlete.id, null)} aria-pressed={athlete.group === null} className={chip(athlete.group === null)}>Grupsuz</button>
          {coach.groups.map(name => (
            <button key={name} onClick={() => coach.setGroup(athlete.id, name)} aria-pressed={athlete.group === name} className={chip(athlete.group === name)}>{name}</button>
          ))}
        </div>
        <button onClick={() => setRemoving(true)} className="mt-5 h-11 px-4 rounded-full text-[15px] font-medium" style={{ color: 'var(--lb-drop)', boxShadow: 'inset 0 0 0 1px var(--lb-drop)' }}>
          Ekipten çıkar
        </button>
      </section>

      <Modal isOpen={removing} onClose={() => setRemoving(false)} confirmVariant="danger" confirmText="Çıkar"
        title={`${athlete.name} ekipten çıkarılsın mı?`}
        message={`Artık ${possessive(firstName)} antrenmanlarını göremezsin. Kayıtları silinmez, kendi uygulamasında durur. Yeniden görmek için yeni bir davet gerekir.`}
        onConfirm={() => { coach.removeAthlete(athlete.id); setRemoving(false); navigate('/sporcular', { replace: true }); }} />
    </div>
  );
}
