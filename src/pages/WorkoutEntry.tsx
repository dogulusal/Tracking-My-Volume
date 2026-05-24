import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePrograms } from '@/hooks/usePrograms';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { PageContainer } from '@/components/layout/PageContainer';
import { formatSet } from '@/utils/formatters';
import type { SetLog, Intensity, ExerciseLog } from '@/types';

const INTENSITY_OPTIONS: { value: Intensity; label: string }[] = [
  { value: 'failure', label: 'F' },
  { value: 'rir1', label: '1' },
  { value: 'rir2', label: '2' },
  { value: 'rir3', label: '3' },
];

export function WorkoutEntry() {
  const { programId, weekNumber: weekParam } = useParams();
  const navigate = useNavigate();
  const { getProgramById } = usePrograms();
  const { getLogForWeek, getPreviousLog, saveWorkout, setHoliday } = useWeekLogs();

  const weekNumber = Number(weekParam) || 0;
  const program = getProgramById(programId || '');
  const existingLog = getLogForWeek(programId || '', weekNumber);
  const previousLog = getPreviousLog(programId || '', weekNumber);

  const [isHoliday, setIsHoliday] = useState(existingLog?.isHoliday || false);
  const [notes, setNotes] = useState(existingLog?.notes || '');
  const [date, setDate] = useState(
    existingLog?.date || new Date().toISOString().split('T')[0]
  );
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Initialize exercise logs
  useEffect(() => {
    if (!program) return;

    const activeExercises = program.exercises.filter(e => e.isActive);

    if (existingLog && existingLog.exercises.length > 0) {
      setExerciseLogs(existingLog.exercises);
    } else {
      const initial: ExerciseLog[] = activeExercises.map(ex => ({
        exerciseId: ex.id,
        exerciseName: ex.name,
        sets: Array.from({ length: ex.defaultSets }, () => ({
          weight: ex.defaultWeight,
          reps: ex.defaultReps,
          intensity: 'failure' as Intensity,
        })),
      }));
      setExerciseLogs(initial);
    }
  }, [program, existingLog]);

  // Draft save to localStorage
  const draftKey = `draft-${programId}-${weekNumber}`;

  useEffect(() => {
    if (isDirty) {
      localStorage.setItem(draftKey, JSON.stringify({ exerciseLogs, notes, date, isHoliday }));
    }
  }, [exerciseLogs, notes, date, isHoliday, isDirty, draftKey]);

  // Load draft on mount
  useEffect(() => {
    const draft = localStorage.getItem(draftKey);
    if (draft && !existingLog) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.exerciseLogs) setExerciseLogs(parsed.exerciseLogs);
        if (parsed.notes) setNotes(parsed.notes);
        if (parsed.date) setDate(parsed.date);
        if (parsed.isHoliday !== undefined) setIsHoliday(parsed.isHoliday);
      } catch { /* ignore */ }
    }
  }, [draftKey, existingLog]);

  const updateSet = useCallback((exerciseIdx: number, setIdx: number, field: keyof SetLog, value: number | Intensity) => {
    setExerciseLogs(prev => {
      const updated = [...prev];
      const exercise = { ...updated[exerciseIdx] };
      const sets = [...exercise.sets];
      sets[setIdx] = { ...sets[setIdx], [field]: value };
      exercise.sets = sets;
      updated[exerciseIdx] = exercise;
      return updated;
    });
    setIsDirty(true);
  }, []);

  const addSet = useCallback((exerciseIdx: number) => {
    setExerciseLogs(prev => {
      const updated = [...prev];
      const exercise = { ...updated[exerciseIdx] };
      const lastSet = exercise.sets[exercise.sets.length - 1];
      exercise.sets = [...exercise.sets, { ...lastSet }];
      updated[exerciseIdx] = exercise;
      return updated;
    });
    setIsDirty(true);
  }, []);

  const removeSet = useCallback((exerciseIdx: number, setIdx: number) => {
    setExerciseLogs(prev => {
      const updated = [...prev];
      const exercise = { ...updated[exerciseIdx] };
      if (exercise.sets.length <= 1) return prev;
      exercise.sets = exercise.sets.filter((_, i) => i !== setIdx);
      updated[exerciseIdx] = exercise;
      return updated;
    });
    setIsDirty(true);
  }, []);

  const handleSave = () => {
    if (!programId) return;

    if (isHoliday) {
      setHoliday(programId, weekNumber);
    } else {
      saveWorkout({
        weekNumber,
        programId,
        date,
        exercises: exerciseLogs,
        notes,
        isHoliday: false,
        updatedAt: new Date().toISOString(),
      });
    }

    localStorage.removeItem(draftKey);
    navigate('/');
  };

  const getPreviousSetRef = useMemo(() => {
    if (!previousLog) return () => null;
    return (exerciseId: string, setIdx: number): SetLog | null => {
      const prevExercise = previousLog.exercises.find(e => e.exerciseId === exerciseId);
      return prevExercise?.sets[setIdx] || null;
    };
  }, [previousLog]);

  if (!program) {
    return (
      <PageContainer>
        <p className="text-(--color-text-muted)">Program bulunamadı.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <button
            onClick={() => navigate('/')}
            className="text-sm font-semibold text-(--color-text-muted) hover:text-(--color-accent) mb-1 transition-colors"
          >
            ← Geri
          </button>
          <h1 className="text-3xl font-black tracking-tight">{program.name}</h1>
          <p className="text-sm font-bold text-(--color-accent)">Hafta {weekNumber}</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => { setDate(e.target.value); setIsDirty(true); }}
          className="px-4 py-2.5 bg-(--color-bg-input) border border-(--color-border) rounded-lg text-sm font-semibold focus:outline-none focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)"
        />
      </div>

      {/* Holiday Toggle */}
      <label className="flex items-center gap-3 p-4 bg-(--color-bg-card) rounded-xl border border-(--color-border) mb-6 cursor-pointer hover:border-(--color-accent)/30 transition-colors">
        <input
          type="checkbox"
          checked={isHoliday}
          onChange={e => { setIsHoliday(e.target.checked); setIsDirty(true); }}
          className="w-5 h-5 accent-(--color-accent) rounded"
        />
        <span className="text-sm font-bold">Bu günü tatil olarak işaretle</span>
      </label>

      {/* Exercise Cards */}
      {!isHoliday && (
        <div className="space-y-5">
          {exerciseLogs.map((exercise, exIdx) => (
            <div
              key={exercise.exerciseId}
              className="bg-(--color-bg-card) rounded-xl p-5 border border-(--color-border) shadow-sm"
            >
              <h3 className="font-extrabold text-lg mb-4">{exercise.exerciseName}</h3>

              {/* Sets */}
              <div className="space-y-2.5">
                {exercise.sets.map((set, setIdx) => {
                  const prevSet = getPreviousSetRef(exercise.exerciseId, setIdx);
                  return (
                    <div key={setIdx} className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-(--color-accent) w-8">S{setIdx + 1}</span>

                      {/* Weight */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={set.weight}
                          onChange={e => updateSet(exIdx, setIdx, 'weight', Number(e.target.value))}
                          step={0.5}
                          min={0}
                          className="w-16 px-2 py-1.5 bg-(--color-bg-input) border border-(--color-border) rounded-lg text-sm font-set font-bold focus:outline-none focus:border-(--color-accent)"
                        />
                        <span className="text-xs font-bold text-(--color-text-muted)">kg</span>
                      </div>

                      {/* Reps */}
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={set.reps}
                          onChange={e => updateSet(exIdx, setIdx, 'reps', Number(e.target.value))}
                          min={0}
                          className="w-14 px-2 py-1.5 bg-(--color-bg-input) border border-(--color-border) rounded-lg text-sm font-set font-bold focus:outline-none focus:border-(--color-accent)"
                        />
                        <span className="text-xs font-bold text-(--color-text-muted)">rep</span>
                      </div>

                      {/* Intensity */}
                      <div className="flex gap-1">
                        {INTENSITY_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => updateSet(exIdx, setIdx, 'intensity', opt.value)}
                            className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                              set.intensity === opt.value
                                ? 'bg-(--color-accent) text-white scale-110 shadow-md'
                                : 'bg-(--color-btn-bg) text-(--color-text-secondary) hover:bg-(--color-btn-hover)'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Remove set */}
                      {exercise.sets.length > 1 && (
                        <button
                          onClick={() => removeSet(exIdx, setIdx)}
                          className="text-red-400 hover:text-red-300 text-xs font-bold ml-1"
                        >
                          ✕
                        </button>
                      )}

                      {/* Previous reference */}
                      {prevSet && (
                        <span className="text-xs text-(--color-text-muted) font-set ml-auto">
                          Geçen: {formatSet(prevSet)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add set button */}
              <button
                onClick={() => addSet(exIdx)}
                className="mt-3 text-xs font-bold text-(--color-accent) hover:text-(--color-accent-hover) transition-colors"
              >
                + Set Ekle
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div className="mt-6">
        <label className="block text-sm font-bold text-(--color-text-primary) mb-2">
          Antrenman Notu
        </label>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); setIsDirty(true); }}
          placeholder="Bu antrenman hakkında not..."
          rows={3}
          className="w-full px-4 py-3 bg-(--color-bg-input) border border-(--color-border) rounded-xl text-sm resize-none focus:outline-none focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)"
        />
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="mt-6 w-full sm:w-auto px-10 py-3.5 bg-(--color-accent) hover:bg-(--color-accent-hover) text-white font-black text-base rounded-xl transition-all active:scale-95 hover:scale-105 shadow-lg shadow-(--color-accent-glow)"
      >
        Kaydet
      </button>
    </PageContainer>
  );
}
