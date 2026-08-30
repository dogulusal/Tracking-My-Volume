import { useState, useMemo, useEffect, useLayoutEffect, useContext } from 'react';
import { usePrograms } from '@/hooks/usePrograms';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useColorSettings } from '@/hooks/useColorSettings';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { PageContainer } from '@/components/layout/PageContainer';
import { WorkoutDetailModal } from '@/components/shared/WorkoutDetailModal';
import { calculateExerciseStatus } from '@/utils/statusCalculator';
import { formatSets } from '@/utils/formatters';
import { moveItem, applySavedOrder } from '@/utils/reorder';
import { buildSheetTsv } from '@/utils/sheetExport';
import { copyText } from '@/utils/clipboard';
import { useLastSheetExport } from '@/hooks/useLastSheetExport';
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

const STATUS_OPTIONS: { value: ExerciseStatus; label: string }[] = [
  { value: 'improved', label: 'İlerleme' },
  { value: 'decreased', label: 'Düşüş' },
  { value: 'same', label: 'Aynı' },
  { value: 'new', label: 'Yeni' },
  { value: 'holiday', label: 'Tatil' },
  { value: 'removed', label: 'Kaldırıldı' },
];

const HISTORY_STATE_KEY = 'history-page-state-v1';

export function History() {
  const { programs, updateProgram } = usePrograms();
  const { weekLogs, currentWeek, saveWorkout, incrementWeek } = useWeekLogs();
  const {
    getCellColor, setCellColor, removeCellColor, getCellOverride, resetAllOverrides,
    isDark, getStatusBgColor, setStatusBgColor, resetStatusColors, hasCustomStatusColors,
  } = useColorSettings();
  const isMobile = useIsMobileDevice();
  const ctx = useContext(AppContext);
  const contextPhases = ctx?.state.phases ?? [];
  const exerciseRowOrder = ctx?.state.exerciseRowOrder;

  const [selectedProgramId, setSelectedProgramId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STATE_KEY);
      if (saved) {
        const { programId } = JSON.parse(saved) as { programId: string; phaseIdx: number; pageStart: number };
        if (programId && programs.find(p => p.id === programId)) return programId;
      }
    } catch { /* ignore */ }
    return programs[0]?.id || '';
  });
  const { recordExport } = useLastSheetExport();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [showColorSettings, setShowColorSettings] = useState(false);
  const [showProgramEditor, setShowProgramEditor] = useState(false);
  const [programEdits, setProgramEdits] = useState<Array<{ id: string; name: string; defaultSets: number }>>([]);
  const [editorWeek, setEditorWeek] = useState<number | null>(null);
  const [bulkColorStatus, setBulkColorStatus] = useState<ExerciseStatus>('improved');
  const [bulkRowExerciseId, setBulkRowExerciseId] = useState('');
  const [bulkColumnWeek, setBulkColumnWeek] = useState<number | null>(null);
  const [modalData, setModalData] = useState<{
    exerciseName: string;
    exerciseId: string;
    weekNumber: number;
    currentSets: import('@/types').SetLog[];
    previousSets?: import('@/types').SetLog[];
    previousWeek?: number;
    weekNotes?: string;
    isEmpty: boolean;
    autoStatus: ExerciseStatus;
  } | null>(null);

  const selectedProgram = programs.find(p => p.id === selectedProgramId);

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
  const currentPhase = phases[selectedPhaseIdx] || phases[0];

  const getDisplayWeek = (weekNum: number): number => weekNum - currentPhase.baseWeek;

  // Pagination default — corrected by the layout effect below
  const [pageStart, setPageStart] = useState(0);

  // Jump to last workout week whenever the selected program changes (or on mount).
  // useLayoutEffect runs before paint, so there's no visible flash of wrong position.
  useLayoutEffect(() => {
    if (!phases.length) return;
    // Smart default: last week that has actual workout data (not holiday)
    const workoutLogs = programLogs.filter(l => !l.isHoliday && (l.exercises?.length ?? 0) > 0);
    const lastDataWeek = workoutLogs.length > 0 ? workoutLogs[workoutLogs.length - 1].weekNumber : null;
    if (lastDataWeek !== null) {
      const pIdx = phases.findIndex(p => p.weeks.includes(lastDataWeek));
      if (pIdx >= 0) {
        const phase = phases[pIdx];
        const weekIdx = phase.weeks.indexOf(lastDataWeek);
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
  }, [selectedProgramId]); // Only re-run when program changes, not on every data update
  const visibleWeeks = useMemo(() => {
    return currentPhase.weeks.slice(pageStart, pageStart + PAGE_SIZE);
  }, [currentPhase, pageStart]);

  // Persist last selected program so it survives tab switches
  useEffect(() => {
    localStorage.setItem(HISTORY_STATE_KEY, JSON.stringify({ programId: selectedProgramId }));
  }, [selectedProgramId]);

  const savedRowOrder = exerciseRowOrder?.[selectedProgramId];

  /**
   * Copies the phase currently on screen. The phase is the unit the page is
   * organised around, so "what got copied" is whatever the headline says —
   * copying the paginated window instead would send one or four weeks and
   * quietly leave the rest of the mezo behind.
   */
  const handleCopyPhase = async () => {
    if (!selectedProgram || !currentPhase || currentPhase.weeks.length === 0) return;
    const lastWeek = currentPhase.weeks[currentPhase.weeks.length - 1];
    const tsv = buildSheetTsv({
      program: selectedProgram,
      weekLogs,
      fromWeek: currentPhase.weeks[0],
      toWeek: lastWeek,
      phases: contextPhases,
      rowOrder: savedRowOrder,
    });
    const copied = await copyText(tsv);
    setCopyState(copied ? 'copied' : 'failed');
    if (copied) recordExport(lastWeek);
  };

  // Get all exercise IDs for visible weeks
  const allExerciseIds = useMemo(() => {
    const ids = new Set<string>();
    // Add exercises from logs for visible weeks
    programLogs
      .filter(log => visibleWeeks.includes(log.weekNumber))
      .forEach(log => {
        log.exercises.forEach(e => ids.add(e.exerciseId));
      });
    // Fallback: if no logs exist in visible range, show active program exercises
    if (ids.size === 0) {
      selectedProgram?.exercises.filter(e => e.isActive).forEach(e => ids.add(e.id));
    }
    // A manual row order, once the user has set one, wins over the order the
    // ids happened to appear in. No saved order → untouched, so nothing moves
    // for anyone who has never reordered.
    return applySavedOrder(Array.from(ids), savedRowOrder);
  }, [programLogs, visibleWeeks, selectedProgram, savedRowOrder]);

  const getExerciseName = (exerciseId: string): string => {
    const def = selectedProgram?.exercises.find(e => e.id === exerciseId);
    return def?.name || exerciseId;
  };

  const getExerciseSets = (exerciseId: string): number | undefined => {
    return selectedProgram?.exercises.find(e => e.id === exerciseId)?.defaultSets;
  };

  const getExerciseDisplayNameForWeek = (weekNumber: number, exerciseId: string): string => {
    const weekName = programLogs
      .find(w => w.weekNumber === weekNumber)
      ?.exercises.find(e => e.exerciseId === exerciseId)
      ?.exerciseName;
    if (weekName) return weekName;
    return getExerciseName(exerciseId);
  };

  useEffect(() => {
    // Whatever was copied belongs to the weeks that were on screen then.
    setCopyState('idle');
    if (visibleWeeks.length === 0) {
      setEditorWeek(null);
      setBulkColumnWeek(null);
      return;
    }
    const fallbackWeek = visibleWeeks[visibleWeeks.length - 1];
    setEditorWeek(prev => (prev !== null && visibleWeeks.includes(prev) ? prev : fallbackWeek));
    setBulkColumnWeek(prev => (prev !== null && visibleWeeks.includes(prev) ? prev : fallbackWeek));
  }, [visibleWeeks]);

  useEffect(() => {
    if (!selectedProgram) {
      setProgramEdits([]);
      return;
    }

    const targetWeek = editorWeek ?? visibleWeeks[visibleWeeks.length - 1];
    const ids = allExerciseIds.length > 0
      ? allExerciseIds
      : selectedProgram.exercises.filter(e => e.isActive).map(e => e.id);

    setProgramEdits(ids.map(id => {
      const exDef = selectedProgram.exercises.find(e => e.id === id);
      const weekSetCount = targetWeek !== undefined
        ? programLogs.find(w => w.weekNumber === targetWeek)?.exercises.find(e => e.exerciseId === id)?.sets.length
        : undefined;
      return {
        id,
        name: targetWeek !== undefined ? getExerciseDisplayNameForWeek(targetWeek, id) : getExerciseName(id),
        defaultSets: exDef?.defaultSets ?? weekSetCount ?? 1,
      };
    }));
  }, [selectedProgram, editorWeek, allExerciseIds, programLogs, visibleWeeks]);

  const applyRowColor = () => {
    if (!bulkRowExerciseId) return;
    visibleWeeks.forEach(week => setCellColor(week, bulkRowExerciseId, bulkColorStatus));
  };

  const clearRowColor = () => {
    if (!bulkRowExerciseId) return;
    visibleWeeks.forEach(week => removeCellColor(week, bulkRowExerciseId));
  };

  const applyColumnColor = () => {
    if (bulkColumnWeek === null) return;
    allExerciseIds.forEach(exerciseId => setCellColor(bulkColumnWeek, exerciseId, bulkColorStatus));
  };

  const clearColumnColor = () => {
    if (bulkColumnWeek === null) return;
    allExerciseIds.forEach(exerciseId => removeCellColor(bulkColumnWeek, exerciseId));
  };

  const deleteRowData = () => {
    if (!bulkRowExerciseId) return;
    visibleWeeks.forEach(weekNum => {
      const log = programLogs.find(w => w.weekNumber === weekNum);
      if (!log) return;
      saveWorkout({
        ...log,
        exercises: log.exercises.filter(e => e.exerciseId !== bulkRowExerciseId),
        updatedAt: new Date().toISOString(),
      });
    });
  };

  const deleteColumnData = () => {
    if (bulkColumnWeek === null) return;
    const log = programLogs.find(w => w.weekNumber === bulkColumnWeek);
    if (!log) return;
    saveWorkout({
      ...log,
      exercises: [],
      updatedAt: new Date().toISOString(),
    });
  };

  const saveProgramEdits = () => {
    if (!selectedProgram) return;
    const updatedExercises = [...selectedProgram.exercises];

    programEdits.forEach(draft => {
      const parsedSets = Number.parseInt(String(draft.defaultSets), 10);
      const safeSets = Number.isFinite(parsedSets) && parsedSets > 0 ? parsedSets : 1;
      const existingIndex = updatedExercises.findIndex(ex => ex.id === draft.id);

      if (existingIndex >= 0) {
        const existing = updatedExercises[existingIndex];
        updatedExercises[existingIndex] = {
          ...existing,
          name: draft.name.trim() || existing.name,
          defaultSets: safeSets,
        };
        return;
      }

      const targetWeek = editorWeek ?? visibleWeeks[visibleWeeks.length - 1];
      const weekExercise = targetWeek !== undefined
        ? programLogs.find(w => w.weekNumber === targetWeek)?.exercises.find(e => e.exerciseId === draft.id)
        : undefined;
      updatedExercises.push({
        id: draft.id,
        name: draft.name.trim() || draft.id,
        defaultSets: safeSets,
        defaultWeight: weekExercise?.sets[0]?.weight ?? 0,
        defaultReps: weekExercise?.sets[0]?.reps ?? 0,
        isActive: true,
      });
    });

    updateProgram({
      ...selectedProgram,
      exercises: updatedExercises,
      updatedAt: new Date().toISOString(),
    });

    // Persist the row order the user arranged with the ▲/▼ buttons. This is
    // stored per program and is what allExerciseIds applies on the next render.
    ctx?.dispatch({
      type: 'SET_EXERCISE_ROW_ORDER',
      payload: { programId: selectedProgram.id, exerciseIds: programEdits.map(p => p.id) },
    });

    const targetWeek = editorWeek ?? visibleWeeks[visibleWeeks.length - 1];
    if (targetWeek !== undefined) {
      const weekLog = programLogs.find(w => w.weekNumber === targetWeek);
      if (weekLog) {
        const updatedWeekLog = {
          ...weekLog,
          exercises: weekLog.exercises.map(ex => {
            const draft = programEdits.find(p => p.id === ex.exerciseId);
            if (!draft) return ex;
            return { ...ex, exerciseName: draft.name.trim() || ex.exerciseName };
          }),
          updatedAt: new Date().toISOString(),
        };
        saveWorkout(updatedWeekLog);
      }
    }

    setShowProgramEditor(false);
  };

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
      {/* Title + Settings Toggle */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Antrenman Geçmişi</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={incrementWeek}
            className="lb-press px-3 py-1.5 border lb-rule text-xs font-semibold rounded-lg"
          >
            + Yeni Hafta
          </button>
          <button
            onClick={() => setShowColorSettings(s => !s)}
            className={`lb-press p-2 rounded-lg text-lg border ${
              showColorSettings ? 'lb-rule-strong' : 'lb-rule text-(--color-text-secondary)'
            }`}
            title="Renk Ayarları"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Color Settings Panel */}
      {showColorSettings && (
        <div className="mb-5 border lb-rule rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Renk ayarları</h3>
            <button
              onClick={resetAllOverrides}
              className="text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) hover:underline"
            >
              Tüm overrideları sıfırla
            </button>
          </div>
          <p className="lb-label mb-3">
            Hücrelere tıklayarak renkleri tek tek değiştirebilirsin. Otomatik renkler: ağırlık/tekrar artarsa veya aynı kilo/tekrarda RIR iyileşirse <span style={{ color: 'var(--lb-gain)' }} className="font-semibold">yeşil</span>, düşerse <span style={{ color: 'var(--lb-drop)' }} className="font-semibold">kırmızı</span>, aynıysa <span className="font-semibold">gri</span>.
          </p>
          <div className="p-3 rounded-lg bg-(--color-bg-input) border lb-rule">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold">
                Durum renkleri ({isDark ? 'koyu tema' : 'açık tema'})
              </h4>
              {hasCustomStatusColors && (
                <button
                  onClick={resetStatusColors}
                  className="text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) hover:underline"
                >
                  Varsayılana dön
                </button>
              )}
            </div>
            <p className="lb-label mb-2.5">
              Kareye tıklayıp rengi değiştir. Koyu ve açık tema renkleri ayrı tutulur.
            </p>
            <div className="flex flex-wrap gap-3">
              {STATUS_OPTIONS.map(opt => (
                <label key={opt.value} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="color"
                    value={getStatusBgColor(opt.value)}
                    onChange={e => setStatusBgColor(opt.value, e.target.value)}
                    aria-label={`${opt.label} rengi`}
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border lb-rule p-0"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-(--color-bg-input) border lb-rule">
            <h4 className="text-xs font-semibold mb-3">Toplu renk uygula (görünür 4 hafta)</h4>
            <div className="grid md:grid-cols-[160px_1fr_1fr] gap-2 mb-2">
              <select
                value={bulkColorStatus}
                onChange={(e) => setBulkColorStatus(e.target.value as ExerciseStatus)}
                className="px-2 py-1.5 text-xs bg-(--color-bg-primary) border lb-rule rounded-lg focus:outline-none"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <div className="flex gap-2">
                <select
                  value={bulkRowExerciseId}
                  onChange={(e) => setBulkRowExerciseId(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs bg-(--color-bg-primary) border lb-rule rounded-lg focus:outline-none"
                >
                  <option value="">Satır seç</option>
                  {allExerciseIds.map(id => (
                    <option key={id} value={id}>{getExerciseName(id)}</option>
                  ))}
                </select>
                <button onClick={applyRowColor} className="lb-press px-2 py-1.5 text-xs font-medium rounded border lb-rule">Renk</button>
                <button onClick={clearRowColor} className="lb-press px-2 py-1.5 text-xs font-medium rounded border lb-rule">Renk sıfırla</button>
                <button onClick={deleteRowData} className="lb-press px-2 py-1.5 text-xs font-medium rounded border" style={{ borderColor: 'var(--lb-drop)', color: 'var(--lb-drop)' }}>Veri sil</button>
              </div>

              <div className="flex gap-2">
                <select
                  value={bulkColumnWeek ?? ''}
                  onChange={(e) => setBulkColumnWeek(e.target.value === '' ? null : Number(e.target.value))}
                  className="flex-1 px-2 py-1.5 text-xs bg-(--color-bg-primary) border lb-rule rounded-lg focus:outline-none"
                >
                  <option value="">Sütun seç</option>
                  {visibleWeeks.map(week => (
                    <option key={week} value={week}>H{getDisplayWeek(week)}</option>
                  ))}
                </select>
                <button onClick={applyColumnColor} className="lb-press px-2 py-1.5 text-xs font-medium rounded border lb-rule">Renk</button>
                <button onClick={clearColumnColor} className="lb-press px-2 py-1.5 text-xs font-medium rounded border lb-rule">Renk sıfırla</button>
                <button onClick={deleteColumnData} className="lb-press px-2 py-1.5 text-xs font-medium rounded border" style={{ borderColor: 'var(--lb-drop)', color: 'var(--lb-drop)' }}>Veri sil</button>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t lb-rule">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Egzersiz / set düzenle</h4>
              <button
                onClick={() => setShowProgramEditor(v => !v)}
                className="lb-press px-3 py-1.5 rounded-lg text-xs font-medium border lb-rule"
              >
                {showProgramEditor ? 'Kapat' : 'Aç'}
              </button>
            </div>

            {showProgramEditor && selectedProgram && (
              <div className="p-3 bg-(--color-bg-input) border lb-rule rounded-lg">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveProgramEdits();
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <label className="text-xs font-medium">Hafta</label>
                    <select
                      value={editorWeek ?? ''}
                      onChange={(e) => setEditorWeek(e.target.value === '' ? null : Number(e.target.value))}
                      className="px-2 py-1.5 text-xs bg-(--color-bg-primary) border lb-rule rounded-lg focus:outline-none"
                    >
                      {visibleWeeks.map(week => (
                        <option key={week} value={week}>H{getDisplayWeek(week)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedProgram) return;
                        const targetWeek = editorWeek ?? visibleWeeks[visibleWeeks.length - 1];
                        const ids = allExerciseIds.length > 0
                          ? allExerciseIds
                          : selectedProgram.exercises.filter(ex => ex.isActive).map(ex => ex.id);
                        setProgramEdits(ids.map(id => ({
                          id,
                          name: targetWeek !== undefined ? getExerciseDisplayNameForWeek(targetWeek, id) : getExerciseName(id),
                          defaultSets: getExerciseSets(id) ?? 1,
                        })));
                      }}
                      className="lb-press px-3 py-1.5 rounded-lg text-xs font-medium border lb-rule"
                    >
                      Yenile
                    </button>
                    <button
                      type="submit"
                      className="lb-press ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold border lb-rule-strong"
                    >
                      Kaydet
                    </button>
                  </div>

                  <p className="lb-label mb-2">Liste, aktif program + görünür haftadaki satırlarla eşleşir. Ok tuşlarıyla satır sırasını değiştir, sonra Kaydet.</p>

                  <div className="grid gap-2 max-h-64 overflow-auto pr-1">
                    {programEdits.map((row, rowIdx) => (
                      <div key={row.id} className="grid grid-cols-[auto_1fr_80px] gap-2">
                        <div className="flex flex-col justify-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setProgramEdits(prev => moveItem(prev, rowIdx, -1))}
                            disabled={rowIdx === 0}
                            aria-label={`${row.name} satırını yukarı taşı`}
                            className="lb-press px-1.5 leading-none text-xs rounded border lb-rule text-(--color-text-secondary) disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => setProgramEdits(prev => moveItem(prev, rowIdx, 1))}
                            disabled={rowIdx === programEdits.length - 1}
                            aria-label={`${row.name} satırını aşağı taşı`}
                            className="lb-press px-1.5 leading-none text-xs rounded border lb-rule text-(--color-text-secondary) disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            ▼
                          </button>
                        </div>
                        <input
                          value={row.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setProgramEdits(prev => prev.map(p => p.id === row.id ? { ...p, name: val } : p));
                          }}
                          className="px-3 py-2 text-sm bg-(--color-bg-primary) border lb-rule rounded-lg focus:outline-none"
                        />
                        <input
                          type="number"
                          min={1}
                          value={row.defaultSets}
                          onChange={(e) => {
                            const val = Number.parseInt(e.target.value, 10);
                            setProgramEdits(prev => prev.map(p => p.id === row.id ? { ...p, defaultSets: Number.isFinite(val) ? val : p.defaultSets } : p));
                          }}
                          className="px-2 py-2 text-sm text-center bg-(--color-bg-primary) border lb-rule rounded-lg focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

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
      <div className="flex items-center gap-3 mb-4">
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

        {/* Copies the whole phase, not the page on screen — hence its place next
            to the phase's own navigation rather than up in the title bar. */}
        <button
          onClick={handleCopyPhase}
          className="lb-press ml-auto px-3 py-1.5 text-sm font-medium border lb-rule rounded-lg"
          title={`${currentPhase.label} tablosunu Sheets için kopyala`}
        >
          {copyState === 'copied' ? '✓ Kopyalandı' : copyState === 'failed' ? '! Kopyalanamadı' : '📋 Kopyala'}
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
            const weekExercises = weekLog?.exercises ?? [];

            return (
              <div key={weekNum}>
                <div className="flex items-center justify-between pb-2 border-b lb-rule-strong mb-3">
                  <h3 className="text-sm font-semibold">H{getDisplayWeek(weekNum)}</h3>
                  {weekLog?.isHoliday ? (
                    <span className="lb-label font-semibold">Tatil</span>
                  ) : (
                    <span className="lb-label">{weekExercises.length} egzersiz</span>
                  )}
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
                            ? 'var(--color-text-primary)'
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
                              autoStatus: status,
                            });
                          }}
                          className="lb-press w-full text-left px-2 py-2.5 -mx-2 rounded-lg border-b lb-rule"
                        >
                          {/* Exercise name row */}
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-semibold">{exercise.exerciseName}</span>
                            <span className="text-[11px] font-semibold" style={{ color: statusColor }}>
                              {status === 'improved' ? '▲ İlerleme' : status === 'decreased' ? '▼ Düşüş' : status === 'new' ? '★ Yeni' : '= Aynı'}
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
                  <th key={w} className="px-3 py-3 text-center font-semibold min-w-[120px]">
                    H{getDisplayWeek(w)}
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

                    // Use per-cell override or auto-calculated status color
                    const bgColor = getCellColor(weekNum, exerciseId, status);

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
                            autoStatus: status,
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
        autoStatus={modalData?.autoStatus || 'same'}
        currentColorOverride={modalData ? getCellOverride(modalData.weekNumber, modalData.exerciseId) : undefined}
        onSetColor={(status) => {
          if (modalData) setCellColor(modalData.weekNumber, modalData.exerciseId, status);
        }}
        onRemoveColor={() => {
          if (modalData) removeCellColor(modalData.weekNumber, modalData.exerciseId);
        }}
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
