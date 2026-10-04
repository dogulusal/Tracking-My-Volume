import { useCallback, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ProgramEditor } from '@/pages/ProgramEditor';
import { Modal } from '@/components/shared/Modal';
import { weekName } from '@/utils/phases';
import type { AppAction, Program } from '@/types';
import { AthleteScope } from './AthleteScope';
import { DEMO_COACH } from './demo/athletes';
import { possessive, useCoach } from './store';
import { activePlanOf, coachPlanOf } from './templates';

const sentDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function DayCard({ day, actions }: { day: Program; actions?: ReactNode }) {
  const moves = day.exercises.filter(exercise => exercise.isActive);
  return (
    <section className="a-card px-4 pt-3 pb-2">
      <div className="flex items-start justify-between gap-3">
        <h3 className="a-display text-[26px] truncate">{day.name}</h3>
        {actions}
      </div>
      <ul className="mt-1">
        {moves.length === 0 && <li className="py-2 border-t border-(--color-border) text-[15px] text-(--color-text-secondary)">Hareket yok</li>}
        {moves.map(exercise => (
          <li key={exercise.id} className="flex items-baseline justify-between gap-3 py-2 border-t border-(--color-border)">
            <span className="min-w-0 text-[16px] truncate">{exercise.name}</span>
            <span className="lb-figure shrink-0 text-[17px] text-(--color-text-secondary)">
              {exercise.defaultSets} × {exercise.defaultReps || '—'}{exercise.defaultWeight ? ` · ${exercise.defaultWeight} kg` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Setting up a program for someone: from nothing, or from one the coach
 * saved earlier. The only place saved programs show.
 */
function StartProgram({ athleteId, firstName, hasOwn }: { athleteId: string; firstName: string; hasOwn: boolean }) {
  const coach = useCoach();
  const [removing, setRemoving] = useState<string | null>(null);
  const toRemove = coach.library.find(item => item.id === removing);
  return (
    <section className="mt-7">
      <h2 className="a-display text-[28px]">{firstName} için program kur</h2>
      <p className="mt-1 text-[15px] leading-snug text-(--color-text-secondary)">
        {hasOwn
          ? `Kendi programının yanında durur; ${firstName} hangisiyle çalışacağını seçer. Bu programı sen yönetirsin.`
          : `Gönderince ${possessive(firstName)} programı olur. Bu programı sen yönetirsin.`}
      </p>
      <button onClick={() => coach.createPlan(athleteId, null)} className="mt-3 w-full h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold">
        Boş başla
      </button>
      {coach.library.length > 0 && (
        <>
          <p className="mt-5 text-[13px] text-(--color-text-secondary)">ya da kaydettiğin bir programdan başla, sonra {firstName} için düzelt</p>
          {/* One column held to the page: a long name truncates instead of widening the row. */}
          <ul className="mt-2 grid grid-cols-1 gap-2">
            {coach.library.map(template => (
              <li key={template.id} className="a-card px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-semibold truncate">{template.name}</p>
                  <p className="text-[13px] text-(--color-text-secondary) truncate">{template.days.map(day => day.name).join(' · ')}</p>
                </div>
                <button onClick={() => setRemoving(template.id)} className="shrink-0 h-11 px-2 text-[14px] text-(--color-text-secondary)">Sil</button>
                <button onClick={() => coach.createPlan(athleteId, template.id)} className="shrink-0 h-11 px-4 rounded-full bg-(--color-bg-input) text-[15px] font-medium">Bununla başla</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Modal isOpen={toRemove !== undefined} onClose={() => setRemoving(null)} confirmVariant="danger" confirmText="Sil"
        title={`${toRemove?.name ?? ''} silinsin mi?`}
        message="Yalnız kaydettiklerinden silinir. Bununla başladığın programlar değişmez."
        onConfirm={() => { if (removing) coach.removeTemplate(removing); setRemoving(null); }} />
    </section>
  );
}

/**
 * The athlete's programs as the coach sees them: their own, read-only, and
 * the one the coach set up for them, with unsent changes on top.
 */
export function AthleteProgram({ athleteId, firstName }: { athleteId: string; firstName: string }) {
  const coach = useCoach();
  const navigate = useNavigate();
  const [justSent, setJustSent] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const draft = coach.draftState(athleteId);
  if (!draft) return null;
  const lines = coach.draftLines(athleteId);
  const sent = [...(coach.sent[athleteId] ?? [])].reverse();
  const mine = coachPlanOf(draft, DEMO_COACH);
  const active = activePlanOf(draft);
  const ownInUse = active.plan && !active.plan.coach ? active : null;
  const week = weekName(draft.phases, draft.currentWeek, draft.currentWeek);

  const ownProgram = ownInUse && (
    <section className="mt-6">
      <p className="text-[17px] font-semibold">{possessive(firstName)} kendi programı · {ownInUse.plan!.name}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-(--color-text-secondary)">
        {firstName} kendisi kurdu{mine.plan ? ' ve şu an bunu kullanıyor' : ''}; değiştiremezsin, yalnız görürsün.
      </p>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {ownInUse.days.map(day => <DayCard key={day.id} day={day} />)}
      </div>
    </section>
  );

  if (!mine.plan) {
    return (
      <div className="mt-2">
        {ownProgram ?? <p className="mt-4 text-[17px]">{firstName} henüz program kurmadı.</p>}
        <StartProgram athleteId={athleteId} firstName={firstName} hasOwn={Boolean(ownInUse)} />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-[17px] font-semibold">{mine.plan.name}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-(--color-text-secondary)">
        Senin kurduğun program · {mine.days.length} gün · {week}.
        {active.plan?.id !== mine.plan.id && ownInUse && ` ${firstName} şu an kendi programını kullanıyor; seninkine geçince Bugün ekranı bundan gider.`}
      </p>

      {lines.length > 0 ? (
        <section className="mt-3 a-card px-4 py-3.5" style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)' }}>
          <p className="text-[17px] font-semibold">Gönderilmedi · {lines.length} değişiklik</p>
          <ul className="mt-1.5 grid gap-1 text-[15px] leading-snug">{lines.map(line => <li key={line}>{line}</li>)}</ul>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { coach.sendDraft(athleteId); setJustSent(true); }}
              className="flex-1 h-12 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">Gönder</button>
            <button onClick={() => coach.discardDraft(athleteId)} className="h-12 px-4 rounded-2xl bg-(--color-bg-input) text-[16px] font-medium">Vazgeç</button>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-(--color-text-secondary)">
            {firstName} uygulamayı açınca neyin değiştiğini görür. Geçmiş haftaların kayıtları değişmez.
          </p>
        </section>
      ) : justSent && (
        <p className="mt-3 a-card px-4 py-3 text-[15px] leading-snug" style={{ boxShadow: 'inset 0 0 0 1.5px var(--lb-gain)' }}>
          Gönderildi. {firstName} uygulamayı açınca görür.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {mine.days.map(day => (
          <DayCard key={day.id} day={day} actions={(
            <div className="shrink-0 flex flex-col items-end">
              <button onClick={() => navigate(`/sporcular/${athleteId}/gun/${day.id}`)}
                className="h-11 px-4 rounded-full bg-(--color-bg-input) text-[15px] font-medium">Düzenle</button>
              <button onClick={() => coach.removeDay(athleteId, day.id)} className="h-9 text-[13px]" style={{ color: 'var(--lb-drop)' }}>Plandan çıkar</button>
            </div>
          )} />
        ))}
      </div>
      <button onClick={() => navigate(`/sporcular/${athleteId}/gun`)} className="mt-2 w-full h-14 rounded-2xl bg-(--color-bg-card) text-[16px] font-medium">
        {mine.days.length ? 'Yeni gün ekle' : 'İlk günü ekle'}
      </button>

      {mine.days.length > 0 && (
        <div className="mt-3">
          {saveName === null ? (
            <button onClick={() => { setSaveName(mine.plan!.name === 'Antrenör programı' ? `${mine.days.length} günlük program` : mine.plan!.name); setSaved(false); }}
              className="h-11 text-[15px] text-(--color-text-secondary) underline">Bu programı kaydet</button>
          ) : (
            <form className="flex gap-2" onSubmit={event => { event.preventDefault(); coach.saveTemplate(athleteId, saveName); setSaveName(null); setSaved(true); }}>
              <input id="template-name" autoFocus value={saveName} onChange={event => setSaveName(event.target.value)} aria-label="Kaydedilecek adı"
                className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-(--color-bg-card) text-[16px] outline-none" />
              <button type="submit" disabled={!saveName.trim()} className="h-11 px-4 rounded-xl bg-(--color-text-primary) text-(--color-bg-primary) font-semibold disabled:opacity-40">Kaydet</button>
              <button type="button" onClick={() => setSaveName(null)} className="h-11 px-2 text-[15px] text-(--color-text-secondary)">Vazgeç</button>
            </form>
          )}
          <p className="mt-1 text-[13px] leading-snug" style={{ color: saved ? 'var(--lb-gain)' : 'var(--color-text-secondary)' }}>
            {saved ? 'Kaydedildi. ' : ''}Başka birine program kurarken bununla başlayabilirsin.
          </p>
        </div>
      )}

      {sent.length > 0 && (
        <section className="mt-8">
          <h2 className="a-display text-[28px]">Gönderilenler</h2>
          <ul className="mt-1">
            {sent.map(update => (
              <li key={update.id} className="py-2.5 border-b border-(--color-bg-card) last:border-b-0">
                <p className="text-[13px] text-(--color-text-secondary)">{sentDate.format(new Date(update.at))}</p>
                <ul className="mt-0.5 text-[15px] leading-snug">{update.lines.map(line => <li key={line}>{line}</li>)}</ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ownProgram}
    </div>
  );
}

/** The day editor on the coach's plan: every save becomes part of the next update. */
export function AthleteDayEditor() {
  const { id = '', programId } = useParams();
  const coach = useCoach();
  const { draftDispatch } = coach;
  const dispatch = useCallback((action: AppAction) => draftDispatch(id, action), [draftDispatch, id]);
  const athlete = coach.athletes.find(item => item.id === id);
  const state = coach.draftState(id);
  if (!athlete || !state || !coachPlanOf(state, DEMO_COACH).plan) return <Navigate to={`/sporcular/${id}?tab=program`} replace />;
  return (
    <AthleteScope state={state} dispatch={dispatch}>
      <ProgramEditor key={programId ?? 'yeni'} programId={programId ?? null}
        exit={{ to: `/sporcular/${id}?tab=program`, label: `${possessive(athlete.name.split(' ')[0])} programı` }} />
    </AthleteScope>
  );
}
