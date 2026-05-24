import { useState, useMemo, useEffect, useContext } from 'react';
import { usePrograms } from '@/hooks/usePrograms';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useColorSettings } from '@/hooks/useColorSettings';
import { PageContainer } from '@/components/layout/PageContainer';
import { WorkoutDetailModal } from '@/components/shared/WorkoutDetailModal';
import { calculateExerciseStatus } from '@/utils/statusCalculator';
import { formatSets } from '@/utils/formatters';
import { AppContext } from '@/context/AppContext';
import type { ExerciseLog, ExerciseStatus } from '@/types';

type HistoryPhase = {
  label: string;
  weeks: number[];
  baseWeek: number;
};

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

export function History() {
  const { programs, updateProgram } = usePrograms();
  const { weekLogs, currentWeek, saveWorkout, incrementWeek } = useWeekLogs();
  const { getCellColor, setCellColor, removeCellColor, getCellOverride, resetAllOverrides } = useColorSettings();
  const ctx = useContext(AppContext);
  const contextPhases = ctx?.state.phases ?? [];

  const [selectedProgramId, setSelectedProgramId] = useState<string>(programs[0]?.id || '');
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

  const PAGE_SIZE = 4;

  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(() => phases.length - 1);
  const currentPhase = phases[selectedPhaseIdx] || phases[0];

  const getDisplayWeek = (weekNum: number): number => weekNum - currentPhase.baseWeek;

  // Pagination: default to last page of the initial phase
  const [pageStart, setPageStart] = useState(() => {
    const initPhase = phases[phases.length - 1] || phases[0];
    if (!initPhase || initPhase.weeks.length === 0) return 0;
    return Math.floor((initPhase.weeks.length - 1) / PAGE_SIZE) * PAGE_SIZE;
  });
  const visibleWeeks = useMemo(() => {
    return currentPhase.weeks.slice(pageStart, pageStart + PAGE_SIZE);
  }, [currentPhase, pageStart]);

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
    return Array.from(ids);
  }, [programLogs, visibleWeeks, selectedProgram]);

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
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Antrenman Geçmişi</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={incrementWeek}
            className="px-3 py-1.5 bg-(--color-accent) hover:bg-(--color-accent-hover) text-white text-xs font-bold rounded-lg transition-all hover:scale-105 active:scale-95"
          >
            + Yeni Hafta
          </button>
          <button
            onClick={() => setShowColorSettings(s => !s)}
            className={`p-2 rounded-lg transition-all text-lg ${
              showColorSettings ? 'bg-(--color-accent) text-white' : 'bg-(--color-btn-bg) text-(--color-text-muted) hover:text-(--color-text-primary)'
            }`}
            title="Renk Ayarları"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Color Settings Panel */}
      {showColorSettings && (
        <div className="mb-5 bg-(--color-bg-card) rounded-xl border border-(--color-border) p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black uppercase tracking-wider">Renk Ayarları</h3>
            <button
              onClick={resetAllOverrides}
              className="text-xs font-bold text-(--color-accent) hover:underline"
            >
              Tüm Overrideları Sıfırla
            </button>
          </div>
          <p className="text-xs text-(--color-text-secondary) mb-3">
            Hücrelere tıklayarak renkleri tek tek değiştirebilirsin. Otomatik renkler: ağırlık/tekrar artarsa <span className="text-emerald-400 font-bold">yeşil</span>, düşerse <span className="text-rose-400 font-bold">kırmızı</span>, aynıysa <span className="text-(--color-text-muted) font-bold">gri</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded bg-emerald-800 inline-block"></span> İlerleme</span>
            <span className="inline-flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded bg-rose-900 inline-block"></span> Düşüş</span>
            <span className="inline-flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded bg-gray-700 inline-block"></span> Aynı</span>
            <span className="inline-flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded bg-blue-900 inline-block"></span> Yeni</span>
            <span className="inline-flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded bg-yellow-800 inline-block"></span> Tatil</span>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-(--color-bg-input) border border-(--color-border)">
            <h4 className="text-xs font-black uppercase tracking-wider mb-3">Toplu Renk Uygula (Görünür 4 Hafta)</h4>
            <div className="grid md:grid-cols-[160px_1fr_1fr] gap-2 mb-2">
              <select
                value={bulkColorStatus}
                onChange={(e) => setBulkColorStatus(e.target.value as ExerciseStatus)}
                className="px-2 py-1.5 text-xs bg-(--color-bg-primary) border border-(--color-border) rounded-lg focus:outline-none"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <div className="flex gap-2">
                <select
                  value={bulkRowExerciseId}
                  onChange={(e) => setBulkRowExerciseId(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs bg-(--color-bg-primary) border border-(--color-border) rounded-lg focus:outline-none"
                >
                  <option value="">Satır Seç</option>
                  {allExerciseIds.map(id => (
                    <option key={id} value={id}>{getExerciseName(id)}</option>
                  ))}
                </select>
                <button onClick={applyRowColor} className="px-2 py-1.5 text-xs font-bold rounded bg-(--color-accent) text-white">Renk</button>
                <button onClick={clearRowColor} className="px-2 py-1.5 text-xs font-bold rounded bg-(--color-btn-bg)">Renk Sıfırla</button>
                <button onClick={deleteRowData} className="px-2 py-1.5 text-xs font-bold rounded bg-rose-900 text-white hover:bg-rose-800">Veri Sil</button>
              </div>

              <div className="flex gap-2">
                <select
                  value={bulkColumnWeek ?? ''}
                  onChange={(e) => setBulkColumnWeek(e.target.value === '' ? null : Number(e.target.value))}
                  className="flex-1 px-2 py-1.5 text-xs bg-(--color-bg-primary) border border-(--color-border) rounded-lg focus:outline-none"
                >
                  <option value="">Sütun Seç</option>
                  {visibleWeeks.map(week => (
                    <option key={week} value={week}>H{getDisplayWeek(week)}</option>
                  ))}
                </select>
                <button onClick={applyColumnColor} className="px-2 py-1.5 text-xs font-bold rounded bg-(--color-accent) text-white">Renk</button>
                <button onClick={clearColumnColor} className="px-2 py-1.5 text-xs font-bold rounded bg-(--color-btn-bg)">Renk Sıfırla</button>
                <button onClick={deleteColumnData} className="px-2 py-1.5 text-xs font-bold rounded bg-rose-900 text-white hover:bg-rose-800">Veri Sil</button>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-(--color-border)">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-black uppercase tracking-wider">Egzersiz / Set Düzenle</h4>
              <button
                onClick={() => setShowProgramEditor(v => !v)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-(--color-btn-bg) text-(--color-text-secondary) hover:bg-(--color-btn-hover)"
              >
                {showProgramEditor ? 'Kapat' : 'Aç'}
              </button>
            </div>

            {showProgramEditor && selectedProgram && (
              <div className="p-3 bg-(--color-bg-input) border border-(--color-border) rounded-xl">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveProgramEdits();
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <label className="text-xs font-bold">Hafta</label>
                    <select
                      value={editorWeek ?? ''}
                      onChange={(e) => setEditorWeek(e.target.value === '' ? null : Number(e.target.value))}
                      className="px-2 py-1.5 text-xs bg-(--color-bg-primary) border border-(--color-border) rounded-lg focus:outline-none"
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
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-(--color-btn-bg) hover:bg-(--color-btn-hover)"
                    >
                      Yenile
                    </button>
                    <button
                      type="submit"
                      className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-(--color-accent) text-white hover:bg-(--color-accent-hover)"
                    >
                      Kaydet
                    </button>
                  </div>

                  <p className="text-xs text-(--color-text-secondary) mb-2">Liste, aktif program + görünür haftadaki satırlarla eşleşir.</p>

                  <div className="grid gap-2 max-h-64 overflow-auto pr-1">
                    {programEdits.map((row) => (
                      <div key={row.id} className="grid grid-cols-[1fr_80px] gap-2">
                        <input
                          value={row.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setProgramEdits(prev => prev.map(p => p.id === row.id ? { ...p, name: val } : p));
                          }}
                          className="px-3 py-2 text-sm bg-(--color-bg-primary) border border-(--color-border) rounded-lg focus:border-(--color-accent) focus:outline-none"
                        />
                        <input
                          type="number"
                          min={1}
                          value={row.defaultSets}
                          onChange={(e) => {
                            const val = Number.parseInt(e.target.value, 10);
                            setProgramEdits(prev => prev.map(p => p.id === row.id ? { ...p, defaultSets: Number.isFinite(val) ? val : p.defaultSets } : p));
                          }}
                          className="px-2 py-2 text-sm text-center bg-(--color-bg-primary) border border-(--color-border) rounded-lg focus:border-(--color-accent) focus:outline-none"
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

      {/* Program Filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {programs.sort((a, b) => a.order - b.order).map(p => (
          <button
            key={p.id}
            onClick={() => { setSelectedProgramId(p.id); setPageStart(0); }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              selectedProgramId === p.id
                ? 'bg-(--color-accent) text-white shadow-lg shadow-(--color-accent-glow) scale-105'
                : 'bg-(--color-btn-bg) text-(--color-text-secondary) hover:bg-(--color-btn-hover) hover:scale-105'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Phase selector (if multiple phases exist) */}
      {phases.length > 1 && (
        <div className="flex items-center gap-2 mb-3">
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedPhaseIdx === idx
                  ? 'bg-(--color-accent) text-white'
                  : 'bg-(--color-btn-bg) text-(--color-text-secondary) hover:bg-(--color-btn-hover)'
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
          className="px-3 py-1.5 text-sm font-semibold bg-(--color-btn-bg) rounded-lg hover:bg-(--color-btn-hover) disabled:opacity-30 text-(--color-text-primary) transition-all"
        >
          ← Önceki
        </button>
        <span className="text-sm font-bold text-(--color-text-secondary)">
          H{getDisplayWeek(visibleWeeks[0] ?? currentPhase.baseWeek)} — H{getDisplayWeek(visibleWeeks[visibleWeeks.length - 1] ?? currentPhase.baseWeek)}
        </span>
        <button
          onClick={() => setPageStart(s => s + PAGE_SIZE)}
          disabled={pageStart + PAGE_SIZE >= currentPhase.weeks.length}
          className="px-3 py-1.5 text-sm font-semibold bg-(--color-btn-bg) rounded-lg hover:bg-(--color-btn-hover) disabled:opacity-30 text-(--color-text-primary) transition-all"
        >
          Sonraki →
        </button>
      </div>

      {/* Table */}
      {programs.length === 0 ? (
        <p className="text-(--color-text-muted)">Henüz program yok.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-(--color-border) shadow-sm [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-(--color-border)">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-(--color-bg-card)">
                <th className="sticky left-0 bg-(--color-bg-card) z-10 px-3 py-3 text-left font-bold text-(--color-text-primary) border-r border-(--color-border) min-w-[140px]">
                  Egzersiz
                </th>
                <th className="px-3 py-3 text-center font-bold text-(--color-text-primary) border-r border-(--color-border) min-w-[60px]">
                  Set
                </th>
                {visibleWeeks.map(w => (
                  <th key={w} className="px-3 py-3 text-center font-bold text-(--color-text-primary) min-w-[120px]">
                    H{getDisplayWeek(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allExerciseIds.map(exerciseId => (
                <tr key={exerciseId} className="border-t border-(--color-border)">
                  <td className="sticky left-0 bg-(--color-bg-primary) z-10 px-3 py-2.5 font-bold text-xs border-r border-(--color-border)">
                    {getExerciseName(exerciseId)}
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold text-xs border-r border-(--color-border) text-(--color-text-secondary)">
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
                        className="px-2 py-2.5 text-center font-set text-sm cursor-pointer border-l border-(--color-border) transition-all hover:scale-[1.02] hover:shadow-sm font-bold whitespace-pre-line leading-5"
                      >
                        {weekLog?.isHoliday ? null : log ? (
                          formatSets(log.sets)
                        ) : (
                          <span className="text-(--color-text-muted)">—</span>
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
        <div className="mt-5 bg-(--color-bg-card) rounded-xl border border-(--color-border) p-5 shadow-sm">
          <h3 className="text-sm font-black text-(--color-text-primary) mb-3 uppercase tracking-wider">Notlar</h3>
          <div className="grid gap-2.5">
            {weekNotes.map(({ week, notes }) => (
              <div key={week} className="flex gap-3 items-start text-sm">
                <span className="shrink-0 font-mono text-xs font-bold bg-(--color-accent) text-white px-2 py-1 rounded-md shadow-sm">
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
