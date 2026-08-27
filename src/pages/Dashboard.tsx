import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { usePrograms } from '@/hooks/usePrograms';
import { usePlans } from '@/hooks/usePlans';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useExportImport } from '@/hooks/useExportImport';
import { PageContainer } from '@/components/layout/PageContainer';
import { calculateWeeklyVolume } from '@/utils/volumeCalculator';
import { samplePrograms } from '@/data/sampleProgram';

const nf = new Intl.NumberFormat('tr-TR');

export function Dashboard() {
  const { activePlan, activePlanPrograms } = usePlans();
  const { weekLogs, currentWeek, incrementWeek } = useWeekLogs();
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
      return { program, status, volume: log ? calculateWeeklyVolume(log) : 0 };
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

  const deltaUp = weekStats.delta !== null && weekStats.delta > 0;
  const deltaDown = weekStats.delta !== null && weekStats.delta < 0;

  return (
    <PageContainer>
      <div className="logbook">
        {/* ── Masthead: the week, and the number the week is judged by ── */}
        <header className="lb-settle flex items-start justify-between gap-4 pb-5 border-b lb-rule-strong">
          <div className="min-w-0">
            {/* The page's heading is the week; it just isn't the loudest thing
                on screen — the number it produced is. */}
            <h1 className="lb-label">
              {activePlan ? activePlan.name : 'Antrenman defteri'} · Hafta {currentWeek}
            </h1>

            <p className="lb-figure text-[clamp(2.75rem,13vw,4.5rem)] font-bold mt-2">
              {weekStats.volume > 0 ? nf.format(Math.round(weekStats.volume)) : '—'}
              {weekStats.volume > 0 && (
                <span className="text-[0.3em] font-medium ml-2 text-(--color-text-secondary)">kg</span>
              )}
            </p>

            <p className="text-sm mt-2.5">
              {weekStats.delta === null ? (
                <span className="text-(--color-text-secondary)">
                  {weekStats.volume > 0 ? 'karşılaştırılacak önceki hafta yok' : 'bu hafta henüz kayıt yok'}
                </span>
              ) : (
                <>
                  <span
                    className="lb-figure font-semibold"
                    style={{ color: deltaUp ? 'var(--lb-gain)' : deltaDown ? 'var(--lb-drop)' : undefined }}
                  >
                    {deltaUp ? '▲' : deltaDown ? '▼' : '='} {nf.format(Math.abs(Math.round(weekStats.delta)))} kg
                  </span>
                  <span className="text-(--color-text-secondary)"> · geçen haftaya göre</span>
                </>
              )}
            </p>
          </div>

          <button
            onClick={handleIncrementWeek}
            className="lb-press shrink-0 px-4 py-2.5 rounded-lg border lb-rule text-sm font-semibold"
          >
            Yeni hafta
          </button>
        </header>

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

        {/* ── The week's workouts, as ruled rows ── */}
        <div className="flex items-baseline justify-between pt-6 pb-2">
          <h2 className="text-sm font-semibold">Bu haftanın antrenmanları</h2>
          <Link to="/history" className="lb-label hover:text-(--color-text-primary) transition-colors">
            Geçmiş →
          </Link>
        </div>

        <ul>
          {programStatuses.map(({ program, status, volume }, i) => (
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
                    {status === 'holiday'
                      ? 'tatil'
                      : status === 'done'
                        ? `${program.exercises.filter(e => e.isActive).length} egzersiz · kaydedildi`
                        : `${program.exercises.filter(e => e.isActive).length} egzersiz`}
                  </span>
                </span>

                <span className="lb-figure text-sm text-right shrink-0 text-(--color-text-secondary)">
                  {volume > 0 ? `${nf.format(Math.round(volume))} kg` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PageContainer>
  );
}
