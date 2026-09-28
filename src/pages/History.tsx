import { programVersionAt, programsForPhase } from '@/utils/programVersions';
import { useNavigate } from 'react-router-dom';
import { PhaseSettingsModal } from '@/components/shared/PhaseSettingsModal';
import { useState, useMemo, useEffect, useLayoutEffect, useContext } from 'react';
import { usePrograms } from '@/hooks/usePrograms';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useColorSettings } from '@/hooks/useColorSettings';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { PageContainer } from '@/components/layout/PageContainer';
import { WorkoutDetailModal } from '@/components/shared/WorkoutDetailModal';
import { calculateExerciseStatus } from '@/utils/statusCalculator';
import { formatSets } from '@/utils/formatters';
import { applySavedOrder } from '@/utils/reorder';
import { syncExerciseLogs } from '@/utils/exerciseSync';
import { AppContext } from '@/context/AppContext';
import type { ExerciseLog, ExerciseStatus } from '@/types';

type HistoryPhase = {
  label: string;
  weeks: number[];
  baseWeek: number;
};

function formatIntensityLabel(intensity: string): string {
  if (intensity === 'failure' || intensity === 'F') return 'F';
  if (intensity === 'rir1' || intensity === '+1') return '+1';
  if (intensity === 'rir2' || intensity === '+2') return '+2';
  if (intensity === 'rir3' || intensity === '+3') return '+3';
  return intensity;
}

function buildPhaseLabel(name: string, weeks: number[], baseWeek: number): string {
  if (weeks.length === 0) return `${name} (H0-H0)`;
  const endWeek = weeks[weeks.length - 1] - baseWeek;
  return `${name} (H0-H${endWeek})`;
}

const HISTORY_STATE_KEY = 'history-page-state-v1';

export function History() {
  const [showPhaseSettings, setShowPhaseSettings] = useState(false);
  const navigate = useNavigate();
  const { programs: initialPrograms } = usePrograms();
  const { weekLogs, currentWeek, saveWorkout } = useWeekLogs();
  const { getStatusBgColor } = useColorSettings();
  const isMobile = useIsMobileDevice();
  const ctx = useContext(AppContext);
  const contextPhases = ctx?.state.phases ?? [];
  const exerciseRowOrder = ctx?.state.exerciseRowOrder;

  const [selectedProgramId, setSelectedProgramId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STATE_KEY);
      if (saved) {
        const { programId } = JSON.parse(saved) as { programId: string; phaseIdx: number; pageStart: number };
        if (programId && initialPrograms.find(p => p.id === programId)) return programId;
      }
    } catch { /* ignore */ }
    return initialPrograms[0]?.id || '';
  });
  const [modalData, setModalData] = useState<{
    exerciseName: string;
    exerciseId: string;
    weekNumber: number;
    currentSets: import('@/types').SetLog[];
    previousSets?: import('@/types').SetLog[];
    previousWeek?: number;
    weekNotes?: string;
    isEmpty: boolean;
  } | null>(null);


  const programLogs = useMemo(
    () => weekLogs
      .filter(w => w.programId === selectedProgramId)
      .sort((a, b) => a.weekNumber - b.weekNumber),
    [weekLogs, selectedProgramId]
  );

  // Get available weeks
  const availableWeeks = useMemo(() => {
    const weeks: number[] = [];
    for (let i = 0; i <= currentWeek; i++) {
      weeks.push(i);
    }
    return weeks;
  }, [currentWeek]);

  // Split into phases from context definitions
  const phases = useMemo<HistoryPhase[]>(() => {
    return contextPhases.map(p => {
      const weeks = availableWeeks.filter(w => {
        if (w < p.startWeek) return false;
        if (p.endWeek !== null && w > p.endWeek) return false;
        return true;
      });
      return {
        label: buildPhaseLabel(p.name, weeks, p.startWeek),
        weeks,
        baseWeek: p.startWeek,
      };
    }).filter(p => p.weeks.length > 0);
  }, [availableWeeks, contextPhases]);

  // Show 1 week at a time on mobile for easier browsing
  const PAGE_SIZE = isMobile ? 1 : 4;

  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
  const currentPhase = useMemo(() => phases[selectedPhaseIdx] || phases[0] || { label: 'Tüm haftalar', weeks: availableWeeks, baseWeek: 0 }, [phases, selectedPhaseIdx, availableWeeks]);

  const getDisplayWeek = (weekNum: number): number => weekNum - currentPhase.baseWeek;

  // Pagination default — corrected by the layout effect below
  const [pageStart, setPageStart] = useState(0);

  // Jump to last workout week whenever the selected program changes (or on mount).
  // useLayoutEffect runs before paint, so there's no visible flash of wrong position.
  useLayoutEffect(() => {
    if (!phases.length) return;
    // Smart default: last week that has actual workout data (not holiday)
    const activePhase = phases.find(p => p.weeks.includes(currentWeek)) ?? phases[phases.length - 1];
    const workoutLogs = programLogs.filter(l => activePhase.weeks.includes(l.weekNumber) && !l.isHoliday && (l.exercises?.length ?? 0) > 0);
    const lastDataWeek = workoutLogs.length > 0 ? workoutLogs[workoutLogs.length - 1].weekNumber : null;
    const focusWeek = lastDataWeek === null || currentWeek > lastDataWeek ? currentWeek : lastDataWeek;
    if (focusWeek !== null) {
      const pIdx = phases.findIndex(p => p.weeks.includes(focusWeek));
      if (pIdx >= 0) {
        const phase = phases[pIdx];
        const weekIdx = phase.weeks.indexOf(focusWeek);
        setSelectedPhaseIdx(pIdx);
        setPageStart(Math.floor(weekIdx / PAGE_SIZE) * PAGE_SIZE);
        return;
      }
    }
    // Fallback: last phase, last page
    const lastPhase = phases[phases.length - 1];
    setSelectedPhaseIdx(phases.length - 1);
    setPageStart(Math.max(0, Math.floor((lastPhase.weeks.length - 1) / PAGE_SIZE) * PAGE_SIZE));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Choose the current phase on mount; browsing days must preserve the selected phase.
  const visibleWeeks = useMemo(() => {
    return currentPhase.weeks.slice(pageStart, pageStart + PAGE_SIZE);
  }, [currentPhase, pageStart]);

  const scopedWeek = visibleWeeks[visibleWeeks.length - 1] ?? currentPhase.baseWeek;
  const { programs: scopedPrograms } = usePrograms(scopedWeek);
  const programs = useMemo(() => ctx ? programsForPhase(ctx.state, contextPhases.find(p => p.startWeek === currentPhase.baseWeek)?.id ?? '') : scopedPrograms,
    [ctx, contextPhases, currentPhase.baseWeek, scopedPrograms]);
  const selectedProgram = scopedPrograms.find(p => p.id === selectedProgramId) ?? programs.find(p => p.id === selectedProgramId);
  useEffect(() => {
    if (programs.length && !programs.some(p => p.id === selectedProgramId)) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  // Persist last selected program so it survives tab switches
  useEffect(() => {
    localStorage.setItem(HISTORY_STATE_KEY, JSON.stringify({ programId: selectedProgramId }));
  }, [selectedProgramId]);

  // The legacy row order is shared by program ID. It reflects the current
  // program and must not reorder exercises in the archived phases.
  const savedRowOrder = selectedPhaseIdx === contextPhases.length - 1
    ? exerciseRowOrder?.[selectedProgramId]
    : undefined;

  // Get all exercise IDs for visible weeks
  const allExerciseIds = useMemo(() => {
    const ids = new Set<string>();
    // Add exercises from logs for visible weeks
    programLogs
      .filter(log => visibleWeeks.includes(log.weekNumber))
      .forEach(log => {
        log.exercises.forEach(e => ids.add(e.exerciseId));
      });
    // A program edit can add an exercise before this week's workout is saved.
    // Include its definition even when an older log already fills the grid.
    selectedProgram?.exercises.filter(e => e.isActive).forEach(e => ids.add(e.id));
    // A manual row order, once the user has set one, wins over the order the
    // ids happened to appear in. No saved order → untouched, so nothing moves
    // for anyone who has never reordered.
    return applySavedOrder(Array.from(ids), savedRowOrder);
  }, [programLogs, visibleWeeks, selectedProgram, savedRowOrder]);

  const getExerciseName = (exerciseId: string): string => {
    const def = selectedProgram?.exercises.find(e => e.id === exerciseId);
    return def?.name || programLogs.filter(l => currentPhase.weeks.includes(l.weekNumber)).flatMap(l => l.exercises).find(e => e.exerciseId === exerciseId)?.exerciseName || exerciseId;
  };

  const getExerciseSets = (exerciseId: string): number | undefined => {
    return selectedProgram?.exercises.find(e => e.id === exerciseId)?.defaultSets;
  };

  const exercisePositionForWeek = (week: number, exerciseId: string): number | null => {
    const definition = ctx && programVersionAt(ctx.state, week).programs.find(p => p.id === selectedProgramId);
    const position = definition?.exercises.filter(ex => ex.isActive).findIndex(ex => ex.id === exerciseId) ?? -1;
    if (position >= 0) return position + 1;
    const logged = programLogs.find(log => log.weekNumber === week)?.exercises.findIndex(ex => ex.exerciseId === exerciseId) ?? -1;
    return logged >= 0 ? logged + 1 : null;
  };

  const orderHistoryForExercise = (exerciseId: string): string | null => {
    const periods: { from: number; to: number; position: number }[] = [];
    for (const week of currentPhase.weeks) {
      const position = exercisePositionForWeek(week, exerciseId);
      if (position === null) continue;
      const last = periods[periods.length - 1];
      if (last && last.position === position && last.to === week - 1) last.to = week;
      else periods.push({ from: week, to: week, position });
    }
    if (periods.length < 2) return null;
    return periods.map(period => {
      const from = `H${getDisplayWeek(period.from)}`;
      const to = period.to === period.from ? '' : `–H${getDisplayWeek(period.to)}`;
      return `${from}${to}: ${period.position}`;
    }).join(' → ');
  };

  // A week's heading opens that week's fill/edit page.
  const openWeek = (week: number) => navigate(`/workout/${selectedProgramId}/week/${week}?from=history`);

  const getExerciseLog = (weekNumber: number, exerciseId: string): ExerciseLog | undefined => {
    const log = programLogs.find(w => w.weekNumber === weekNumber);
    return log?.exercises.find(e => e.exerciseId === exerciseId);
  };

  const getWeekLog = (weekNumber: number) => programLogs.find(w => w.weekNumber === weekNumber);

  // Find nearest previous week in the current phase that has data for this exercise.
  const getPrevExerciseWithinPhase = (weekNum: number, exerciseId: string): { weekNumber: number; log: ExerciseLog } | null => {
    for (let w = weekNum - 1; w >= currentPhase.baseWeek; w--) {
      const prev = getExerciseLog(w, exerciseId);
      if (prev) return { weekNumber: w, log: prev };
    }
    return null;
  };

  // Collect notes for visible weeks
  const weekNotes = useMemo(() => {
    return visibleWeeks
      .map(weekNum => {
        const log = getWeekLog(weekNum);
        return log?.notes ? { week: weekNum, notes: log.notes } : null;
      })
      .filter(Boolean) as { week: number; notes: string }[];
  }, [visibleWeeks, programLogs]);

  return (
    <PageContainer>
      {/* Title + phase settings */}
      <div className="mb-6 flex flex-wrap gap-3 items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Antrenman Geçmişi</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowPhaseSettings(true)} className="lb-press px-3 py-1.5 border lb-rule text-xs font-semibold rounded-lg">Fazlar</button>
        </div>
      </div>

      {showPhaseSettings && <PhaseSettingsModal phases={contextPhases} currentWeek={currentWeek} onClose={() => setShowPhaseSettings(false)} onSave={updated => {
        ctx?.dispatch({ type: 'SET_PHASES', payload: updated });
        const visible = updated.filter(p => p.startWeek <= currentWeek);
        const index = visible.findIndex(p => currentWeek >= p.startWeek && (p.endWeek === null || currentWeek <= p.endWeek));
        setSelectedPhaseIdx(Math.max(0, index));
        const start = visible[Math.max(0, index)]?.startWeek ?? 0;
        setPageStart(Math.floor((currentWeek - start) / PAGE_SIZE) * PAGE_SIZE);
        setShowPhaseSettings(false);
      }} />}
      {/* Program Filter — current program marked by underline, not a fill */}
      <div className="flex flex-wrap items-center gap-1 mb-4">
        {programs.sort((a, b) => a.order - b.order).map(p => (
          <button
            key={p.id}
            onClick={() => { setSelectedProgramId(p.id); setPageStart(0); }}
            className={`lb-press px-3 py-2 rounded-lg text-sm border-b-2 ${
              selectedProgramId === p.id
                ? 'font-semibold border-(--color-text-primary)'
                : 'font-medium border-transparent text-(--color-text-secondary) hover:text-(--color-text-primary)'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Phase selector (if multiple phases exist) */}
      {phases.length > 1 && (
        <div className="flex items-center gap-1 mb-3">
          {phases.map((phase, idx) => (
            <button
              key={idx}
              onClick={() => {
                setSelectedPhaseIdx(idx);
                // Go to last page of selected phase
                const last = phase.weeks.length > 0
                  ? Math.floor((phase.weeks.length - 1) / PAGE_SIZE) * PAGE_SIZE
                  : 0;
                setPageStart(last);
              }}
              className={`lb-press px-3 py-1.5 rounded-lg text-xs ${
                selectedPhaseIdx === idx
                  ? 'font-semibold text-(--color-text-primary)'
                  : 'font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)'
              }`}
            >
              {phase.label}
            </button>
          ))}
        </div>
      )}

      {/* Week Range Navigation */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => setPageStart(s => Math.max(0, s - PAGE_SIZE))}
          disabled={pageStart === 0}
          className="lb-press px-3 py-1.5 text-sm font-medium border lb-rule rounded-lg disabled:opacity-30"
        >
          ← Önceki
        </button>
        <span className="lb-label">
          {isMobile && visibleWeeks.length === 1
            ? `H${getDisplayWeek(visibleWeeks[0] ?? currentPhase.baseWeek)}`
            : `H${getDisplayWeek(visibleWeeks[0] ?? currentPhase.baseWeek)} — H${getDisplayWeek(visibleWeeks[visibleWeeks.length - 1] ?? currentPhase.baseWeek)}`
          }
        </span>
        <button
          onClick={() => setPageStart(s => s + PAGE_SIZE)}
          disabled={pageStart + PAGE_SIZE >= currentPhase.weeks.length}
          className="lb-press px-3 py-1.5 text-sm font-medium border lb-rule rounded-lg disabled:opacity-30"
        >
          Sonraki →
        </button>
      </div>

      {/* Table / Accordion */}
      {programs.length === 0 ? (
        <p className="text-(--color-text-secondary)">Henüz program yok.</p>
      ) : isMobile ? (
        /* ── Mobile: Week-by-week list ── */
        <div className="space-y-5">
          {visibleWeeks.map(weekNum => {
            const weekLog = getWeekLog(weekNum);
            const weekProgram = ctx && programVersionAt(ctx.state, weekNum).programs.find(p => p.id === selectedProgramId);
            const weekExercises = weekProgram && (weekLog || weekNum === currentWeek)
              ? syncExerciseLogs(weekProgram, weekLog?.exercises ?? [], ex => ({ exerciseId: ex.id, exerciseName: ex.name, sets: [] }))
              : weekLog?.exercises ?? [];

            return (
              <div key={weekNum}>
                <div className="flex items-center justify-between pb-2 border-b lb-rule-strong mb-3">
                  <h3 className="text-sm font-semibold">H{getDisplayWeek(weekNum)}{weekLog?.isHoliday ? ' · Tatil' : ''}</h3>
                  <button onClick={() => openWeek(weekNum)} disabled={!selectedProgram}
                    className="lb-press text-sm font-medium underline underline-offset-2">
                    Doldur / düzenle
                  </button>
                </div>

                {weekLog?.isHoliday ? (
                  <div className="text-sm text-(--color-text-secondary) p-3 rounded-lg bg-(--color-bg-input)">Bu hafta tatil olarak işaretlenmiş.</div>
                ) : weekExercises.length > 0 ? (
                  <div className="space-y-1">
                    {weekExercises.map(exercise => {
                      const prevWithinPhase = getPrevExerciseWithinPhase(weekNum, exercise.exerciseId);
                      const prevLog = prevWithinPhase?.log;
                      const status: ExerciseStatus = prevLog
                        ? calculateExerciseStatus(exercise.sets, prevLog.sets)
                        : 'new';
                      const statusColor = status === 'improved'
                        ? 'var(--lb-gain)'
                        : status === 'decreased'
                          ? 'var(--lb-drop)'
                          : status === 'new'
                            ? 'var(--lb-ref)'
                            : 'var(--color-text-secondary)';

                      return (
                        <button
                          key={exercise.exerciseId}
                          onClick={() => {
                            setModalData({
                              exerciseName: exercise.exerciseName,
                              exerciseId: exercise.exerciseId,
                              weekNumber: weekNum,
                              currentSets: exercise.sets,
                              previousSets: prevLog?.sets,
                              previousWeek: prevWithinPhase ? getDisplayWeek(prevWithinPhase.weekNumber) : undefined,
                              weekNotes: weekLog?.notes,
                              isEmpty: exercise.sets.length === 0,
                            });
                          }}
                          className="lb-press w-full text-left px-2 py-2.5 -mx-2 rounded-lg border-b lb-rule"
                        >
                          {/* Exercise name row */}
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold">{exercise.exerciseName}</span>
                            <span className="text-[11px] font-semibold" style={{ color: statusColor }}>
                              {status === 'improved' ? '▲ İlerleme' : status === 'decreased' ? '▼ Düşüş' : status === 'new' ? '★ Referans' : '= Aynı'}
                            </span>
                          </div>
                          {/* Set pills */}
                          <div className="flex flex-wrap gap-1.5">
                            {exercise.sets.map((s, si) => (
                              <span key={si} className="lb-figure text-[11px] font-semibold px-2 py-1 rounded-md bg-(--color-bg-input) text-(--color-text-secondary) border lb-rule">
                                {s.weight}×{s.reps} {formatIntensityLabel(String(s.intensity))}
                              </span>
                            ))}
                          </div>
                          {/* Comparison with previous week */}
                          {prevLog && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5 opacity-60">
                              {prevLog.sets.map((s, si) => (
                                <span key={si} className="lb-figure text-[10px] px-2 py-0.5 rounded-md text-(--color-text-secondary) border lb-rule">
                                  {s.weight}×{s.reps} {formatIntensityLabel(String(s.intensity))}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-(--color-text-secondary) p-3 rounded-lg bg-(--color-bg-input)">Bu hafta için kayıt yok.</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border lb-rule [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-(--color-border)">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-(--color-bg-card)">
                <th className="sticky left-0 bg-(--color-bg-card) z-10 px-3 py-3 text-left font-semibold border-r lb-rule min-w-[140px]">
                  Egzersiz
                </th>
                <th className="px-3 py-3 text-center font-semibold border-r lb-rule min-w-[60px]">
                  Set
                </th>
                {visibleWeeks.map(w => (
                  <th key={w} className="px-1 py-1.5 text-center font-semibold min-w-[120px]">
                    <button onClick={() => openWeek(w)} disabled={!selectedProgram}
                      title={`H${getDisplayWeek(w)} haftasını doldur / düzenle`}
                      className="lb-press w-full px-2 py-1.5 rounded-lg">
                      H{getDisplayWeek(w)} <span aria-hidden="true" className="text-(--color-text-secondary)">✎</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allExerciseIds.map(exerciseId => (
                <tr key={exerciseId} className="border-t lb-rule">
                  <td className="sticky left-0 bg-(--color-bg-primary) z-10 px-3 py-2.5 font-medium text-xs border-r lb-rule">
                    {getExerciseName(exerciseId)}
                  </td>
                  <td className="lb-figure px-3 py-2.5 text-center text-xs border-r lb-rule text-(--color-text-secondary)">
                    {getExerciseSets(exerciseId) ?? '—'}
                  </td>
                  {visibleWeeks.map(weekNum => {
                    const log = getExerciseLog(weekNum, exerciseId);
                    const weekLog = getWeekLog(weekNum);
                    const prevWithinPhase = getPrevExerciseWithinPhase(weekNum, exerciseId);
                    const prevLog = prevWithinPhase?.log;

                    let status: ExerciseStatus = 'same';
                    if (weekLog?.isHoliday) {
                      status = 'holiday';
                    } else if (log) {
                      status = prevLog
                        ? calculateExerciseStatus(log.sets, prevLog.sets)
                        : 'new';
                    } else if (prevLog) {
                      status = 'removed';
                    }

                    const bgColor = getStatusBgColor(status);

                    return (
                      <td
                        key={weekNum}
                        onClick={() => {
                          setModalData({
                            exerciseName: getExerciseName(exerciseId),
                            exerciseId,
                            weekNumber: weekNum,
                            currentSets: log?.sets || [],
                            previousSets: prevLog?.sets,
                            previousWeek: prevWithinPhase ? getDisplayWeek(prevWithinPhase.weekNumber) : undefined,
                            weekNotes: weekLog?.notes,
                            isEmpty: !log || log.sets.length === 0,
                          });
                        }}
                        style={{ backgroundColor: bgColor }}
                        className="lb-press lb-figure px-2 py-2.5 text-center text-sm cursor-pointer border-l lb-rule font-semibold whitespace-pre-line leading-5"
                      >
                        {weekLog?.isHoliday ? null : log ? (
                          formatSets(log.sets)
                        ) : (
                          <span className="text-(--color-text-secondary)">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Week Notes */}
      {weekNotes.length > 0 && (
        <div className="mt-6 pt-5 border-t lb-rule-strong">
          <h3 className="text-sm font-semibold mb-3">Notlar</h3>
          <div className="grid gap-2.5">
            {weekNotes.map(({ week, notes }) => (
              <div key={week} className="flex gap-3 items-baseline text-sm">
                <span className="lb-figure shrink-0 text-xs font-semibold text-(--color-text-secondary)">
                  H{getDisplayWeek(week)}
                </span>
                <span className="text-(--color-text-secondary) leading-relaxed">{notes}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workout Detail Modal */}
      <WorkoutDetailModal
        isOpen={modalData !== null}
        onClose={() => setModalData(null)}
        exerciseName={modalData?.exerciseName || ''}
        exerciseId={modalData?.exerciseId || ''}
        weekNumber={modalData?.weekNumber || 0}
        currentSets={modalData?.currentSets || []}
        previousSets={modalData?.previousSets}
        previousWeek={modalData?.previousWeek}
        weekNotes={modalData?.weekNotes}
        isEmpty={modalData?.isEmpty || false}
        orderHistory={modalData ? orderHistoryForExercise(modalData.exerciseId) ?? undefined : undefined}
        onSaveSets={(sets) => {
          if (!modalData) return;
          const existingLog = weekLogs.find(
            w => w.programId === selectedProgramId && w.weekNumber === modalData.weekNumber
          );
          const exercises = existingLog?.exercises || [];
          let updatedExercises: typeof exercises;
          if (sets.length === 0) {
            // Remove the exercise entirely when sets are cleared
            updatedExercises = exercises.filter(e => e.exerciseId !== modalData.exerciseId);
          } else {
            updatedExercises = exercises.some(e => e.exerciseId === modalData.exerciseId)
              ? exercises.map(e => e.exerciseId === modalData.exerciseId ? { ...e, sets } : e)
              : [...exercises, { exerciseId: modalData.exerciseId, exerciseName: modalData.exerciseName, sets }];
          }
          saveWorkout({
            weekNumber: modalData.weekNumber,
            programId: selectedProgramId,
            date: existingLog?.date || new Date().toISOString(),
            exercises: updatedExercises,
            notes: existingLog?.notes || '',
            isHoliday: existingLog?.isHoliday || false,
            updatedAt: new Date().toISOString(),
          });
        }}
        onSaveNotes={(notes) => {
          if (!modalData) return;
          const existingLog = weekLogs.find(
            w => w.programId === selectedProgramId && w.weekNumber === modalData.weekNumber
          );
          saveWorkout({
            weekNumber: modalData.weekNumber,
            programId: selectedProgramId,
            date: existingLog?.date || new Date().toISOString(),
            exercises: existingLog?.exercises || [],
            notes,
            isHoliday: existingLog?.isHoliday || false,
            updatedAt: new Date().toISOString(),
          });
        }}
      />
    </PageContainer>
  );
}
