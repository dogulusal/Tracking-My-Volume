import { useContext, useLayoutEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppContext } from '@/context/AppContext';
import { History } from '@/pages/History';
import { Charts } from '@/pages/Charts';
import { Modal } from '@/components/shared/Modal';
import { WorkoutDetailModal } from '@/components/shared/WorkoutDetailModal';
import { useWeekOverview, type WeekDay } from '@/hooks/useWeekOverview';
import { formatSet } from '@/utils/formatters';
import { weekName } from '@/utils/phases';
import { STALL_WEEKS, bestSet } from '@/utils/progression';
import type { ExerciseLog, WeekLog } from '@/types';
import { AthleteScope } from './AthleteScope';
import { AthleteProgram } from './AthleteProgram';
import { commentsOn, dayNotesOn, useComments } from './comments';
import { DayNoteSheet } from './DayNoteSheet';
import { Avatar } from './parts';
import { agoText, needsAttention } from './summary';
import { possessive, sinceText, useCoach } from './store';

const nf = new Intl.NumberFormat('tr-TR');
const dayMonth = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });
type Tab = 'week' | 'program' | 'history' | 'charts';
const TABS: [Tab, string][] = [['week', 'Bu hafta'], ['program', 'Program'], ['history', 'Geçmiş'], ['charts', 'Grafikler']];

// The athlete's day tiles as on their home page, without the link into the workout.
// A tap opens the day's notes: the coach leaves one there, like the athlete's own week note.
function DayTile({ day, noted, onOpen }: { day: WeekDay; noted: boolean; onOpen: () => void }) {
  const { improved, same, decreased, new: first } = day.counts;
  const compared = improved + same + decreased + first;
  return (
    <button onClick={onOpen} className="lb-press relative min-h-14 rounded-[14px] px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center"
      style={{ background: day.status === 'pending' ? 'color-mix(in srgb, var(--color-bg-card) 55%, transparent)' : 'var(--color-bg-card)' }}>
      {noted && <span aria-label="antrenör notu var" className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-(--color-text-primary)" />}
      <span className="text-[12px] leading-tight truncate max-w-full text-(--color-text-secondary)">{day.program.name}</span>
      {day.status === 'done' && compared > 0 && compared === first ? <span className="text-[12px]">ilk kayıt</span>
        : day.status === 'done' && compared > 0 ? (
          <span className="lb-figure text-[18px] font-semibold leading-none" style={{ color: improved > 0 ? 'var(--lb-gain)' : undefined }}>{improved} / {compared}</span>
        ) : day.status === 'done' ? <span className="text-[12px]">kayıtlı</span>
        : day.status === 'holiday' ? <span className="text-[12px] text-(--color-text-secondary)">tatil</span>
        : <span className="text-[12px] text-(--color-text-secondary)">—</span>}
    </button>
  );
}

/**
 * The athlete's latest workout, one line per movement: the quickest place for
 * the coach to answer it. A tap opens the sets and the comment box.
 */
function LastWorkout({ log, programName, weekText }: { log: WeekLog; programName: string; weekText: string }) {
  const comments = useComments();
  const [open, setOpen] = useState<ExerciseLog | null>(null);
  const trained = log.exercises.filter(exercise => exercise.sets.length > 0);
  return (
    <section className="mt-7">
      <h2 className="a-display text-[28px]">Son antrenmanı</h2>
      <p className="mt-1 text-[13px] text-(--color-text-secondary)">
        {dayMonth.format(new Date(`${log.date.slice(0, 10)}T12:00:00`))} · {programName} · {weekText} · harekete dokun, yorum yaz
      </p>
      <ul className="mt-2">
        {trained.map(exercise => {
          const best = bestSet(exercise.sets);
          const count = commentsOn(comments.list, log.programId, log.weekNumber, exercise.exerciseId).length;
          return (
            <li key={exercise.exerciseId}>
              <button onClick={() => setOpen(exercise)} className="lb-press w-full flex items-baseline gap-3 py-2.5 border-b border-(--color-bg-card) text-left">
                <span className="flex-1 min-w-0 text-[16px] truncate">{exercise.exerciseName}</span>
                {count > 0 && <span className="shrink-0 text-[12px] text-(--color-text-secondary)">yorumlandı</span>}
                <span className="lb-figure shrink-0 text-[18px] font-semibold">{best ? formatSet(best) : '—'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <WorkoutDetailModal
        isOpen={open !== null}
        onClose={() => setOpen(null)}
        exerciseName={open?.exerciseName ?? ''}
        exerciseId={open?.exerciseId ?? ''}
        weekNumber={0}
        title={open ? `${open.exerciseName} · ${weekText}` : undefined}
        currentSets={open?.sets ?? []}
        exerciseNote={open?.note}
        weekNotes={log.notes}
        isEmpty={false}
        coachComments={open ? commentsOn(comments.list, log.programId, log.weekNumber, open.exerciseId) : []}
        onComment={open && comments.add ? text => comments.add!({
          programId: log.programId, weekNumber: log.weekNumber, exerciseId: open.exerciseId, exerciseName: open.exerciseName, text,
        }) : undefined}
      />
    </section>
  );
}

/** What the athlete's home page says about this week, plus their latest notes. */
function AthleteWeek({ firstName }: { firstName: string }) {
  const ctx = useContext(AppContext);
  const { programs, weekLogs, currentWeek, weekLabel, weekStats, streak, programStatuses, stalled } = useWeekOverview();
  const comments = useComments();
  const [openDay, setOpenDay] = useState<WeekDay | null>(null);
  if (!ctx || programs.length === 0) {
    return <p className="mt-6 text-[17px] leading-snug">{firstName} henüz programını kurmadı. İlk antrenmanını kaydedince burada görürsün.</p>;
  }
  const phases = ctx.state.phases;
  const programName = (id: string) => programs.find(program => program.id === id)?.name ?? '';
  const lastLog = weekLogs
    .filter(log => !log.isHoliday && log.exercises.some(exercise => exercise.sets.length > 0))
    .sort((a, b) => b.weekNumber - a.weekNumber || b.date.localeCompare(a.date))[0];
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
          {programStatuses.map(day => (
            <DayTile key={day.program.id} day={day} noted={dayNotesOn(comments.list, day.program.id, currentWeek).length > 0} onOpen={() => setOpenDay(day)} />
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-(--color-text-secondary)">Bir güne dokun: o antrenmana not bırak. Yeşil rakam: geçen haftayı geçtiği hareket sayısı.</p>
        {openDay && (
          <DayNoteSheet
            title={`${openDay.program.name} · ${weekLabel}`}
            status={openDay.status === 'done' ? 'Bu hafta yapıldı.' : openDay.status === 'holiday' ? 'Bu hafta tatil.' : 'Bu hafta henüz yapılmadı; not, antrenmana başlarken görünür.'}
            athleteNote={weekLogs.find(log => log.programId === openDay.program.id && log.weekNumber === currentWeek)?.notes}
            notes={dayNotesOn(comments.list, openDay.program.id, currentWeek)}
            onAdd={comments.add ? text => comments.add!({ programId: openDay.program.id, weekNumber: currentWeek, exerciseId: '', exerciseName: '', dayName: openDay.program.name, text }) : undefined}
            onClose={() => setOpenDay(null)} />
        )}

        {lastLog && <LastWorkout log={lastLog} programName={programName(lastLog.programId)} weekText={weekName(phases, lastLog.weekNumber, currentWeek)} />}

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

/**
 * One athlete: their week, program, History grid and charts. Records are
 * read-only; the coach answers with comments and program changes.
 */
export function AthleteDetail() {
  const { id = '' } = useParams();
  const coach = useCoach();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find(([key]) => key === params.get('tab'))?.[0] ?? 'week';
  const setTab = (next: Tab) => setParams(next === 'week' ? {} : { tab: next }, { replace: true });
  const [removing, setRemoving] = useState(false);
  // Opened from a long list: start at the athlete's name, not where the list was.
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [id]);
  const athlete = coach.athletes.find(item => item.id === id);
  const state = athlete ? coach.athleteState(athlete.id) : null;
  const summary = athlete ? coach.summaries[athlete.id] : undefined;
  if (!athlete || !state || !summary) return <Navigate to="/sporcular" replace />;

  const firstName = athlete.name.split(' ')[0];
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

      <div className="mt-4 -mx-5 px-5 flex gap-1.5 overflow-x-auto scrollbar-hide" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={chip(tab === key)}>{label}</button>
        ))}
      </div>
      {/* Where to tap for a note or a comment is said next to each part, once. */}
      {tab !== 'program' && (
        <p className="mt-2 text-[12px] text-(--color-text-secondary)">{possessive(firstName)} ekranları; kayıtlarını değiştiremezsin.</p>
      )}

      <AthleteScope state={state} comments={{ list: coach.comments[athlete.id] ?? [], add: comment => coach.addComment(athlete.id, comment) }}>
        {tab === 'week' && <AthleteWeek firstName={firstName} />}
        {tab === 'program' && <AthleteProgram athleteId={athlete.id} firstName={firstName} />}
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
