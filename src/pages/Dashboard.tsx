import { Link } from 'react-router-dom';
import { useContext, useMemo, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { usePrograms } from '@/hooks/usePrograms';
import { usePlans } from '@/hooks/usePlans';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useExportImport } from '@/hooks/useExportImport';
import { PageContainer } from '@/components/layout/PageContainer';
import { calculateWeeklyVolume } from '@/utils/volumeCalculator';
import { samplePrograms } from '@/data/sampleProgram';

const nf = new Intl.NumberFormat('tr-TR');

export function Dashboard() {
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const { activePlan, activePlanPrograms } = usePlans();
  const { weekLogs, currentWeek, incrementWeek } = useWeekLogs();
  const ctx = useContext(AppContext);
  const phase = ctx?.state.phases.find(p => currentWeek >= p.startWeek && (p.endWeek === null || currentWeek <= p.endWeek));
  const weekLabel = `${phase?.name ?? ''} · H${currentWeek - (phase?.startWeek ?? 0)}`;
  const { backupMeta, handleWeekTransitionBackup } = useExportImport();
  const { programs, addProgram } = usePrograms();

  const handleIncrementWeek = () => {
    handleWeekTransitionBackup(currentWeek);
    incrementWeek();
  };

  const activeProgramIds = useMemo(
    () => activePlanPrograms.map(p => p.id),
    [activePlanPrograms]
  );

  const volumeForWeek = useMemo(() => {
    return (week: number) =>
      weekLogs
        .filter(w => w.weekNumber === week && activeProgramIds.includes(w.programId))
        .reduce((sum, log) => sum + calculateWeeklyVolume(log), 0);
  }, [weekLogs, activeProgramIds]);

  const weekStats = useMemo(() => {
    const thisWeekLogs = weekLogs.filter(
      w => w.weekNumber === currentWeek && activeProgramIds.includes(w.programId)
    );
    const completed = thisWeekLogs.filter(w => !w.isHoliday && w.exercises.length > 0).length;
    const volume = volumeForWeek(currentWeek);
    const lastVolume = currentWeek > 0 ? volumeForWeek(currentWeek - 1) : 0;
    return {
      completed,
      total: activePlanPrograms.length,
      volume,
      // Only a real comparison counts — no delta against a week with no data.
      delta: lastVolume > 0 ? volume - lastVolume : null,
    };
  }, [weekLogs, currentWeek, activeProgramIds, activePlanPrograms.length, volumeForWeek]);

  // Consecutive weeks before this one with at least one logged workout
  const streak = useMemo(() => {
    let count = 0;
    for (let w = currentWeek - 1; w >= 0; w--) {
      const hasWorkout = weekLogs.some(
        log => log.weekNumber === w && !log.isHoliday && log.exercises.length > 0
      );
      if (hasWorkout) count++;
      else break;
    }
    return count;
  }, [weekLogs, currentWeek]);

  const programStatuses = useMemo(() => {
    return activePlanPrograms.map(program => {
      const log = weekLogs.find(w => w.programId === program.id && w.weekNumber === currentWeek);
      const status: 'done' | 'holiday' | 'pending' = log?.isHoliday
        ? 'holiday'
        : log && log.exercises.length > 0
          ? 'done'
          : 'pending';
      let hasDraft = false;
      try {
        const raw = localStorage.getItem(`draft-${program.id}-${currentWeek}`);
        const draft = raw ? JSON.parse(raw) : null;
        hasDraft = Array.isArray(draft?.exerciseLogs) && (!log?.updatedAt || !draft.savedAt || draft.savedAt >= log.updatedAt);
      } catch { /* Ignore an unreadable draft. */ }
      return { program, status, hasDraft, volume: log ? calculateWeeklyVolume(log) : 0 };
    });
  }, [activePlanPrograms, weekLogs, currentWeek]);

  if (programs.length === 0) {
    return (
      <PageContainer>
        <div className="logbook max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Henüz bir programın yok</h1>
          <p className="lb-label mb-6">
            Kendi programını kur ya da hazır setle başla, ilk haftanı hemen kaydet.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/programs/edit"
              className="lb-press px-5 py-3 rounded-lg bg-(--color-text-primary) text-(--color-bg-primary) text-sm font-semibold text-center"
            >
              Program oluştur
            </Link>
            <button
              onClick={() => samplePrograms.forEach(p => addProgram(p))}
              className="lb-press px-5 py-3 rounded-lg border lb-rule text-sm font-semibold"
            >
              Örnek programları yükle
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  const nextWorkout = programStatuses.find(p => p.hasDraft) ?? programStatuses.find(p => p.status === 'pending');

  return (
    <PageContainer>
      <div className="logbook">
        {/* ── Masthead: the week, and the number the week is judged by ── */}
        <header className="lb-settle flex items-start justify-between gap-4 pb-5 border-b lb-rule-strong">
          <div className="min-w-0">
            {/* The page's heading is the week; it just isn't the loudest thing
                on screen — the number it produced is. */}
            <h1 className="lb-label">
              {activePlan ? activePlan.name : 'Antrenman defteri'} · {weekLabel}
            </h1>

            <p className="lb-figure text-2xl font-semibold mt-2">
              {weekStats.volume > 0 ? nf.format(Math.round(weekStats.volume)) : '—'}
              {weekStats.volume > 0 && (
                <span className="text-[0.3em] font-medium ml-2 text-(--color-text-secondary)">kg</span>
              )}
            </p>

            <p className="lb-label mt-2">Bu haftanın toplam hacmi{weekStats.completed < weekStats.total ? ' · hafta devam ediyor' : ''}</p>
          </div>

          <button
            onClick={handleIncrementWeek}
            className="lb-press shrink-0 px-4 py-2.5 rounded-lg border lb-rule text-sm font-semibold"
          >
            Yeni hafta
          </button>
        </header>

        <section className="my-6 p-5 sm:p-7 rounded-2xl border lb-rule-strong bg-(--color-bg-card)">
          <p className="lb-label mb-2">{nextWorkout?.hasDraft ? 'Yarım kalan antrenmanın' : 'Sıradaki antrenmanın'}</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">{nextWorkout?.program.name ?? (activePlanPrograms.length ? 'Bu haftayı tamamladın' : 'Planına bir gün ekle')}</h2>
          <p className="text-sm text-(--color-text-secondary) mt-3 mb-5">
            {nextWorkout ? `${nextWorkout.program.exercises.filter(e => e.isActive).length} egzersiz · ${weekLabel}` : 'Aşağıdaki günleri açarak kayıtlarını düzenleyebilir veya Programlar bölümünden gün ekleyebilirsin.'}
          </p>
          <div className="flex flex-wrap gap-3">
            {nextWorkout && <Link className="lb-press px-5 py-3 rounded-lg bg-(--color-text-primary) text-(--color-bg-primary) font-semibold text-sm" to={`/workout/${nextWorkout.program.id}/week/${currentWeek}`}>
              {nextWorkout.hasDraft ? 'Antrenmana devam et' : 'Antrenmana başla'} →
            </Link>}
            {activePlanPrograms.length > 0 && <button type="button" aria-expanded={showWorkoutPicker} aria-controls="workout-picker" onClick={() => setShowWorkoutPicker(value => !value)} className="lb-press px-5 py-3 rounded-lg border lb-rule text-sm font-medium">Başka bir antrenman seç ↓</button>}
            {!activePlanPrograms.length && <Link to="/programs" className="lb-press px-5 py-3 rounded-lg border lb-rule text-sm">Programlar →</Link>}
          </div>
          {showWorkoutPicker && <div id="workout-picker" className="mt-4 p-4 border lb-rule rounded-lg">
            <p className="lb-label mb-3">Bu hafta hangi antrenmanı açmak istiyorsun?</p>
            <div className="flex flex-wrap gap-2">
              {programStatuses.map(({ program, status, hasDraft }) => <Link key={program.id} to={`/workout/${program.id}/week/${currentWeek}`} className="lb-press px-4 py-3 border lb-rule rounded-lg text-sm">
                <span className="font-semibold">{program.name}</span>
                <span className="lb-label block mt-1">{hasDraft ? 'Taslağa devam et' : status === 'done' ? 'Kaydı düzenle' : status === 'holiday' ? 'Tatil kaydını aç' : 'Antrenman gir'}</span>
              </Link>)}
            </div>
          </div>}
        </section>

        {backupMeta.pendingBackupWeek !== null && (
          <p className="lb-settle mt-5 text-sm border-l-2 pl-3 py-1 border-(--lb-drop) text-(--color-text-secondary)">
            H{backupMeta.pendingBackupWeek} tamamlandı. Veriyi korumak için Dışa / İçe Aktarma sayfasından yedek al.
          </p>
        )}

        {/* ── Secondary figures: quiet, in a row, no boxes ── */}
        <div className="lb-settle flex gap-8 py-5 border-b lb-rule" style={{ animationDelay: '40ms' }}>
          <div>
            <p className="lb-figure text-2xl font-semibold">
              {weekStats.completed}<span className="text-(--color-text-secondary)">/{weekStats.total}</span>
            </p>
            <p className="lb-label mt-1">antrenman</p>
          </div>
          <div>
            <p className="lb-figure text-2xl font-semibold">{streak}</p>
            <p className="lb-label mt-1">hafta üst üste</p>
          </div>
        </div>
        {weekStats.total > 0 && weekStats.completed === weekStats.total && weekStats.delta !== null && (
          <p className="lb-label mt-3">Geçen haftaya göre toplam hacim: {weekStats.delta > 0 ? '+' : ''}{nf.format(Math.round(weekStats.delta))} kg</p>
        )}

        {/* ── The week's workouts, as ruled rows ── */}
        <div id="week-workouts" className="scroll-mt-20 flex items-baseline justify-between pt-6 pb-2">
          <h2 className="text-sm font-semibold">Bu haftanın antrenmanları</h2>
          <Link to="/history" className="lb-label hover:text-(--color-text-primary) transition-colors">
            Geçmiş →
          </Link>
        </div>

        <ul>
          {programStatuses.map(({ program, status, hasDraft, volume }, i) => (
            <li key={program.id} className="lb-settle" style={{ animationDelay: `${80 + i * 45}ms` }}>
              <Link
                to={`/workout/${program.id}/week/${currentWeek}`}
                className="lb-press flex items-center gap-3 py-4 border-b lb-rule -mx-2 px-2 rounded"
              >
                {/* Status lives in the left margin, like a tick in a logbook */}
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      status === 'done'
                        ? 'var(--lb-gain)'
                        : status === 'holiday'
                          ? 'var(--color-text-secondary)'
                          : 'transparent',
                    boxShadow: status === 'pending' ? 'inset 0 0 0 1px var(--lb-rule-strong)' : undefined,
                  }}
                />

                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{program.name}</span>
                  <span className="lb-label block mt-0.5">
                    {hasDraft ? 'taslak · devam et' : status === 'holiday'
                      ? 'tatil'
                      : status === 'done'
                        ? `${program.exercises.filter(e => e.isActive).length} egzersiz · kaydedildi`
                        : `${program.exercises.filter(e => e.isActive).length} egzersiz`}
                  </span>
                </span>

                <span className="lb-figure text-sm text-right shrink-0 text-(--color-text-secondary)">
                  {volume > 0 ? `${nf.format(Math.round(volume))} kg` : 'Aç →'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-(--color-text-secondary)">
          <a href={`${import.meta.env.BASE_URL}privacy.html`} className="underline hover:text-(--color-text-primary)">
            Gizlilik Politikası
          </a>
        </p>
      </div>
    </PageContainer>
  );
}
