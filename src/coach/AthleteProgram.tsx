import { useCallback, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ProgramEditor } from '@/pages/ProgramEditor';
import { Modal } from '@/components/shared/Modal';
import { weekName } from '@/utils/phases';
import type { AppAction, Program } from '@/types';
import { AthleteScope } from './AthleteScope';
import { DEMO_COACH } from './demo/athletes';
import { dative, possessive, useCoach } from './store';
import { activePlanOf, coachPlanOf, ownPlanOf } from './templates';

const sentDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function DayCard({ day, actions, footer }: { day: Program; actions?: ReactNode; footer?: ReactNode }) {
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
      {footer}
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

/** The athlete's own program, read-only and short: a line per day. */
function OwnProgram({ firstName, name, days }: { firstName: string; name: string; days: Program[] }) {
  return (
    <section className="mt-4">
      <p className="text-[17px] font-semibold">{name}</p>
      <p className="mt-0.5 text-[13px] text-(--color-text-secondary)">{firstName} kendisi kurdu; sen yalnız görürsün, değiştiremezsin.</p>
      <ul className="mt-2 a-card px-4 py-1">
        {days.map(day => (
          <li key={day.id} className="py-2.5 border-b border-(--color-border) last:border-b-0">
            <p className="text-[16px] font-semibold">{day.name}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-(--color-text-secondary)">
              {day.exercises.filter(exercise => exercise.isActive).map(exercise => exercise.name).join(' · ') || 'Hareket yok'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The athlete's programs as the coach sees them. On top, which one they
 * train now. Then either the program the coach set up (editable, with the
 * changes not yet sent) or the athlete's own (read-only); never both stacked.
 */
export function AthleteProgram({ athleteId, firstName }: { athleteId: string; firstName: string }) {
  const coach = useCoach();
  const navigate = useNavigate();
  const [view, setView] = useState<'mine' | 'own'>('mine');
  const [justSent, setJustSent] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const draft = coach.draftState(athleteId);
  if (!draft) return null;
  const lines = coach.draftLines(athleteId);
  const sent = [...(coach.sent[athleteId] ?? [])].reverse();
  const mine = coachPlanOf(draft, DEMO_COACH);
  const own = ownPlanOf(draft);
  const current = coach.athleteState(athleteId);
  const sentPlan = current ? coachPlanOf(current, DEMO_COACH).plan : null;
  const isNew = !sentPlan;
  const inUse = current ? activePlanOf(current).plan : null;
  const usesMine = Boolean(inUse && sentPlan && inUse.id === sentPlan.id);
  const lastSent = coach.sent[athleteId]?.[coach.sent[athleteId].length - 1];
  const week = weekName(draft.phases, draft.currentWeek, draft.currentWeek);
  const showing = mine.plan && (view === 'mine' || !own.plan) ? 'mine' : 'own';
  const tab = (active: boolean) =>
    `flex-1 h-11 rounded-full text-[15px] whitespace-nowrap ${active ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'text-(--color-text-secondary)'}`;

  return (
    <div className="mt-4">
      {/* Which program the athlete trains right now. */}
      <div className="a-card px-4 py-3 flex items-center gap-3">
        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: usesMine ? 'var(--lb-gain)' : 'var(--color-text-secondary)' }} />
        <p className="text-[15px] leading-snug">
          {usesMine ? `${firstName} senin kurduğun programla çalışıyor.`
            : inUse ? `${firstName} kendi programıyla çalışıyor${sentPlan ? '; seninkine henüz geçmedi.' : '.'}`
            : `${possessive(firstName)} henüz programı yok.`}
        </p>
      </div>

      {mine.plan && own.plan && (
        <div className="mt-3 p-1 rounded-full bg-(--color-bg-card) flex" role="tablist">
          <button role="tab" aria-selected={showing === 'mine'} onClick={() => setView('mine')} className={tab(showing === 'mine')}>Senin programın</button>
          <button role="tab" aria-selected={showing === 'own'} onClick={() => setView('own')} className={tab(showing === 'own')}>{possessive(firstName)} programı</button>
        </div>
      )}

      {!mine.plan && (
        <>
          {own.plan && <OwnProgram firstName={firstName} name={own.plan.name} days={own.days} />}
          <StartProgram athleteId={athleteId} firstName={firstName} hasOwn={Boolean(own.plan)} />
        </>
      )}

      {showing === 'own' && mine.plan && own.plan && <OwnProgram firstName={firstName} name={own.plan.name} days={own.days} />}

      {showing === 'mine' && mine.plan && (
        <>
          {lines.length > 0 ? (
            <section className="mt-4 a-card px-4 py-3.5" style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)' }}>
              <p className="text-[17px] font-semibold">{dative(firstName)} henüz gitmedi</p>
              <p className="mt-1 text-[14px] leading-snug text-(--color-text-secondary)">
                Yaptığın değişiklikler sende bekliyor. Gönderince {possessive(firstName)} uygulamasında bugün ekranında şu kart çıkar:
              </p>
              {/* The card the athlete will get, as their home page shows it. */}
              <div className="mt-2 rounded-2xl bg-(--color-bg-primary) px-4 py-3" style={{ boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
                <p className="text-[16px] font-semibold">{isNew ? `${DEMO_COACH} sana bir program kurdu` : `${DEMO_COACH} programını güncelledi`}</p>
                <ul className="mt-1 grid gap-0.5 text-[14px] leading-snug">{lines.map(line => <li key={line}>{line}</li>)}</ul>
                {isNew && own.plan && (
                  <div aria-hidden="true" className="mt-2 flex gap-1.5 text-[13px]">
                    <span className="px-3 py-1.5 rounded-xl bg-(--color-text-primary) text-(--color-bg-primary) font-semibold">Bu programa geç</span>
                    <span className="px-3 py-1.5 rounded-xl bg-(--color-bg-input)">Kendi programımda kal</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { coach.sendDraft(athleteId); setJustSent(true); }}
                  className="flex-1 h-12 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">{dative(firstName)} gönder</button>
                <button onClick={() => coach.discardDraft(athleteId)} className="h-12 px-4 rounded-2xl bg-(--color-bg-input) text-[16px] font-medium">Vazgeç</button>
              </div>
              <p className="mt-2 text-[13px] leading-snug text-(--color-text-secondary)">
                {isNew && own.plan
                  ? `${firstName} kendi programında kalmayı da seçebilir. Geçmiş haftaların kayıtları değişmez.`
                  : 'Bu haftadan geçerli olur. Geçmiş haftaların kayıtları değişmez.'}
              </p>
            </section>
          ) : justSent && lastSent && (
            <p className="mt-4 a-card px-4 py-3 text-[15px] leading-snug" style={{ boxShadow: 'inset 0 0 0 1.5px var(--lb-gain)' }}>
              {dative(firstName)} gönderildi. {lastSent.isNew && own.plan
                ? 'Kartı bugün ekranında görecek ve hangi programla çalışacağını seçecek.'
                : usesMine
                  ? 'Programı bu haftadan itibaren böyle; neyin değiştiğini bugün ekranında görecek.'
                  : `${firstName} şu an kendi programını kullanıyor; değişiklik senin kurduğun programa işlendi.`}
            </p>
          )}

          <div className="mt-5 flex items-baseline justify-between gap-3">
            <h3 className="a-display text-[28px] truncate">{mine.plan.name}</h3>
            <span className="shrink-0 text-[13px] text-(--color-text-secondary)">{mine.days.length} gün · {week}</span>
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {mine.days.map(day => (
              <DayCard key={day.id} day={day} actions={(
                <button onClick={() => navigate(`/sporcular/${athleteId}/gun/${day.id}`)}
                  className="shrink-0 h-11 px-4 rounded-full bg-(--color-bg-input) text-[15px] font-medium">Düzenle</button>
              )} footer={(
                <button onClick={() => coach.removeDay(athleteId, day.id)} className="h-10 text-[13px]" style={{ color: 'var(--lb-drop)' }}>Günü plandan çıkar</button>
              )} />
            ))}
          </div>
          <button onClick={() => navigate(`/sporcular/${athleteId}/gun`)} className="mt-2 w-full h-14 rounded-2xl bg-(--color-bg-card) text-[16px] font-medium">
            {mine.days.length ? '+ Yeni gün ekle' : '+ İlk günü ekle'}
          </button>

          {mine.days.length > 0 && (
            <section className="mt-6 rounded-2xl px-4 py-3" style={{ boxShadow: 'inset 0 0 0 1px var(--color-border)' }}>
              <p className="text-[16px] font-semibold">Bu programı kaydet</p>
              <p className="mt-0.5 text-[13px] leading-snug text-(--color-text-secondary)">
                Kaydedersen başka birine program kurarken boştan başlamazsın: bunu seçer, birkaç dokunuşla o kişiye uyarlarsın.
              </p>
              {saveName === null ? (
                <button onClick={() => { setSaveName(mine.plan!.name === 'Antrenör programı' ? `${mine.days.length} günlük program` : mine.plan!.name); setSaved(false); }}
                  className="mt-2 h-11 px-4 rounded-full bg-(--color-bg-card) text-[15px] font-medium">{saved ? 'Kaydedildi · bir daha kaydet' : 'Kaydet'}</button>
              ) : (
                <form className="mt-2 flex gap-2" onSubmit={event => { event.preventDefault(); coach.saveTemplate(athleteId, saveName); setSaveName(null); setSaved(true); }}>
                  <input id="template-name" autoFocus value={saveName} onChange={event => setSaveName(event.target.value)} aria-label="Kaydedilecek adı"
                    className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-(--color-bg-card) text-[16px] outline-none" />
                  <button type="submit" disabled={!saveName.trim()} className="h-11 px-4 rounded-xl bg-(--color-text-primary) text-(--color-bg-primary) font-semibold disabled:opacity-40">Kaydet</button>
                  <button type="button" onClick={() => setSaveName(null)} className="h-11 px-2 text-[15px] text-(--color-text-secondary)">Vazgeç</button>
                </form>
              )}
            </section>
          )}

          {sent.length > 0 && (
            <section className="mt-6">
              <button onClick={() => setShowSent(value => !value)} aria-expanded={showSent} className="h-11 text-[15px] font-semibold">
                Gönderilenler ({sent.length}) <span className="text-(--color-text-secondary) font-normal">{showSent ? '· gizle' : '· göster'}</span>
              </button>
              {showSent && (
                <ul>
                  {sent.map(update => (
                    <li key={update.id} className="py-2.5 border-b border-(--color-bg-card) last:border-b-0">
                      <p className="text-[13px] text-(--color-text-secondary)">{sentDate.format(new Date(update.at))}</p>
                      <ul className="mt-0.5 text-[15px] leading-snug">{update.lines.map(line => <li key={line}>{line}</li>)}</ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
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
