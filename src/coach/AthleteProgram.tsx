import { useCallback, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ProgramEditor } from '@/pages/ProgramEditor';
import { programVersionAt } from '@/utils/programVersions';
import { weekName } from '@/utils/phases';
import type { AppAction } from '@/types';
import { AthleteScope } from './AthleteScope';
import { possessive, useCoach } from './store';

const sentDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * The athlete's program as the coach will leave it: their days with the
 * coach's unsent changes on top, the changes in words, and what was sent.
 */
export function AthleteProgram({ athleteId, firstName }: { athleteId: string; firstName: string }) {
  const coach = useCoach();
  const navigate = useNavigate();
  const [justSent, setJustSent] = useState(false);
  const draft = coach.draftState(athleteId);
  if (!draft) return null;
  const lines = coach.draftLines(athleteId);
  const sent = [...(coach.sent[athleteId] ?? [])].reverse();
  const scope = programVersionAt(draft, draft.currentWeek);
  const plan = scope.plans.find(p => p.id === scope.activePlanId) ?? scope.plans[0];
  const days = plan ? plan.programIds.flatMap(id => scope.programs.filter(program => program.id === id)) : [];

  return (
    <div className="mt-4">
      <p className="text-[15px] text-(--color-text-secondary)">
        {days.length ? `${plan?.name ?? 'Program'} · ${days.length} gün · ${weekName(draft.phases, draft.currentWeek, draft.currentWeek)}` : `${firstName} henüz program kurmadı.`}
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
            {firstName} uygulamayı açınca programına işlenir ve neyin değiştiğini görür. Geçmiş haftaların kayıtları değişmez.
          </p>
        </section>
      ) : justSent && (
        <p className="mt-3 a-card px-4 py-3 text-[15px] leading-snug" style={{ boxShadow: 'inset 0 0 0 1.5px var(--lb-gain)' }}>
          Gönderildi. {firstName} uygulamayı açınca programına işlenir.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {days.map(day => (
          <section key={day.id} className="a-card px-4 pt-3 pb-2">
            <div className="flex items-start justify-between gap-3">
              <h3 className="a-display text-[26px] truncate">{day.name}</h3>
              <button onClick={() => navigate(`/sporcular/${athleteId}/gun/${day.id}`)}
                className="shrink-0 h-11 px-4 rounded-full bg-(--color-bg-input) text-[15px] font-medium">Düzenle</button>
            </div>
            <ul className="mt-1">
              {day.exercises.filter(exercise => exercise.isActive).map(exercise => (
                <li key={exercise.id} className="flex items-baseline justify-between gap-3 py-2 border-t border-(--color-border)">
                  <span className="min-w-0 text-[16px] truncate">{exercise.name}</span>
                  <span className="lb-figure shrink-0 text-[17px] text-(--color-text-secondary)">
                    {exercise.defaultSets} × {exercise.defaultReps || '—'}{exercise.defaultWeight ? ` · ${exercise.defaultWeight} kg` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <button onClick={() => navigate(`/sporcular/${athleteId}/gun`)} className="mt-2 w-full h-14 rounded-2xl bg-(--color-bg-card) text-[16px] font-medium">
        {days.length ? 'Yeni gün ekle' : 'İlk günü kur'}
      </button>

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
    </div>
  );
}

/** The day editor on the athlete's program: every save becomes part of the next update. */
export function AthleteDayEditor() {
  const { id = '', programId } = useParams();
  const coach = useCoach();
  const { draftDispatch } = coach;
  const dispatch = useCallback((action: AppAction) => draftDispatch(id, action), [draftDispatch, id]);
  const athlete = coach.athletes.find(item => item.id === id);
  const state = coach.draftState(id);
  if (!athlete || !state) return <Navigate to="/sporcular" replace />;
  return (
    <AthleteScope state={state} dispatch={dispatch}>
      <ProgramEditor key={programId ?? 'yeni'} programId={programId ?? null}
        exit={{ to: `/sporcular/${id}?tab=program`, label: `${possessive(athlete.name.split(' ')[0])} programı` }} />
    </AthleteScope>
  );
}
