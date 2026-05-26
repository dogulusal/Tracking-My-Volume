import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { usePrograms } from '@/hooks/usePrograms';
import { usePlans } from '@/hooks/usePlans';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useExportImport } from '@/hooks/useExportImport';
import { PageContainer } from '@/components/layout/PageContainer';
import { calculateWeeklyVolume } from '@/utils/volumeCalculator';
import { samplePrograms } from '@/data/sampleProgram';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-(--color-bg-card) rounded-xl p-5 border border-(--color-border) flex flex-col gap-1 neon-card">
      <p className="text-(--color-text-muted) text-xs font-semibold uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-black text-(--color-accent) neon-glow">{value}</p>
      {sub && <p className="text-(--color-text-secondary) text-xs font-medium">{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const { activePlan, activePlanPrograms } = usePlans();
  const { weekLogs, currentWeek, incrementWeek } = useWeekLogs();
  const { backupMeta, handleWeekTransitionBackup } = useExportImport();
  const { programs, addProgram } = usePrograms();

  const handleIncrementWeek = () => {
    handleWeekTransitionBackup(currentWeek);
    incrementWeek();
  };

  // Stats for current week
  const weekStats = useMemo(() => {
    const activeProgramIds = activePlanPrograms.map(p => p.id);
    const thisWeekLogs = weekLogs.filter(
      w => w.weekNumber === currentWeek && activeProgramIds.includes(w.programId)
    );
    const completed = thisWeekLogs.filter(w => !w.isHoliday && w.exercises.length > 0).length;
    const total = activePlanPrograms.length;
    const volume = thisWeekLogs.reduce((sum, log) => sum + calculateWeeklyVolume(log), 0);
    return { completed, total, volume };
  }, [weekLogs, currentWeek, activePlanPrograms]);

  // Streak: consecutive weeks (going back from currentWeek-1) with at least 1 non-holiday log
  const streak = useMemo(() => {
    let count = 0;
    for (let w = currentWeek - 1; w >= 0; w--) {
      const hasWorkout = weekLogs.some(log => log.weekNumber === w && !log.isHoliday && log.exercises.length > 0);
      if (hasWorkout) count++;
      else break;
    }
    return count;
  }, [weekLogs, currentWeek]);

  // Program status for current week (for the strip)
  const programStatuses = useMemo(() => {
    return activePlanPrograms.map(program => {
      const log = weekLogs.find(w => w.programId === program.id && w.weekNumber === currentWeek);
      const status: 'done' | 'holiday' | 'pending' = log?.isHoliday
        ? 'holiday'
        : log && log.exercises.length > 0
          ? 'done'
          : 'pending';
      return { program, status };
    });
  }, [activePlanPrograms, weekLogs, currentWeek]);

  if (programs.length === 0) {
    return (
      <PageContainer>
        <div className="bg-(--color-bg-card) rounded-xl p-8 text-center border border-(--color-border)">
          <p className="text-(--color-text-muted) mb-4">Henüz program eklenmemiş.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/programs/edit"
              className="inline-block px-5 py-2.5 bg-(--color-accent) hover:bg-(--color-accent-hover) text-white text-sm font-bold rounded-lg transition-colors"
            >
              Program Oluştur
            </Link>
            <button
              onClick={() => samplePrograms.forEach(p => addProgram(p))}
              className="px-5 py-2.5 bg-(--color-btn-bg) hover:bg-(--color-btn-hover) text-(--color-text-primary) text-sm font-bold rounded-lg transition-colors"
            >
              Örnek Programları Yükle
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Decorative banner */}
      <div className="relative mb-8 rounded-xl overflow-hidden border border-(--color-border) neon-card">
        <div className="absolute inset-0 bg-gradient-to-br from-(--color-accent-glow) via-transparent to-transparent" />
        <div className="relative px-5 py-6 sm:px-6 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight neon-glow">Hafta {currentWeek}</h1>
            <p className="text-(--color-text-secondary) text-sm mt-1">Antrenman takibine devam et</p>
          </div>
          <button
            onClick={handleIncrementWeek}
            className="w-full sm:w-auto px-5 py-2.5 bg-(--color-accent) hover:bg-(--color-accent-hover) text-white text-sm font-bold rounded-lg btn-neon transition-all hover:scale-105"
          >
            + Yeni Hafta
          </button>
        </div>
      </div>

      {backupMeta.pendingBackupWeek !== null && (
        <div className="mb-6 rounded-xl border border-amber-500/60 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            H{backupMeta.pendingBackupWeek} tamamlandı. Veriyi korumak için Dışa / İçe Aktarma sayfasından hızlı yedek alman önerilir.
          </p>
        </div>
      )}

      {/* Plan name */}
      {activePlan && (
        <p className="text-(--color-text-muted) text-xs font-semibold uppercase tracking-widest mb-1">
          {activePlan.name}
        </p>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Bu Hafta"
          value={`${weekStats.completed} / ${weekStats.total}`}
          sub="antrenman tamamlandı"
        />
        <StatCard
          label="Toplam Hacim"
          value={weekStats.volume > 0 ? `${Math.round(weekStats.volume).toLocaleString('tr-TR')} kg` : '—'}
          sub="bu haftaki toplam kg×rep"
        />
        <StatCard
          label="Streak"
          value={streak}
          sub="hafta üst üste"
        />
      </div>

      {/* Weekly workout strip */}
      <div className="bg-(--color-bg-card) rounded-xl p-5 border border-(--color-border) neon-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-(--color-text-muted) uppercase tracking-widest">
            Hafta {currentWeek} — Antrenmanlar
          </h2>
          <Link
            to="/history"
            className="text-xs font-semibold text-(--color-accent) hover:underline"
          >
            Geçmişe git →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {programStatuses.map(({ program, status }) => (
            <Link
              key={program.id}
              to={`/workout/${program.id}/week/${currentWeek}`}
              className={`rounded-xl p-4 border transition-all hover:scale-105 group ${
                status === 'done'
                  ? 'bg-(--color-status-improved)/10 border-(--color-status-improved)/40'
                  : status === 'holiday'
                    ? 'bg-(--color-status-holiday)/10 border-(--color-status-holiday)/40'
                    : 'bg-(--color-bg-input) border-(--color-border) hover:border-(--color-accent)/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  status === 'done'
                    ? 'bg-(--color-status-improved)'
                    : status === 'holiday'
                      ? 'bg-(--color-status-holiday)'
                      : 'bg-(--color-text-muted)/40'
                }`} />
                <span className="text-xs text-(--color-text-muted) font-medium">
                  {status === 'done' ? 'Tamamlandı' : status === 'holiday' ? 'Tatil' : 'Bekliyor'}
                </span>
              </div>
              <p className="font-extrabold text-sm group-hover:text-(--color-accent) transition-colors">
                {program.name}
              </p>
              <p className="text-xs text-(--color-text-muted) mt-0.5">
                {program.exercises.filter(e => e.isActive).length} egzersiz
              </p>
            </Link>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
