import { Link, Navigate } from 'react-router-dom';
import { useContext, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { useWeekOverview, type WeekDay } from '@/hooks/useWeekOverview';
import { Modal } from '@/components/shared/Modal';
import { staleWeekAge } from '@/utils/weekAdvance';
import { possessive, useCoach } from '@/coach/store';
import { dayNotesOn } from '@/coach/comments';
import { localDay, measurementDue, weekStart } from '@/utils/body';
import { MeasurementSheet } from '@/components/shared/BodyMeasurements';

const WEEK_DONE_KEY = 'tmv-hafta-bitti-sonra';
const MEASURE_LATER_KEY = 'tmv-olcu-sonra';
const weekdayFormat = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' });
const dayMonthFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' });

// One day of the week as a tile: what it did against last week once logged.
function DayTile({ day, isNext, week }: { day: WeekDay; isNext: boolean; week: number }) {
  const { improved, same, decreased, new: first } = day.counts;
  const compared = improved + same + decreased + first;
  const style = isNext
    ? { boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)' }
    : day.status === 'pending' && !day.hasDraft ? { background: 'color-mix(in srgb, var(--color-bg-card) 55%, transparent)' } : { background: 'var(--color-bg-card)' };
  return (
    <Link to={`/workout/${day.program.id}/week/${week}`} style={style}
      className="min-h-14 xl:min-h-[92px] rounded-[14px] xl:rounded-[18px] px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 xl:gap-1.5 text-center">
      <span className={`text-[12px] xl:text-[15px] leading-tight truncate max-w-full ${isNext ? 'font-semibold' : 'text-(--color-text-secondary)'}`}>{day.program.name}</span>
      {day.status === 'done' && compared > 0 && compared === first ? (
        // Nothing to compare yet: a first record is not 0 out of N.
        <span className="text-[12px]">ilk kayıt</span>
      ) : day.status === 'done' && compared > 0 ? (
        <span className="lb-figure text-[18px] xl:text-[28px] font-semibold leading-none" style={{ color: improved > 0 ? 'var(--lb-gain)' : undefined }}>
          {improved} / {compared}
        </span>
      ) : day.status === 'done' ? <span className="text-[12px]">kayıtlı</span>
        : day.status === 'holiday' ? <span className="text-[12px] text-(--color-text-secondary)">tatil</span>
        : day.hasDraft ? <span className="text-[12px] font-semibold">taslak</span>
        : isNext ? <span className="text-[12px] text-(--color-text-secondary)">sırada</span> : null}
    </Link>
  );
}

export function Dashboard() {
  const [confirmNewWeek, setConfirmNewWeek] = useState(false);
  const coach = useCoach();
  const ctx = useContext(AppContext);
  // Shown once it is in the record, so the card never announces what is not there yet.
  const applied = ctx?.state.appliedCoachUpdates;
  const coachUpdate = coach.inbox.updates.find(update => !update.seen && (applied ?? []).includes(update.id));
  const {
    activePlan, activePlanPrograms, programs, weekLogs, currentWeek, incrementWeek,
    weekLabel, weekStats, programStatuses, nextWorkout, nextTargets,
  } = useWeekOverview();
  // A program the coach set up waits beside the person's own until they switch.
  const offerSwitch = coachUpdate && activePlan?.id !== coachUpdate.planId;
  // The week moves on only when told; a week whose first workout was days
  // ago is asked about once (per week, on this phone).
  const staleKey = `tmv-hafta-sorma-${currentWeek}`;
  const [staleDismissed, setStaleDismissed] = useState(() => {
    try { return localStorage.getItem(staleKey) === '1'; } catch { return false; }
  });
  const staleWeek = staleWeekAge(weekLogs, currentWeek, new Date());
  const keepWeek = () => {
    setStaleDismissed(true);
    try { localStorage.setItem(staleKey, '1'); } catch { /* a per-device nicety only */ }
  };
  // A finished week is announced once; "Sonra" leaves it to the button at the
  // bottom of the page (remembered per week, on this phone).
  const [doneDismissedWeek, setDoneDismissedWeek] = useState(() => {
    try { return Number(localStorage.getItem(WEEK_DONE_KEY) ?? -1); } catch { return -1; }
  });
  const laterNewWeek = () => {
    setDoneDismissedWeek(currentWeek);
    try { localStorage.setItem(WEEK_DONE_KEY, String(currentWeek)); } catch { /* a per-device nicety only */ }
  };
  // The weekly measurement, offered only to someone who measures; "Sonra"
  // leaves it until next calendar week (on this phone).
  const [measureLater, setMeasureLater] = useState(() => {
    try { return localStorage.getItem(MEASURE_LATER_KEY) ?? ''; } catch { return ''; }
  });
  const [measureOpen, setMeasureOpen] = useState(false);
  const today = localDay();
  const measurements = ctx?.state.bodyMeasurements;
  const offerMeasure = measurementDue(measurements, today) && measureLater !== weekStart(today);
  const lastMeasured = measurements?.length ? measurements[measurements.length - 1].date : null;
  const measureAgo = lastMeasured ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastMeasured}T00:00:00Z`)) / 86_400_000) : 0;
  const laterMeasure = () => {
    setMeasureLater(weekStart(today));
    try { localStorage.setItem(MEASURE_LATER_KEY, weekStart(today)); } catch { /* a per-device nicety only */ }
  };
  const now = new Date();
  const weekday = weekdayFormat.format(now);
  const dateLine = `${weekday.charAt(0).toLocaleUpperCase('tr-TR')}${weekday.slice(1)}, ${dayMonthFormat.format(now)}`;

  // Nothing set up yet: the first-run guide builds it.
  if (programs.length === 0) return <Navigate to="/baslangic" replace />;

  const weekDone = weekStats.total > 0 && weekStats.completed === weekStats.total;
  const announceDone = weekDone && doneDismissedWeek !== currentWeek;

  return (
    // On a wide screen the week's numbers sit beside the workout instead of
    // under it, and the page lines up with the header like the others. On a
    // computer screen the whole page is centred in the window and drawn
    // larger: at the top it left the lower half of the screen empty.
    <div className="xl:min-h-[calc(100dvh-3rem)] xl:flex xl:flex-col xl:justify-center xl:pb-6">
    <div className="w-full max-w-xl lg:max-w-5xl xl:max-w-7xl mx-auto px-5 pt-2 pb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:items-start">
      <div>
      {/* Centred on a phone, where the day's name stands alone; on a wide
          screen it lines up with the column beside it. */}
      <div className="text-center lg:text-left">
      <p className="text-[15px] xl:text-[17px] text-(--color-text-secondary)">{dateLine}</p>
      <p className="mt-2 text-[15px] xl:text-[17px] text-(--color-text-secondary)">
        {weekLabel} · {nextWorkout ? (nextWorkout.hasDraft ? 'yarım kalan' : 'sıradaki') : 'hafta bitti'}{activePlan?.coach ? ` · ${possessive(activePlan.coach.split(' ')[0])} planı` : ''}
      </p>
      <h1 className="a-display text-[clamp(56px,22vw,92px)] xl:text-[136px] tracking-[-0.01em] mt-0.5">
        {nextWorkout ? nextWorkout.program.name : weekDone ? 'Tamam' : 'Plan boş'}
      </h1>
      {nextWorkout && (
        <p className="mt-2 text-[15px] xl:text-[18px] text-(--color-text-secondary)">
          {nextTargets.length
            ? `${nextTargets.length} hareket · ${nextWorkout.program.exercises.filter(e => e.isActive).reduce((sum, e) => sum + e.defaultSets, 0)} set`
            : 'İlk antrenman: hareketlerini yaparken ekleyeceksin'}
        </p>
      )}
      </div>
      {/* The coach's note on the workout up next, where the day is planned. */}
      {nextWorkout && dayNotesOn(coach.inbox.comments, nextWorkout.program.id, currentWeek).map(note => (
        <p key={note.id} className="mt-3 a-card px-4 py-3 text-[15px] leading-snug">
          <span className="block text-[13px] text-(--color-text-secondary)">Antrenörün notu · {note.author}</span>
          {note.text}
        </p>
      ))}

      {/* Already applied when it arrived; shown once so nothing changes unannounced. */}
      {coachUpdate && (
        <section className="mt-5 a-card px-4 py-3.5" style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)' }}>
          <p className="text-[18px] font-semibold">{coachUpdate.isNew ? `${coachUpdate.coach} sana bir program kurdu` : `${coachUpdate.coach} programını güncelledi`}</p>
          <ul className="mt-1.5 grid gap-1 text-[15px] leading-snug">{coachUpdate.lines.map(line => <li key={line}>{line}</li>)}</ul>
          <p className="mt-2 text-[13px] leading-snug text-(--color-text-secondary)">
            {offerSwitch
              ? 'Kendi programın olduğu gibi duruyor. Hangisiyle çalışacağını sen seçersin; sonra Programlar → Plan değiştir ile dönebilirsin.'
              : 'Bu haftadan geçerli; önceki haftaların kayıtları değişmedi.'}
          </p>
          <div className={`mt-3 flex gap-2 ${offerSwitch ? 'flex-col' : ''}`}>
            {offerSwitch ? (
              <>
                <button onClick={() => coach.switchToPlan(coachUpdate.id)} className="flex-1 h-12 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">Bu programa geç</button>
                <button onClick={() => coach.markSeen(coachUpdate.id)} className="h-12 rounded-2xl bg-(--color-bg-input) text-[16px] font-medium">Kendi programımda kal</button>
              </>
            ) : (
              <>
                <button onClick={() => coach.markSeen(coachUpdate.id)} className="flex-1 h-12 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">Tamam</button>
                <Link to="/programs" onClick={() => coach.markSeen(coachUpdate.id)} className="h-12 px-4 rounded-2xl bg-(--color-bg-input) text-[16px] font-medium flex items-center">Programa bak</Link>
              </>
            )}
          </div>
        </section>
      )}

      {staleWeek !== null && !weekDone && !staleDismissed && (
        <section className="mt-5 a-card px-4 py-3.5" style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)' }}>
          <p className="text-[18px] font-semibold">Yeni hafta başladı mı?</p>
          <p className="mt-1 text-[15px] leading-snug text-(--color-text-secondary)">
            Bu haftanın ilk antrenmanı {staleWeek} gün önceydi. Yeni haftaya geçmezsen bu haftanın kayıtlarının üstüne yazarsın.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setConfirmNewWeek(true)} className="flex-1 h-12 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">Yeni haftaya geç</button>
            <button onClick={keepWeek} className="h-12 px-4 rounded-2xl bg-(--color-bg-input) text-[16px] font-medium">Aynı hafta</button>
          </div>
        </section>
      )}

      {/* Every day of the week is in: said straight away, but the week moves on
          only when the person says so. */}
      {announceDone && (
        <section className="mt-5 a-card px-4 py-3.5" style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)' }}>
          <p className="text-[18px] font-semibold">Bu haftanın antrenmanları bitti</p>
          <p className="mt-1 text-[15px] leading-snug text-(--color-text-secondary)">
            {weekStats.total} günün hepsi kaydedildi. Sıradaki antrenman yeni haftada; hazır olduğunda geç.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setConfirmNewWeek(true)} className="flex-1 h-12 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[16px] font-semibold">Yeni haftaya geç</button>
            <button onClick={laterNewWeek} className="h-12 px-4 rounded-2xl bg-(--color-bg-input) text-[16px] font-medium">Sonra</button>
          </div>
        </section>
      )}

      <div className="mt-5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, programStatuses.length)}, minmax(0, 1fr))` }}>
        {programStatuses.map(day => <DayTile key={day.program.id} day={day} isNext={day === nextWorkout} week={currentWeek} />)}
      </div>
      <p className="mt-1.5 xl:mt-2.5 text-[12px] xl:text-[14px] text-(--color-text-secondary)">Yeşil rakam: geçen haftayı geçtiğin hareket sayısı</p>


      </div>

      {/* On a wide screen what the next workout has to beat sits beside the
          week, and the week's own button goes under the week so neither column
          is left half empty. On a phone the order is the same as before. */}
      <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:pt-2 lg:[&>*:first-child]:mt-0">
      {nextWorkout ? (
        <>
          {nextTargets.length > 0 && (
            <div className="mt-5">
              <div className="flex justify-between pb-1.5 border-b border-(--color-border) text-[13px] xl:text-[15px] text-(--color-text-secondary)">
                <span>Hareket</span><span>geçmen gereken</span>
              </div>
              <ul>
                {nextTargets.map(target => (
                  <li key={target.id} className="flex items-baseline justify-between gap-3 py-2 xl:py-3 border-b border-(--color-bg-card) last:border-b-0">
                    <span className="text-[16px] xl:text-[19px] truncate">{target.name}</span>
                    <span className="lb-figure shrink-0 text-[22px] xl:text-[28px] font-semibold">{target.text ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link to={`/workout/${nextWorkout.program.id}/week/${currentWeek}`}
            className="mt-4 xl:mt-6 flex items-center justify-center h-16 xl:h-20 rounded-[18px] xl:rounded-[22px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] xl:text-[22px] font-semibold">
            {nextWorkout.hasDraft ? 'Devam et' : 'Başla'}
          </Link>
        </>
      ) : activePlanPrograms.length ? null : (
        <Link to="/programs" className="mt-6 flex items-center justify-center h-14 rounded-[16px] bg-(--color-bg-card) text-[16px] font-medium">Programlar</Link>
      )}
      </div>

      <div className="lg:col-start-1 lg:row-start-2">
      {/* Under Başla on a phone, under the week on a wide screen: the reminder
          never pushes the workout down. */}
      {offerMeasure && (
        <section className="mt-5 a-card px-4 py-3.5">
          <p className="text-[16px] font-semibold">Haftalık ölçü</p>
          <p className="mt-0.5 text-[15px] leading-snug text-(--color-text-secondary)">Son ölçün {measureAgo} gün önceydi. Kilonu gir, Grafikler → Vücut'ta seyrini gör.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setMeasureOpen(true)} className="flex-1 h-11 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[15px] font-semibold">Ölçü gir</button>
            <button onClick={laterMeasure} className="h-11 px-4 rounded-2xl bg-(--color-bg-input) text-[15px] font-medium">Sonra</button>
          </div>
        </section>
      )}
      {measureOpen && <MeasurementSheet isOpen onClose={() => setMeasureOpen(false)} />}
      {!announceDone && (
        <button onClick={() => setConfirmNewWeek(true)} className="a-btn-line mt-8 w-full h-14 xl:h-16 rounded-[16px] xl:rounded-[18px] text-[16px] xl:text-[18px]">
          Yeni haftaya geç
        </button>
      )}

      <p className="mt-8 text-[13px] text-(--color-text-secondary)">
        <a href={`${import.meta.env.BASE_URL}privacy.html`} className="inline-flex min-h-11 items-center underline">Gizlilik Politikası</a>
      </p>
      </div>

      {/* The week only moves forward in the app, so a stray tap needs a stop. */}
      <Modal isOpen={confirmNewWeek} onClose={() => setConfirmNewWeek(false)}
        onConfirm={() => { setConfirmNewWeek(false); incrementWeek(); }}
        title="Yeni haftaya geçilsin mi?"
        message={`Bu hafta ${weekStats.completed}/${weekStats.total} antrenman kaydedildi. Geçtikten sonra haftayı uygulamadan geri alamazsın.`}
        confirmText="Yeni haftaya geç" />
    </div>
    </div>
  );
}
