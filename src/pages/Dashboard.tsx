import { Link, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useWeekOverview, type WeekDay } from '@/hooks/useWeekOverview';
import { Modal } from '@/components/shared/Modal';
import { formatSet } from '@/utils/formatters';
import { STALL_WEEKS } from '@/utils/progression';

const nf = new Intl.NumberFormat('tr-TR');
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
      className="min-h-14 rounded-[14px] px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center">
      <span className={`text-[12px] leading-tight truncate max-w-full ${isNext ? 'font-semibold' : 'text-(--color-text-secondary)'}`}>{day.program.name}</span>
      {day.status === 'done' && compared > 0 && compared === first ? (
        // Nothing to compare yet: a first record is not 0 out of N.
        <span className="text-[12px]">ilk kayıt</span>
      ) : day.status === 'done' && compared > 0 ? (
        <span className="lb-figure text-[18px] font-semibold leading-none" style={{ color: improved > 0 ? 'var(--lb-gain)' : undefined }}>
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
  const [showAllStalled, setShowAllStalled] = useState(false);
  const {
    activePlanPrograms, programs, currentWeek, incrementWeek,
    phase, displayWeek, weekStats, streak, programStatuses, stalled, nextWorkout, nextTargets,
  } = useWeekOverview();
  const now = new Date();
  const weekday = weekdayFormat.format(now);
  const dateLine = `${weekday.charAt(0).toLocaleUpperCase('tr-TR')}${weekday.slice(1)}, ${dayMonthFormat.format(now)}`;

  // Nothing set up yet: the first-run guide builds it.
  if (programs.length === 0) return <Navigate to="/baslangic" replace />;

  const weekDone = weekStats.total > 0 && weekStats.completed === weekStats.total;

  return (
    <div className="max-w-xl mx-auto px-5 pt-2 pb-8">
      <p className="text-[15px] text-(--color-text-secondary)">{dateLine}</p>
      <p className="mt-2 text-[15px] text-(--color-text-secondary)">
        {phase?.name} · Hafta {displayWeek} · {nextWorkout ? (nextWorkout.hasDraft ? 'yarım kalan' : 'sıradaki') : 'hafta bitti'}
      </p>
      <h1 className="a-display text-[clamp(56px,22vw,92px)] tracking-[-0.01em] mt-0.5">
        {nextWorkout ? nextWorkout.program.name : weekDone ? 'Tamam' : 'Plan boş'}
      </h1>
      {nextWorkout && (
        <p className="mt-2 text-[15px] text-(--color-text-secondary)">
          {nextTargets.length
            ? `${nextTargets.length} hareket · ${nextWorkout.program.exercises.filter(e => e.isActive).reduce((sum, e) => sum + e.defaultSets, 0)} set`
            : 'İlk antrenman: hareketlerini yaparken ekleyeceksin'}
        </p>
      )}

      <div className="mt-5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, programStatuses.length)}, minmax(0, 1fr))` }}>
        {programStatuses.map(day => <DayTile key={day.program.id} day={day} isNext={day === nextWorkout} week={currentWeek} />)}
      </div>
      <p className="mt-1.5 text-[12px] text-(--color-text-secondary)">Yeşil rakam: geçen haftayı geçtiğin hareket sayısı</p>

      {nextWorkout ? (
        <>
          {nextTargets.length > 0 && (
            <div className="mt-5">
              <div className="flex justify-between pb-1.5 border-b border-(--color-border) text-[13px] text-(--color-text-secondary)">
                <span>Hareket</span><span>geçmen gereken</span>
              </div>
              <ul>
                {nextTargets.map(target => (
                  <li key={target.id} className="flex items-baseline justify-between gap-3 py-2 border-b border-(--color-bg-card) last:border-b-0">
                    <span className="text-[16px] truncate">{target.name}</span>
                    <span className="lb-figure shrink-0 text-[22px] font-semibold">{target.text ?? '—'}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[12px] text-(--color-text-secondary)">75 x 7 +1: 75 kg, 7 tekrar, 1 tekrar daha yapabilirdin · F: tükendin</p>
            </div>
          )}
          <Link to={`/workout/${nextWorkout.program.id}/week/${currentWeek}`}
            className="mt-4 flex items-center justify-center h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">
            {nextWorkout.hasDraft ? 'Devam et' : 'Başla'}
          </Link>
        </>
      ) : activePlanPrograms.length ? (
        <button onClick={() => setConfirmNewWeek(true)}
          className="mt-6 w-full h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">Yeni haftaya geç</button>
      ) : (
        <Link to="/programs" className="mt-6 flex items-center justify-center h-14 rounded-[16px] bg-(--color-bg-card) text-[16px] font-medium">Programlar</Link>
      )}

      <div className="mt-8 grid grid-cols-2 gap-2">
        <div className="a-card px-4 py-3">
          <p className="lb-figure text-[30px] font-bold leading-none">{weekStats.volume > 0 ? nf.format(Math.round(weekStats.volume)) : '—'}{weekStats.volume > 0 && <span className="text-[16px] font-semibold text-(--color-text-secondary)"> kg</span>}</p>
          <p className="mt-1 text-[13px] text-(--color-text-secondary)">bu haftanın hacmi</p>
        </div>
        <div className="a-card px-4 py-3">
          <p className="lb-figure text-[30px] font-bold leading-none">{streak}<span className="text-[16px] font-semibold text-(--color-text-secondary)"> hafta</span></p>
          <p className="mt-1 text-[13px] text-(--color-text-secondary)">üst üste antrenman</p>
        </div>
      </div>
      {weekDone && weekStats.delta !== null && (
        <p className="mt-2 text-[13px] text-(--color-text-secondary)">Geçen haftaya göre toplam hacim: {weekStats.delta > 0 ? '+' : ''}{nf.format(Math.round(weekStats.delta))} kg</p>
      )}

      {stalled.length > 0 && (
        <section className="mt-8">
          <h2 className="a-display text-[28px]">Yerinde sayanlar</h2>
          <p className="mt-1 text-[13px] text-(--color-text-secondary)">En iyi set {STALL_WEEKS} haftadan uzun süredir aşılmadı.</p>
          <ul className="mt-2">
            {(showAllStalled ? stalled : stalled.slice(0, 5)).map(({ key, name, stall }) => (
              <li key={key} className="flex items-baseline gap-3 py-2.5 border-b border-(--color-bg-card)">
                <span className="flex-1 min-w-0 text-[16px] truncate">{name}</span>
                <span className="lb-figure text-[18px] text-(--color-text-secondary)">{formatSet(stall.best)}</span>
                <span className="lb-figure w-14 text-right text-[18px] font-semibold">{stall.weeks} hf</span>
              </li>
            ))}
          </ul>
          {stalled.length > 5 && (
            <button onClick={() => setShowAllStalled(value => !value)} className="mt-1 h-11 text-[15px] text-(--color-text-secondary)">
              {showAllStalled ? 'Daha az göster' : `Tümünü göster (${stalled.length})`}
            </button>
          )}
        </section>
      )}

      {!weekDone && (
        <button onClick={() => setConfirmNewWeek(true)} className="mt-8 w-full h-14 rounded-[16px] bg-(--color-bg-card) text-[16px] font-medium">
          Yeni haftaya geç
        </button>
      )}

      <p className="mt-8 text-[13px] text-(--color-text-secondary)">
        <a href={`${import.meta.env.BASE_URL}privacy.html`} className="underline">Gizlilik Politikası</a>
      </p>

      {/* The week only moves forward in the app, so a stray tap needs a stop. */}
      <Modal isOpen={confirmNewWeek} onClose={() => setConfirmNewWeek(false)}
        onConfirm={() => { setConfirmNewWeek(false); incrementWeek(); }}
        title="Yeni haftaya geçilsin mi?"
        message={`Bu hafta ${weekStats.completed}/${weekStats.total} antrenman kaydedildi. Geçtikten sonra haftayı uygulamadan geri alamazsın.`}
        confirmText="Yeni haftaya geç" />
    </div>
  );
}
