import { programsForPhase } from '@/utils/programVersions';
import { PhaseSettingsModal } from '@/components/shared/PhaseSettingsModal';
import { useState, useMemo, useContext, useEffect } from 'react';
import { usePrograms } from '@/hooks/usePrograms';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { PageContainer } from '@/components/layout/PageContainer';
import { getHeaviestSet } from '@/utils/volumeCalculator';
import { calculateExerciseStatus } from '@/utils/statusCalculator';
import { AppContext } from '@/context/AppContext';
import type { ExerciseStatus, WeekLog, PhaseDefinition } from '@/types';

const COLOR_UP = '#10b981';
const COLOR_SAME = '#6b7280';
const COLOR_DOWN = '#f43f5e';
const COLOR_EMPTY = '#1f2937';

type ChartViewMode = 'tabs' | 'side-by-side' | 'stacked';
type DataViewMode = 'bars' | 'dots';

function colorByStatus(status: ExerciseStatus | 'empty'): string {
  if (status === 'improved') return COLOR_UP;
  if (status === 'decreased') return COLOR_DOWN;
  if (status === 'empty') return COLOR_EMPTY;
  return COLOR_SAME;
}

function bgByStatus(status: ExerciseStatus | 'empty'): string {
  if (status === 'improved') return 'rgba(16,185,129,0.15)';
  if (status === 'decreased') return 'rgba(244,63,94,0.15)';
  if (status === 'empty') return 'rgba(31,41,55,0.3)';
  return 'rgba(107,114,128,0.15)';
}

type DataPoint = {
  week: string;
  displayWeek: number;
  weight: number | null;
  reps: number | null;
  status: ExerciseStatus | 'empty';
};

function buildPhaseData(
  logs: WeekLog[],
  selectedExerciseId: string,
  phase: PhaseDefinition
): DataPoint[] {
  const startWeek = phase.startWeek;
  const endWeek = phase.endWeek ?? Math.max(startWeek, ...logs.map(l => l.weekNumber));
  const points: DataPoint[] = [];

  for (let w = startWeek; w <= endWeek; w++) {
    const log = logs.find(l => l.weekNumber === w);
    if (!log || log.isHoliday) {
      points.push({ week: `H${w - startWeek}`, displayWeek: w - startWeek, weight: null, reps: null, status: 'empty' });
      continue;
    }
    const exercise = log.exercises.find(e => e.exerciseId === selectedExerciseId);
    if (!exercise) {
      points.push({ week: `H${w - startWeek}`, displayWeek: w - startWeek, weight: null, reps: null, status: 'empty' });
      continue;
    }
    const prevLog = logs.find(l => l.weekNumber === w - 1);
    const prevExercise = prevLog?.exercises.find(e => e.exerciseId === selectedExerciseId);
    const heaviest = getHeaviestSet(exercise.sets);
    if (!heaviest) {
      points.push({ week: `H${w - startWeek}`, displayWeek: w - startWeek, weight: null, reps: null, status: 'empty' });
      continue;
    }
    points.push({
      week: `H${w - startWeek}`,
      displayWeek: w - startWeek,
      weight: heaviest.weight,
      reps: heaviest.reps,
      status: calculateExerciseStatus(exercise.sets, prevExercise?.sets),
    });
  }
  return points;
}

function StatusBarView({ data }: { data: DataPoint[] }) {
  return (
    <div className="relative py-2">
      <div className="pointer-events-none absolute inset-y-2 left-0 w-5 bg-gradient-to-r from-(--color-bg-card) to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-2 right-0 w-5 bg-gradient-to-l from-(--color-bg-card) to-transparent z-10" />
      <div
        className="flex gap-1 items-stretch overflow-x-auto py-2 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ minHeight: 120 }}
      >
        {data.map(point => {
          const color = colorByStatus(point.status);
          const bg = bgByStatus(point.status);
          const isEmpty = point.status === 'empty';
          return (
            <div key={point.week} className="flex flex-col items-center gap-1.5 min-w-[64px] flex-1">
              <div
                className="flex-1 w-full rounded-md border flex flex-col items-center justify-center px-1 py-2"
                style={{ background: bg, borderColor: color, opacity: isEmpty ? 0.4 : 1 }}
              >
                {!isEmpty && (
                  <>
                    <span className="lb-figure text-xs font-semibold" style={{ color }}>{point.weight}kg</span>
                    <span className="lb-figure text-xs text-(--color-text-secondary)">×{point.reps}</span>
                  </>
                )}
                {isEmpty && <span className="text-xs text-(--color-text-secondary)">-</span>}
              </div>
              <span className="lb-figure text-xs font-medium text-(--color-text-secondary)">{point.week}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StreakDotsView({ data }: { data: DataPoint[] }) {
  return (
    <div className="relative py-6">
      {/* Timeline line */}
      <div className="absolute left-4 right-4 h-[2px] bg-(--color-border) rounded-full" style={{ top: '36px' }} />
      <div className="flex items-start gap-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {data.map(point => {
          const color = colorByStatus(point.status);
          const isEmpty = point.status === 'empty';
          return (
            <div key={point.week} className="flex flex-col items-center gap-2 min-w-[64px] flex-1 relative z-10">
              <div
                className="w-6 h-6 rounded-full border-2"
                style={{
                  background: isEmpty ? 'var(--color-bg-input)' : color,
                  borderColor: isEmpty ? 'var(--color-border)' : color,
                  opacity: isEmpty ? 0.4 : 1,
                }}
              />
              <span className="lb-figure text-xs font-medium text-(--color-text-secondary)">{point.week}</span>
              {!isEmpty && (
                <span className="lb-figure text-xs text-(--color-text-secondary)">{point.weight}×{point.reps}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Charts() {
  const { programs: initialPrograms } = usePrograms();
  const { weekLogs } = useWeekLogs();
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('Charts must be used within AppProvider');
  const { state, dispatch } = ctx;

  const phases = state.phases ?? [];

  const [selectedProgramId, setSelectedProgramId] = useState<string>(initialPrograms[0]?.id || '');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [activePhaseId, setActivePhaseId] = useState<string>(phases[0]?.id || '');
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>(
    () => (localStorage.getItem('chart-view-mode') as ChartViewMode) || 'tabs'
  );
  const [dataViewMode, setDataViewMode] = useState<DataViewMode>('bars');
  const [showSettings, setShowSettings] = useState(false);

  const programs = useMemo(() => programsForPhase(state, activePhaseId), [state, activePhaseId]);

  const selectedProgram = programs.find(p => p.id === selectedProgramId);
  const exercises = selectedProgram?.exercises.filter(e => e.isActive) || [];
  useEffect(() => {
    if (!programs.some(p => p.id === selectedProgramId)) {
      setSelectedProgramId(programs[0]?.id ?? '');
      setSelectedExerciseId('');
    } else if (selectedExerciseId && !programs.find(p => p.id === selectedProgramId)?.exercises.some(e => e.id === selectedExerciseId)) setSelectedExerciseId('');
  }, [programs, selectedProgramId, selectedExerciseId]);

  const programLogs = useMemo(
    () => weekLogs.filter(w => w.programId === selectedProgramId).sort((a, b) => a.weekNumber - b.weekNumber),
    [weekLogs, selectedProgramId]
  );

  const phaseDataMap = useMemo(() => {
    if (!selectedExerciseId) return new Map<string, DataPoint[]>();
    const map = new Map<string, DataPoint[]>();
    for (const phase of phases) {
      const phaseLogs = programLogs.filter(log => {
        if (log.weekNumber < phase.startWeek) return false;
        if (phase.endWeek !== null && log.weekNumber > phase.endWeek) return false;
        return true;
      });
      map.set(phase.id, buildPhaseData(phaseLogs, selectedExerciseId, phase));
    }
    return map;
  }, [programLogs, selectedExerciseId, phases]);

  const selectedExerciseName = selectedExerciseId
    ? exercises.find(e => e.id === selectedExerciseId)?.name
    : 'Egzersiz seçin';

  const handleViewModeChange = (mode: ChartViewMode) => {
    setChartViewMode(mode);
    localStorage.setItem('chart-view-mode', mode);
  };

  const handleSavePhases = (newPhases: PhaseDefinition[]) => {
    dispatch({ type: 'SET_PHASES', payload: newPhases });
    setShowSettings(false);
    if (!newPhases.find(p => p.id === activePhaseId)) {
      setActivePhaseId(newPhases[0]?.id || '');
    }
  };

  const renderPhaseContent = (phase: PhaseDefinition) => {
    const data = phaseDataMap.get(phase.id) || [];
    if (data.every(d => d.status === 'empty')) {
      return (
        <div className="flex items-center justify-center py-12">
          <p className="lb-label">Bu faz için veri yok.</p>
        </div>
      );
    }
    return dataViewMode === 'dots' ? <StreakDotsView data={data} /> : <StatusBarView data={data} />;
  };

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Progressive Overload</h1>
        <p className="lb-label mt-1">Fazlara göre ilerleme</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={selectedProgramId}
          onChange={e => { setSelectedProgramId(e.target.value); setSelectedExerciseId(''); }}
          className="px-4 py-2.5 bg-(--color-bg-input) border lb-rule rounded-lg text-sm font-medium focus:outline-none focus:border-(--color-text-primary)"
        >
          {programs.slice().sort((a, b) => a.order - b.order).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={selectedExerciseId}
          onChange={e => setSelectedExerciseId(e.target.value)}
          className="px-4 py-2.5 bg-(--color-bg-input) border lb-rule rounded-lg text-sm font-medium focus:outline-none focus:border-(--color-text-primary)"
        >
          <option value="">Egzersiz seç…</option>
          {exercises.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}
        </select>

        <button
          onClick={() => setShowSettings(true)}
          className="lb-press ml-auto p-2 rounded-lg border lb-rule text-(--color-text-secondary)"
          aria-label="Faz ayarları"
          title="Faz ayarları"
        >⚙</button>
      </div>

      {selectedExerciseId && (
        <>
          {/* Legend + View controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLOR_UP }} />Artış
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLOR_SAME }} />Aynı
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLOR_DOWN }} />Düşüş
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border lb-rule overflow-hidden text-xs font-semibold">
                <button
                  onClick={() => setDataViewMode('bars')}
                  className={`lb-press px-3 py-1.5 ${dataViewMode === 'bars' ? 'bg-(--color-text-primary) text-(--color-bg-primary)' : 'text-(--color-text-secondary)'}`}
                >Çubuk</button>
                <button
                  onClick={() => setDataViewMode('dots')}
                  className={`lb-press px-3 py-1.5 ${dataViewMode === 'dots' ? 'bg-(--color-text-primary) text-(--color-bg-primary)' : 'text-(--color-text-secondary)'}`}
                >Nokta</button>
              </div>

              <select
                value={chartViewMode}
                onChange={e => handleViewModeChange(e.target.value as ChartViewMode)}
                className="px-2 py-1.5 bg-(--color-bg-input) border lb-rule rounded-lg text-xs font-medium focus:outline-none focus:border-(--color-text-primary)"
              >
                <option value="tabs">Sekme</option>
                <option value="side-by-side">Yan yana</option>
                <option value="stacked">Alt alta</option>
              </select>
            </div>
          </div>

          {/* Tab mode */}
          {chartViewMode === 'tabs' && (
            <div>
              <div className="flex gap-1 mb-4">
                {phases.map(phase => (
                  <button
                    key={phase.id}
                    onClick={() => setActivePhaseId(phase.id)}
                    className={`lb-press px-4 py-2 rounded-lg text-xs border-b-2 ${
                      activePhaseId === phase.id
                        ? 'font-semibold border-(--color-text-primary)'
                        : 'font-medium border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)'
                    }`}
                  >
                    {phase.name} (H{phase.startWeek}-H{phase.endWeek ?? 'inf'})
                  </button>
                ))}
              </div>
              <div className="rounded-lg p-5 border lb-rule">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">
                    {selectedExerciseName} — {phases.find(p => p.id === activePhaseId)?.name}
                  </h3>
                </div>
                {phases.find(p => p.id === activePhaseId) && renderPhaseContent(phases.find(p => p.id === activePhaseId)!)}
              </div>
            </div>
          )}

          {/* Side by side */}
          {chartViewMode === 'side-by-side' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {phases.map(phase => (
                <div key={phase.id} className="rounded-lg p-5 border lb-rule">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">{selectedExerciseName} — {phase.name}</h3>
                    <span className="lb-figure text-xs text-(--color-text-secondary)">H{phase.startWeek}-H{phase.endWeek ?? 'inf'}</span>
                  </div>
                  {renderPhaseContent(phase)}
                </div>
              ))}
            </div>
          )}

          {/* Stacked */}
          {chartViewMode === 'stacked' && (
            <div className="grid gap-4">
              {phases.map(phase => (
                <div key={phase.id} className="rounded-lg p-5 border lb-rule">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">{selectedExerciseName} — {phase.name}</h3>
                    <span className="lb-figure text-xs text-(--color-text-secondary)">H{phase.startWeek}-H{phase.endWeek ?? 'inf'}</span>
                  </div>
                  {renderPhaseContent(phase)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!selectedExerciseId && (
        <div className="rounded-lg p-5 border lb-rule">
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-(--color-text-secondary) text-sm">Bir egzersiz seçin</p>
          </div>
        </div>
      )}

      {showSettings && (
        <PhaseSettingsModal phases={phases} currentWeek={state.currentWeek} onSave={handleSavePhases} onClose={() => setShowSettings(false)} />
      )}
    </PageContainer>
  );
}

