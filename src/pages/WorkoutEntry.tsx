import { AppContext } from '@/context/AppContext';
import { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { usePrograms } from '@/hooks/usePrograms';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { PageContainer } from '@/components/layout/PageContainer';
import { Modal } from '@/components/shared/Modal';
import { formatSetLine } from '../../supabase/functions/_shared/historyGrid.mjs';
import { formatSet } from '@/utils/formatters';
import { moveItem } from '@/utils/reorder';
import { addMovementsFromWorkout, syncExerciseLogs, syncProgramFromWorkout } from '@/utils/exerciseSync';
import { searchMovements } from '@/data/movementLibrary';
import { staleRecordAge } from '@/utils/weekAdvance';
import { REGIONS, REGION_HINTS, muscleRegions } from '@/data/muscleRegions';
import { exerciseKey } from '@/utils/muscleGroups';
import { movementSessions, sessionsBefore, type MovementSession } from '@/utils/movements';
import { STALL_WEEKS, bestSet, nextTarget, previousRecord, progressionRule, stallOf, type ProgressionRule, type Stall, type Target } from '@/utils/progression';
import { weekName } from '@/utils/phases';
import type { SetLog, Intensity, ExerciseLog } from '@/types';
import { dayNotesOn, useComments } from '@/coach/comments';

const INTENSITY_OPTIONS: { value: Intensity; label: string }[] = [
  { value: 'failure', label: 'F' },
  { value: 'rir1', label: '1' },
  { value: 'rir2', label: '2' },
  { value: 'rir3', label: '3' },
];
const roundWeight = (weight: number) => Math.round(weight * 100) / 100;
// A field still at zero shows its placeholder: nothing has been entered yet.
const blankIfZero = (value: string) => (value === '0' ? '' : value);
const RESERVE: Record<string, number> = { failure: 0, rir1: 1, rir2: 2, rir3: 3 };
const TONE = {
  gain: { color: 'var(--lb-gain)', fill: 'var(--lb-gain-fill)' },
  drop: { color: 'var(--lb-drop)', fill: 'var(--lb-drop-fill)' },
  ref: { color: 'var(--lb-ref)', fill: 'var(--lb-ref-fill)' },
  same: { color: 'var(--color-text-secondary)', fill: 'var(--color-bg-input)' },
};

// This set against the same set last time, in words: weight first, then reps.
// Reserve alone is not called better or worse while the set is still being
// entered — every new day starts at F.
function compareToPrevious(set: SetLog, prev: SetLog | null): { text: string; tone: keyof typeof TONE } {
  if (!prev) return { text: 'İlk kayıt', tone: 'ref' };
  if (set.weight > prev.weight) return { text: `Geçen haftadan ${roundWeight(set.weight - prev.weight)} kg fazla`, tone: 'gain' };
  if (set.weight < prev.weight) return { text: `Geçen haftadan ${roundWeight(prev.weight - set.weight)} kg az`, tone: 'drop' };
  if (set.reps > prev.reps) return { text: `Geçen haftadan ${set.reps - prev.reps} tekrar fazla`, tone: 'gain' };
  if (set.reps < prev.reps) return { text: `Geçen haftadan ${prev.reps - set.reps} tekrar az`, tone: 'drop' };
  if ((RESERVE[set.intensity] ?? 0) !== (RESERVE[prev.intensity] ?? 0)) return { text: `Kilo ve tekrar aynı · geçen ${formatSetLine(prev)}`, tone: 'same' };
  return { text: 'Geçen haftayla aynı', tone: 'same' };
}
const FIRST_HINT_KEY = 'tmv-ipucu-set';
const REST_TIMER_KEY = 'rest-timer-default-sec';
const REST_TIMER_RECENTS_KEY = 'rest-timer-recent-sec';
const TIMER_END_AT_KEY = 'rest-timer-end-at';
const MAX_RECENT_DURATIONS = 3;

// 1-second silent WAV (8000 Hz, 8-bit mono) — keeps iOS audio session alive when screen locks
const SILENT_WAV_URL = (() => {
  try {
    const rate = 8000;
    const buf = new ArrayBuffer(44 + rate);
    const v = new DataView(buf);
    const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + rate, true);
    ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true);
    v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    ws(36, 'data'); v.setUint32(40, rate, true);
    for (let i = 0; i < rate; i++) v.setUint8(44 + i, 128);
    const bytes = new Uint8Array(buf);
    let b = ''; bytes.forEach(x => { b += String.fromCharCode(x); });
    return 'data:audio/wav;base64,' + btoa(b);
  } catch { return ''; }
})();

// Pure formatter — outside component so interval callbacks use it without deps
function formatTimer(totalSec: number): string {
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function WorkoutEntry() {
  const { programId, weekNumber: weekParam } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnPath = searchParams.get('from') === 'history' ? '/history' : '/';
  const { getProgramById, updateProgram } = usePrograms(Number(weekParam) || 0);
  const { getLogForWeek, saveWorkout } = useWeekLogs();

  const weekNumber = Number(weekParam) || 0;
  const coachComments = useComments();
  // The coach's notes on this workout as a whole, shown as it starts.
  const coachDayNotes = programId ? dayNotesOn(coachComments.list, programId, weekNumber) : [];
  const ctx = useContext(AppContext);
  const phase = ctx?.state.phases.find(p => weekNumber >= p.startWeek && (p.endWeek === null || weekNumber <= p.endWeek));
  const program = getProgramById(programId || '');
  const existingLog = getLogForWeek(programId || '', weekNumber);
  // The workout this one is measured against, as History colours it: the
  // nearest earlier one in the phase, passing over holidays and hard days
  // (unless only hard days are left).
  const earlierInPhase = (ctx?.state.weekLogs ?? [])
    .filter(log => log.programId === programId && log.weekNumber < weekNumber && log.weekNumber >= (phase?.startWeek ?? 0) && !log.isHoliday)
    .sort((a, b) => b.weekNumber - a.weekNumber);
  const previousLog = earlierInPhase.find(log => !log.offDay) ?? earlierInPhase[0] ?? null;

  const [isHoliday, setIsHoliday] = useState(existingLog?.isHoliday || false);
  const [offDay, setOffDay] = useState(existingLog?.offDay || false);
  const [notes, setNotes] = useState(existingLog?.notes || '');
  const [date, setDate] = useState(
    existingLog?.date || new Date().toISOString().split('T')[0]
  );
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [restDurationSec, setRestDurationSec] = useState<number>(() => {
    const saved = localStorage.getItem(REST_TIMER_KEY);
    const parsed = saved ? Number(saved) : 90;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
  });
  const [timerRemainingSec, setTimerRemainingSec] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [customDurationInput, setCustomDurationInput] = useState('');
  const [customDurationUnit, setCustomDurationUnit] = useState<'sec' | 'min'>('sec');
  const [recentDurations, setRecentDurations] = useState<number[]>(() => {
    const saved = localStorage.getItem(REST_TIMER_RECENTS_KEY);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved) as number[];
      return Array.isArray(parsed)
        ? parsed.filter(v => Number.isFinite(v) && v > 0).slice(0, MAX_RECENT_DURATIONS)
        : [];
    } catch {
      return [];
    }
  });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const [timerJustFinished, setTimerJustFinished] = useState(false);
  const [setInputDrafts, setSetInputDrafts] = useState<Record<string, string>>({});
  const [orderDiffersFromProgram, setOrderDiffersFromProgram] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pinnedEdit, setPinnedEdit] = useState<{ key: string; text: string } | null>(null);
  const editedExerciseIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerTotalRef = useRef(restDurationSec);
  const timerEndAtRef = useRef<number | null>(null);
  // Persistent AudioContext — unlocked via user gesture so iOS allows playback later
  const audioContextRef = useRef<AudioContext | null>(null);
  // WakeLock — keeps screen on while timer counts down
  const wakeLockRef = useRef<{ release(): Promise<void> } | null>(null);
  // Silent audio element — keeps iOS audio session alive when screen locks
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Pre-scheduled oscillators — cancelled if user stops timer early
  const scheduledOscillatorsRef = useRef<OscillatorNode[]>([]);

  const draftKey = `draft-${programId}-${weekNumber}`;

  const allLogs = ctx?.state.weekLogs;
  const allPhases = ctx?.state.phases ?? [];
  const nameOfWeek = (week: number) => weekName(allPhases, week, ctx?.state.currentWeek ?? weekNumber);
  const exerciseSettings = ctx?.state.exerciseSettings;
  // The last time this day was trained, in any phase. Its note is mostly a
  // message to this workout ("pulldown ağırlık düşülebilir").
  const previousNoteLog = useMemo(() => (allLogs ?? [])
    .filter(log => log.programId === programId && log.weekNumber < weekNumber && !log.isHoliday)
    .sort((a, b) => b.weekNumber - a.weekNumber)[0], [allLogs, programId, weekNumber]);
  // Per exercise, from its sessions before this workout: the note the last
  // one left, the progression rule, the next target and how long it has been
  // stuck. Keyed on names only, so typing a set does not recompute it (the
  // rest timer alone re-renders twice a second).
  const exerciseNames = exerciseLogs.map(exercise => `${exercise.exerciseId}\u0000${exercise.exerciseName}`).join('\n');
  const movementInfo = useMemo(() => {
    const info = new Map<string, {
      lastNote: MovementSession | null; rule: ProgressionRule; target: Target | null; stall: Stall | null;
    }>();
    for (const line of exerciseNames ? exerciseNames.split('\n') : []) {
      const [exerciseId, name] = line.split('\u0000');
      const key = exerciseKey(name);
      const before = sessionsBefore(movementSessions(allLogs ?? [], key), { programId: programId ?? '', weekNumber, date });
      const last = before[before.length - 1];
      const rule = progressionRule(before, exerciseSettings?.[key]);
      const previousSets = previousRecord(allLogs ?? [], programId ?? '', exerciseId, weekNumber);
      info.set(exerciseId, {
        lastNote: last?.exercise.note?.trim() ? last : null,
        rule,
        target: previousSets ? nextTarget(previousSets, rule) : null,
        stall: stallOf(before),
      });
    }
    return info;
  }, [exerciseNames, allLogs, programId, weekNumber, date, exerciseSettings]);
  const [ruleEdit, setRuleEdit] = useState<{ key: string; repTop: string; step: string } | null>(null);
  const saveRule = (reset = false) => {
    if (!ruleEdit) return;
    const repTop = Number(ruleEdit.repTop.replace(',', '.'));
    const step = Number(ruleEdit.step.replace(',', '.'));
    ctx?.dispatch({ type: 'SET_EXERCISE_SETTINGS', payload: { key: ruleEdit.key, settings: reset ? { repTop: undefined, step: undefined } : {
      repTop: Number.isInteger(repTop) && repTop > 0 ? repTop : undefined,
      step: step > 0 && step <= 50 ? step : undefined,
    } } });
    setRuleEdit(null);
  };
  const programName = (id: string) => ctx?.state.programs.find(item => item.id === id)?.name ?? '';

  const updateExerciseNote = (exerciseIdx: number, note: string) => {
    setExerciseLogs(prev => prev.map((exercise, index) => index === exerciseIdx ? { ...exercise, note } : exercise));
    setIsDirty(true);
  };
  // A pinned note is a setting of the movement, saved at once rather than
  // with the workout.
  const savePinned = () => {
    if (!pinnedEdit) return;
    ctx?.dispatch({ type: 'SET_EXERCISE_SETTINGS', payload: { key: pinnedEdit.key, settings: { note: pinnedEdit.text.trim() } } });
    setPinnedEdit(null);
  };

  // Populate the form exactly ONCE per program+week. `program`/`existingLog`/
  // `previousLog` are plain finds over context state, so a cloud sync (which
  // replaces every object in state) changes their identity and used to re-run
  // this effect — overwriting whatever the user was typing. Backgrounding the
  // app on mobile triggers exactly that via the visibilitychange pull.
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!program) return;
    if (initializedKeyRef.current === draftKey) return;
    initializedKeyRef.current = draftKey;

    // 1) Unsaved draft wins — unless the stored log was saved more recently
    //    (e.g. another device pushed a newer version of this week).
    const rawDraft = localStorage.getItem(draftKey);
    if (rawDraft) {
      try {
        const draft = JSON.parse(rawDraft) as {
          exerciseLogs?: ExerciseLog[];
          notes?: string;
          date?: string;
          isHoliday?: boolean;
          offDay?: boolean;
          savedAt?: string;
          completedSets?: Record<string, boolean>;
        };
        const draftIsStale =
          existingLog?.updatedAt != null &&
          draft.savedAt != null &&
          existingLog.updatedAt > draft.savedAt;

        if (Array.isArray(draft.exerciseLogs) && !draftIsStale) {
          setExerciseLogs(syncExerciseLogs(program, draft.exerciseLogs, ex => ({
            exerciseId: ex.id, exerciseName: ex.name,
            sets: Array.from({ length: ex.defaultSets }, () => ({ weight: ex.defaultWeight, reps: ex.defaultReps, intensity: 'failure' as Intensity })),
          })));
          if (draft.completedSets && typeof draft.completedSets === 'object') setCompletedSets(draft.completedSets);
          if (typeof draft.notes === 'string') setNotes(draft.notes);
          if (typeof draft.date === 'string') setDate(draft.date);
          if (typeof draft.isHoliday === 'boolean') setIsHoliday(draft.isHoliday);
          if (typeof draft.offDay === 'boolean') setOffDay(draft.offDay);
          setIsDirty(true); // keep persisting it until the user saves
          return;
        }
        if (draftIsStale) localStorage.removeItem(draftKey);
      } catch {
        localStorage.removeItem(draftKey); // corrupted draft
      }
    }

    // 2) Previously saved week
    if (existingLog) {
      setExerciseLogs(syncExerciseLogs(program, existingLog.exercises, ex => ({
        exerciseId: ex.id, exerciseName: ex.name,
        sets: Array.from({ length: ex.defaultSets }, () => ({ weight: ex.defaultWeight, reps: ex.defaultReps, intensity: 'failure' as Intensity })),
      })));
      setNotes(existingLog.notes || '');
      setDate(existingLog.date);
      setIsHoliday(existingLog.isHoliday || false);
      setOffDay(existingLog.offDay || false);
      return;
    }

    // 3) Fresh week — prefill from last week's numbers
    const initial: ExerciseLog[] = program.exercises
      .filter(e => e.isActive)
      .map(ex => {
        const previousSets = previousLog?.exercises.find(prev => prev.exerciseId === ex.id)?.sets ?? [];

        if (previousSets.length > 0) {
          return {
            exerciseId: ex.id,
            exerciseName: ex.name,
            // Weight/reps are a useful starting point; intensity is not — it
            // describes the set you actually performed, so it resets to F.
            sets: Array.from({ length: ex.defaultSets }, (_, index) => ({
              weight: (previousSets[index] ?? previousSets[previousSets.length - 1]).weight,
              reps: (previousSets[index] ?? previousSets[previousSets.length - 1]).reps,
              intensity: 'failure' as Intensity,
            })),
          };
        }

        return {
          exerciseId: ex.id,
          exerciseName: ex.name,
          sets: Array.from({ length: ex.defaultSets }, () => ({
            weight: ex.defaultWeight,
            reps: ex.defaultReps,
            intensity: 'failure' as Intensity,
          })),
        };
      });
    setExerciseLogs(initial);
  }, [program, existingLog, previousLog, draftKey]);

  // Draft save to localStorage — survives iOS evicting the page on app switch
  useEffect(() => {
    if (!isDirty) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ exerciseLogs, notes, date, isHoliday, offDay, completedSets, savedAt: new Date().toISOString() })
      );
      setDraftStatus('saved');
    } catch { setDraftStatus('error'); }
  }, [exerciseLogs, notes, date, isHoliday, offDay, isDirty, draftKey, completedSets]);

  useEffect(() => {
    localStorage.setItem(REST_TIMER_KEY, String(restDurationSec));
  }, [restDurationSec]);

  useEffect(() => {
    localStorage.setItem(REST_TIMER_RECENTS_KEY, JSON.stringify(recentDurations));
  }, [recentDurations]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      scheduledOscillatorsRef.current.forEach(o => { try { o.disconnect(); } catch { /* */ } });
      void audioContextRef.current?.close();
      void wakeLockRef.current?.release();
      silentAudioRef.current?.pause();
    };
  }, []);

  const updateSet = useCallback((exerciseIdx: number, setIdx: number, field: keyof SetLog, value: number | Intensity) => {
    setExerciseLogs(prev => {
      if (prev[exerciseIdx]) editedExerciseIdsRef.current.add(prev[exerciseIdx].exerciseId);
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

  const getSetInputKey = useCallback((exerciseIdx: number, setIdx: number, field: 'weight' | 'reps') => {
    return `${exerciseIdx}-${setIdx}-${field}`;
  }, []);

  const sanitizeSetInput = useCallback((rawValue: string, field: 'weight' | 'reps') => {
    if (field === 'reps') {
      const digitsOnly = rawValue.replace(/\D/g, '');
      return digitsOnly.replace(/^0+(?=\d)/, '');
    }

    const normalized = rawValue
      .replace(/[\u066B,،﹐，]/g, '.')
      .replace(/[^0-9.]/g, '');
    const [integerPart, ...decimalParts] = normalized.split('.');
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '');
    if (decimalParts.length === 0) return normalizedInteger;

    const joinedDecimals = decimalParts.join('');
    if (normalizedInteger === '' && joinedDecimals === '') return '.';
    return `${normalizedInteger || '0'}.${joinedDecimals}`;
  }, []);

  const parseSetInput = useCallback((value: string, field: 'weight' | 'reps'): number | null => {
    if (value.trim() === '') return null;

    if (field === 'reps') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return null;
      return Math.max(0, parsed);
    }

    if (value === '.') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, parsed);
  }, []);

  const handleSetFieldChange = useCallback((exerciseIdx: number, setIdx: number, field: 'weight' | 'reps', rawValue: string) => {
    const key = getSetInputKey(exerciseIdx, setIdx, field);
    const sanitized = sanitizeSetInput(rawValue, field);

    setSetInputDrafts(prev => ({ ...prev, [key]: sanitized }));

    const parsed = parseSetInput(sanitized, field);
    if (parsed === null) return;
    updateSet(exerciseIdx, setIdx, field, parsed);
  }, [getSetInputKey, parseSetInput, sanitizeSetInput, updateSet]);

  const handleSetFieldBlur = useCallback((exerciseIdx: number, setIdx: number, field: 'weight' | 'reps', currentValue: number) => {
    const key = getSetInputKey(exerciseIdx, setIdx, field);
    const draft = setInputDrafts[key];
    if (draft === undefined) return;

    const parsed = parseSetInput(draft, field);
    if (parsed === null) {
      updateSet(exerciseIdx, setIdx, field, 0);
    } else if (parsed !== currentValue) {
      updateSet(exerciseIdx, setIdx, field, parsed);
    }

    setSetInputDrafts(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [getSetInputKey, parseSetInput, setInputDrafts, updateSet]);

  const handleSetFieldFocus = useCallback((exerciseIdx: number, setIdx: number, field: 'weight' | 'reps', currentValue: number) => {
    if (currentValue !== 0) return;
    const key = getSetInputKey(exerciseIdx, setIdx, field);
    setSetInputDrafts(prev => {
      if (prev[key] !== undefined) return prev;
      return { ...prev, [key]: '' };
    });
  }, [getSetInputKey]);

  const getSetFieldDisplayValue = useCallback((exerciseIdx: number, setIdx: number, field: 'weight' | 'reps', currentValue: number) => {
    const key = getSetInputKey(exerciseIdx, setIdx, field);
    return setInputDrafts[key] ?? String(currentValue);
  }, [getSetInputKey, setInputDrafts]);

  const addSet = useCallback((exerciseIdx: number) => {
    setExerciseLogs(prev => {
      if (prev[exerciseIdx]) editedExerciseIdsRef.current.add(prev[exerciseIdx].exerciseId);
      const updated = [...prev];
      const exercise = { ...updated[exerciseIdx] };
      const lastSet = exercise.sets[exercise.sets.length - 1];
      // Same rule as the week prefill: carry the numbers, not the intensity.
      exercise.sets = [...exercise.sets, {
        weight: lastSet.weight,
        reps: lastSet.reps,
        intensity: 'failure' as Intensity,
      }];
      updated[exerciseIdx] = exercise;
      return updated;
    });
    setIsDirty(true);
  }, []);

  // The saved week and the program use the same order after Kaydet.
  const moveExercise = useCallback((exerciseIdx: number, delta: number) => {
    setExerciseLogs(prev => {
      const next = moveItem(prev, exerciseIdx, delta);
      if (next === prev) return prev;
      setOrderDiffersFromProgram(true);
      return next;
    });
    setIsDirty(true);
  }, []);

  const removeSet = useCallback((exerciseIdx: number, setIdx: number) => {
    const exerciseId = exerciseLogs[exerciseIdx].exerciseId;
    editedExerciseIdsRef.current.add(exerciseId);
    setCompletedSets(prev => {
      const next = { ...prev };
      for (let i = setIdx; i < exerciseLogs[exerciseIdx].sets.length; i++) {
        next[`${exerciseId}:${i}`] = prev[`${exerciseId}:${i + 1}`] ?? false;
      }
      return next;
    });
    setSetInputDrafts({});
    setExerciseLogs(prev => {
      const updated = [...prev];
      const exercise = { ...updated[exerciseIdx] };
      if (exercise.sets.length <= 1) return prev;
      exercise.sets = exercise.sets.filter((_, i) => i !== setIdx);
      updated[exerciseIdx] = exercise;
      return updated;
    });
    setIsDirty(true);
  }, [exerciseLogs]);

  const handleSave = () => {
    if (!programId) return;
    if (program) {
      const recorded = new Set((allLogs ?? []).flatMap(log => log.exercises.map(exercise => exercise.exerciseId)));
      const updated = syncProgramFromWorkout(addMovementsFromWorkout(program, exerciseLogs, recorded), exerciseLogs, editedExerciseIdsRef.current, orderDiffersFromProgram);
      if (updated !== program) {
        updateProgram(updated);
        if (orderDiffersFromProgram) ctx?.dispatch({ type: 'SET_EXERCISE_ROW_ORDER', payload: {
          programId: program.id, exerciseIds: updated.exercises.map(exercise => exercise.id),
        } });
      }
    }

    saveWorkout({
      weekNumber,
      programId,
      date,
      exercises: exerciseLogs.map(({ note, ...exercise }) => note?.trim() ? { ...exercise, note: note.trim() } : exercise),
      notes,
      isHoliday,
      offDay: !isHoliday && offDay,
      updatedAt: new Date().toISOString(),
    });
    localStorage.removeItem(draftKey);
    navigate(returnPath);
  };

  // Wipes this program's record for this week: sets, note, holiday mark and
  // the unsaved draft. Other weeks and the program itself are untouched.
  const handleClearWeek = () => {
    if (!programId) return;
    localStorage.removeItem(draftKey);
    ctx?.dispatch({ type: 'CLEAR_HISTORY_DATA', payload: { programId, weeks: [weekNumber] } });
    navigate(returnPath);
  };

  const addRecentDuration = useCallback((seconds: number) => {
    setRecentDurations(prev => {
      const next = [seconds, ...prev.filter(v => v !== seconds)].slice(0, MAX_RECENT_DURATIONS);
      return next;
    });
  }, []);

  const playAlarmTone = useCallback(async () => {
    try {
      // Reuse the pre-unlocked AudioContext so iOS allows audio from non-gesture contexts
      let ctx = audioContextRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContext();
        audioContextRef.current = ctx;
      }
      // iOS suspends AudioContext when page goes to background; resume before playing
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const now = ctx.currentTime;
      [880, 660, 880].forEach((frequency, index) => {
        const oscillator = ctx!.createOscillator();
        const gain = ctx!.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        const startAt = now + index * 0.22;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
        oscillator.connect(gain);
        gain.connect(ctx!.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.2);
      });
    } catch {
      // Browsers may block audio — visual banner still fires.
    }
  }, []);

  const fireTimerFinishedAlerts = useCallback(() => {
    void playAlarmTone();
    if ('vibrate' in navigator) {
      navigator.vibrate([180, 100, 220]);
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Dinlenme bitti', {
        body: 'Sonraki sete hazırsın.',
        tag: 'rest-timer-finished',
      });
    }
    // Visual banner — reliable even when audio/vibration fails (e.g. iOS Safari)
    setTimerJustFinished(true);
    setTimeout(() => setTimerJustFinished(false), 5000);
  }, [playAlarmTone]);

  // Uses endAt timestamp so interval drift / throttling is corrected on every tick
  const restartIntervalFromEndAt = useCallback((endAt: number) => {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    timerEndAtRef.current = endAt;
    timerRef.current = setInterval(() => {
      const remaining = Math.ceil((timerEndAtRef.current! - Date.now()) / 1000);
      if (remaining <= 0) {
        if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
        timerEndAtRef.current = null;
        localStorage.removeItem(TIMER_END_AT_KEY);
        void wakeLockRef.current?.release();
        wakeLockRef.current = null;
        silentAudioRef.current?.pause();
        scheduledOscillatorsRef.current.forEach(o => { try { o.disconnect(); } catch { /* */ } });
        scheduledOscillatorsRef.current = [];
        setTimerActive(false);
        setTimerRemainingSec(0);
        fireTimerFinishedAlerts();
      } else {
        setTimerRemainingSec(remaining);
      }
    }, 500);
  }, [fireTimerFinishedAlerts]);

  const startRestTimer = (seconds: number = restDurationSec, remember = true) => {
    // Unlock / resume AudioContext on this user gesture — required for iOS audio policy
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext();
      }
      if (audioContextRef.current.state === 'suspended') {
        void audioContextRef.current.resume();
      }
    } catch { /* ignore */ }
    // Request WakeLock so screen stays on while the user is resting
    if ('wakeLock' in navigator) {
      (navigator as unknown as { wakeLock: { request(t: string): Promise<{ release(): Promise<void> }> } })
        .wakeLock.request('screen')
        .then(lock => { wakeLockRef.current = lock; })
        .catch(() => { /* not all browsers / OS configs support wake lock */ });
    }
    setTimerJustFinished(false);
    const safeSeconds = Math.max(5, Math.round(seconds));
    const endAt = Date.now() + safeSeconds * 1000;
    timerTotalRef.current = safeSeconds;
    localStorage.setItem(TIMER_END_AT_KEY, String(endAt));
    setTimerRemainingSec(safeSeconds);
    setTimerActive(true);
    if (remember) addRecentDuration(safeSeconds);
    // Play silent audio loop — keeps iOS audio session alive when screen locks
    if (SILENT_WAV_URL) {
      if (!silentAudioRef.current) {
        silentAudioRef.current = new Audio(SILENT_WAV_URL);
        silentAudioRef.current.loop = true;
      }
      void silentAudioRef.current.play().catch(() => {});
    }
    // Pre-schedule alarm tones in AudioContext.
    // The audio thread continues running even when JS is suspended (iOS background/lock),
    // so the alarm fires at the exact time as long as the audio session stays active.
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      const ctx = audioContextRef.current;
      // Cancel any leftover pre-scheduled notes from a previous timer
      scheduledOscillatorsRef.current.forEach(o => { try { o.disconnect(); } catch { /* */ } });
      scheduledOscillatorsRef.current = [];
      const fireAt = ctx.currentTime + safeSeconds;
      const oscs: OscillatorNode[] = [];
      [880, 660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startAt = fireAt + i * 0.22;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + 0.22);
        oscs.push(osc);
      });
      scheduledOscillatorsRef.current = oscs;
    }
    restartIntervalFromEndAt(endAt);
  };

  const stopRestTimer = () => {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    timerEndAtRef.current = null;
    localStorage.removeItem(TIMER_END_AT_KEY);
    void wakeLockRef.current?.release();
    wakeLockRef.current = null;
    scheduledOscillatorsRef.current.forEach(o => { try { o.disconnect(); } catch { /* */ } });
    scheduledOscillatorsRef.current = [];
    silentAudioRef.current?.pause();
    setTimerActive(false);
    setTimerRemainingSec(0);
    setTimerJustFinished(false);
  };

  const formatDurationLabel = (seconds: number) => {
    if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} dk`;
    return `${seconds} sn`;
  };

  const handleStartCustomTimer = async () => {
    const raw = Number(customDurationInput);
    if (!Number.isFinite(raw) || raw <= 0) return;

    const seconds = customDurationUnit === 'min'
      ? Math.round(raw * 60)
      : Math.round(raw);

    const normalized = Math.min(Math.max(seconds, 5), 7200);
    setRestDurationSec(normalized);
    startRestTimer(normalized);
    setCustomDurationInput('');

    if (notificationPermission === 'default' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };

  const handleEnableNotifications = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  // When tab becomes visible again, recalculate remaining from the saved endAt timestamp.
  // This corrects any drift caused by OS/browser throttling while the screen was off.
  useEffect(() => {
    const handleVisible = () => {
      if (document.hidden) return;
      const saved = localStorage.getItem(TIMER_END_AT_KEY);
      if (!saved) return;
      const endAt = Number(saved);
      if (!Number.isFinite(endAt)) return;
      const remaining = Math.ceil((endAt - Date.now()) / 1000);
      if (remaining <= 0) {
        if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
        timerEndAtRef.current = null;
        localStorage.removeItem(TIMER_END_AT_KEY);
        silentAudioRef.current?.pause();
        scheduledOscillatorsRef.current.forEach(o => { try { o.disconnect(); } catch { /* */ } });
        scheduledOscillatorsRef.current = [];
        setTimerActive(false);
        setTimerRemainingSec(0);
        fireTimerFinishedAlerts();
      } else {
        setTimerRemainingSec(remaining);
        setTimerActive(true);
        restartIntervalFromEndAt(endAt);
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [fireTimerFinishedAlerts, restartIntervalFromEndAt]);

  const getPreviousSetRef = useMemo(() => {
    if (!previousLog) return () => null;
    return (exerciseId: string, setIdx: number): SetLog | null => {
      const prevExercise = previousLog.exercises.find(e => e.exerciseId === exerciseId);
      return prevExercise?.sets[setIdx] || null;
    };
  }, [previousLog]);

  // Focus mode: one set on screen; by default the first one not yet done.
  const [focus, setFocus] = useState<{ ex: number; set: number } | null>(null);
  const [screen, setScreen] = useState<'set' | 'list'>('set');
  const [daySettingsOpen, setDaySettingsOpen] = useState(false);
  const [exerciseSheetOpen, setExerciseSheetOpen] = useState(false);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [rirHelpOpen, setRirHelpOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  // The movement whose set was just finished, offered one more set while resting.
  const [lastFinished, setLastFinished] = useState<number | null>(null);
  // This day was already logged this week, days ago: asked once whether it
  // is a new week's workout before anything is changed.
  const [staleAge] = useState(() => staleRecordAge(existingLog, ctx?.state.currentWeek ?? weekNumber, new Date()));
  const [staleAnswered, setStaleAnswered] = useState(false);
  const startNewWeek = () => {
    ctx?.dispatch({ type: 'INCREMENT_WEEK' });
    navigate(`/workout/${programId}/week/${weekNumber + 1}`, { replace: true });
  };
  // Someone with no workout saved yet gets one line on how a set is entered,
  // until they say they have it.
  const [firstHintSeen, setFirstHintSeen] = useState(() => {
    try { return localStorage.getItem(FIRST_HINT_KEY) === '1'; } catch { return false; }
  });
  const showFirstHint = !firstHintSeen && (ctx?.state.weekLogs.length ?? 0) === 0;
  const dismissFirstHint = () => {
    setFirstHintSeen(true);
    try { localStorage.setItem(FIRST_HINT_KEY, '1'); } catch { /* a per-device nicety only */ }
  };

  // Every movement this person has written down, newest first, for the search.
  const ownMovementNames = useMemo(() => {
    const names: string[] = [];
    for (const log of [...(allLogs ?? [])].sort((a, b) => b.weekNumber - a.weekNumber)) {
      for (const exercise of log.exercises) names.push(exercise.exerciseName);
    }
    for (const day of ctx?.state.programs ?? []) for (const exercise of day.exercises) names.push(exercise.name);
    return names;
  }, [allLogs, ctx?.state.programs]);
  const addResults = searchMovements(addQuery, ownMovementNames, 12, name => muscleRegions(name, exerciseSettings?.[exerciseKey(name)]?.region).join(' '));
  const addExact = [...addResults.own, ...addResults.library].some(name => exerciseKey(name) === exerciseKey(addQuery));

  // A movement joins this workout (and, on save, the program). Done before on
  // another day, it starts from that day's best set; new, from zero.
  const addMovement = (rawName: string) => {
    const name = rawName.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const key = exerciseKey(name);
    const existing = exerciseLogs.findIndex(exercise => exerciseKey(exercise.exerciseName) === key);
    if (existing >= 0) {
      const open = exerciseLogs[existing].sets.findIndex((_, i) => !completedSets[`${exerciseLogs[existing].exerciseId}:${i}`]);
      setFocus({ ex: existing, set: open < 0 ? 0 : open });
    } else {
      const sessions = movementSessions(allLogs ?? [], key);
      const best = sessions.length ? bestSet(sessions[sessions.length - 1].exercise.sets) : null;
      const id = crypto.randomUUID();
      editedExerciseIdsRef.current.add(id);
      setExerciseLogs(prev => [...prev, {
        exerciseId: id, exerciseName: name,
        sets: [{ weight: best?.weight ?? 0, reps: best?.reps ?? 0, intensity: 'failure' as Intensity }],
      }]);
      setIsDirty(true);
      setFocus({ ex: exerciseLogs.length, set: 0 });
    }
    setAddOpen(false);
    setAddQuery('');
    setScreen('set');
  };
  // One more set of a movement, ready to be entered next.
  const oneMoreSet = (ex: number) => {
    addSet(ex);
    setFocus({ ex, set: exerciseLogs[ex].sets.length });
    setLastFinished(null);
  };

  // The next set not yet done after (fromEx, fromSet), in program order,
  // wrapping round to the start; null once every set is done.
  const nextOpenSet = (fromEx: number, fromSet: number, done: Record<string, boolean>) => {
    const order: { ex: number; set: number }[] = [];
    exerciseLogs.forEach((exercise, ex) => exercise.sets.forEach((_, set) => order.push({ ex, set })));
    const start = order.findIndex(item => item.ex === fromEx && item.set === fromSet);
    for (let step = 1; step <= order.length; step++) {
      const item = order[(start + step + order.length) % order.length];
      if (!done[`${exerciseLogs[item.ex].exerciseId}:${item.set}`]) return item;
    }
    return null;
  };
  const current = focus && exerciseLogs[focus.ex]?.sets[focus.set] ? focus : nextOpenSet(-1, -1, completedSets);

  // Seti bitir: tick it, move on to the next set not yet done, and rest
  // unless that was the last one.
  const finishSet = () => {
    // A set needs its reps; 0 kg is fine (bodyweight), 0 reps is never a set.
    if (!current || !(exerciseLogs[current.ex]?.sets[current.set]?.reps > 0)) return;
    const key = `${exerciseLogs[current.ex].exerciseId}:${current.set}`;
    const done = { ...completedSets, [key]: true };
    setCompletedSets(done);
    setIsDirty(true);
    const next = nextOpenSet(current.ex, current.set, done);
    setFocus(next);
    setLastFinished(current.ex);
    // A movement being built this workout has no set after the last one yet,
    // but the person still rests before deciding on another.
    const building = !program?.exercises.some(e => e.id === exerciseLogs[current.ex].exerciseId);
    if (next || building) startRestTimer();
  };
  // Moves the end of a running rest; the alarm is rescheduled with it, and the
  // adjusted length is not remembered as a new duration.
  const adjustRestTimer = (deltaSec: number) => {
    if (timerEndAtRef.current === null) return;
    const remaining = Math.ceil((timerEndAtRef.current - Date.now()) / 1000) + deltaSec;
    if (remaining <= 0) { stopRestTimer(); return; }
    const total = timerTotalRef.current;
    startRestTimer(remaining, false);
    timerTotalRef.current = Math.max(total, remaining);
  };

  if (!program) {
    return (
      <PageContainer>
        <p className="text-(--color-text-muted)">Program bulunamadı.</p>
      </PageContainer>
    );
  }

  const doneCount = exerciseLogs.reduce((count, e) => count + e.sets.filter((_, i) => completedSets[`${e.exerciseId}:${i}`]).length, 0);
  const setCount = exerciseLogs.reduce((count, e) => count + e.sets.length, 0);
  const exercise = current ? exerciseLogs[current.ex] : null;
  const set = exercise && current ? exercise.sets[current.set] : null;
  const prevSet = exercise && current ? getPreviousSetRef(exercise.exerciseId, current.set) : null;
  const key = exercise ? exerciseKey(exercise.exerciseName) : '';
  const info = exercise ? movementInfo.get(exercise.exerciseId) : undefined;
  const pinned = key ? exerciseSettings?.[key]?.note : undefined;
  const weightUp = info?.target && info.target.reps === null ? info.target : null;
  const step = info?.rule.step ?? 2.5;
  const comparison = set ? compareToPrevious(set, prevSet) : null;
  const chosenRegion = key ? exerciseSettings?.[key]?.region : undefined;
  const regions = exercise ? muscleRegions(exercise.exerciseName, chosenRegion) : [];
  // Never done on any day: no number to start from yet, so the person is
  // told how to pick one.
  const firstTimeMovement = !!exercise && movementSessions(allLogs ?? [], key).length === 0;
  // The coach's latest word on this movement of this day, from this week or before.
  const coachComment = exercise ? coachComments.list
    .filter(comment => comment.programId === programId && comment.exerciseId === exercise.exerciseId && comment.weekNumber <= weekNumber)
    .sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
  // Room for the guidance card on a phone: the figures give way a little.
  const guidanceShown = firstTimeMovement || showFirstHint;
  const currentDone = exercise && current ? !!completedSets[`${exercise.exerciseId}:${current.set}`] : false;
  // On the finish screen: one more set of what was just done, or after a
  // reload (when that is not known) of the last movement.
  const moreFor = lastFinished ?? (exerciseLogs.length ? exerciseLogs.length - 1 : null);
  // Each movement's best set ticked today: what the next session has to beat.
  const nextWeekTargets = exerciseLogs.flatMap(e => {
    const best = bestSet(e.sets.filter((_, i) => completedSets[`${e.exerciseId}:${i}`]));
    return best ? [{ id: e.exerciseId, name: e.exerciseName, text: formatSetLine(best) }] : [];
  });
  // The next movement with sets still to do after this one, wrapping round.
  const unfinished = exerciseLogs
    .map((e, index) => ({ exercise: e, index, done: e.sets.filter((_, i) => completedSets[`${e.exerciseId}:${i}`]).length }))
    .filter(item => item.index !== current?.ex && item.done < item.exercise.sets.length);
  const nextUp = unfinished.find(item => item.index > (current?.ex ?? -1)) ?? unfinished[0];
  const restShown = timerActive || timerJustFinished;
  const onSetScreen = !isHoliday && exerciseLogs.length > 0 && !!exercise && !!set && !!current;
  const restFraction = timerActive && timerTotalRef.current > 0 ? 1 - timerRemainingSec / timerTotalRef.current : 1;

  const segments = (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, exerciseLogs.length)}, minmax(0, 1fr))` }}>
      {exerciseLogs.map((e, index) => {
        const done = e.sets.filter((_, i) => completedSets[`${e.exerciseId}:${i}`]).length;
        return (
          <span key={e.exerciseId} className="block h-[3px] rounded-full overflow-hidden"
            style={{ background: current?.ex === index ? 'color-mix(in srgb, var(--color-text-secondary) 45%, transparent)' : 'var(--color-border)' }}>
            <span className="block h-[3px] bg-(--color-text-primary)" style={{ width: `${e.sets.length ? (done / e.sets.length) * 100 : 0}%` }} />
          </span>
        );
      })}
    </div>
  );

  const roundButton = (label: string, onClick: () => void, plus: boolean) => (
    <button type="button" aria-label={label} onPointerDown={e => e.preventDefault()} onClick={onClick}
      className="shrink-0 w-[60px] h-[60px] [@media(max-height:700px)]:w-[52px] [@media(max-height:700px)]:h-[52px] rounded-full bg-(--color-bg-input) flex items-center justify-center active:scale-95 transition-transform">
      <svg aria-hidden="true" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d={plus ? 'M12 5v14M5 12h14' : 'M5 12h14'} /></svg>
    </button>
  );

  return (
    <div className="min-h-[100dvh] max-w-xl mx-auto flex flex-col pt-[env(safe-area-inset-top)]">
      <div className="px-4 pt-3">
        {segments}
        <div className="mt-1.5 flex items-center justify-between">
          <button onClick={() => navigate(returnPath)} aria-label="Antrenmandan çık (taslak saklanır)" className="-ml-2.5 w-11 h-11 flex items-center justify-center">
            <svg aria-hidden="true" className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <span className="text-[15px] font-semibold truncate px-2">
            {program.name} <span className="font-medium text-(--color-text-secondary)">· {current ? `hareket ${current.ex + 1}/${exerciseLogs.length}` : `${doneCount}/${setCount} set`}</span>
          </span>
          {/* On a set the strip under "Seti bitir" opens the list, so this
              button is only for the screens without one (holiday, first
              movement, done); an empty box keeps the title centred. */}
          {onSetScreen ? <span aria-hidden="true" className="-mr-2.5 w-11 h-11" /> : (
            <button onClick={() => setScreen('list')} aria-label="Hareket listesi ve gün ayarları" className="-mr-2.5 w-11 h-11 flex items-center justify-center">
              <svg aria-hidden="true" className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
            </button>
          )}
        </div>
      </div>

      {isHoliday ? (
        <div className="flex-1 flex flex-col justify-center px-6 pb-8 text-center">
          <p className="a-display text-[56px]">Tatil</p>
          <p className="mt-2 text-[16px] text-(--color-text-secondary)">Bu gün tatil olarak işaretli; setler gizli.</p>
          <button onClick={() => { setIsHoliday(false); setIsDirty(true); }} className="mt-6 h-14 rounded-[16px] bg-(--color-bg-card) text-[16px] font-medium">Tatili kaldır</button>
          <button onClick={handleSave} className="mt-2 h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">Kaydet</button>
        </div>
      ) : exerciseLogs.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center px-6 pb-8">
          <p className="text-center text-[16px] text-(--color-text-secondary)">{program.name} · {nameOfWeek(weekNumber)}</p>
          <p className="a-display text-center text-[60px] mt-1">İlk hareket</p>
          <p className="mt-3 text-center text-[16px] leading-snug text-(--color-text-secondary)">
            Bugün yaptığın ilk hareketi ekle. Program antrenman yaparken kurulur; gelecek hafta bu rakamları geçmeye çalışırsın.
          </p>
          <button onClick={() => setAddOpen(true)} className="mt-8 h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">Hareket ekle</button>
        </div>
      ) : !exercise || !set || !current ? (
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col">
        <div className="my-auto flex flex-col">
          <p className="text-center text-[16px] text-(--color-text-secondary)">{program.name} · {nameOfWeek(weekNumber)}</p>
          <p className="a-display text-center text-[72px] mt-1">Tamam</p>
          <p className="text-center text-[17px] text-(--color-text-secondary)">{doneCount} / {setCount} set işaretlendi</p>
          {/* The point of the app, in the person's own numbers: what next week has to beat. */}
          {nextWeekTargets.length > 0 && (
            <div className="mt-6 a-card px-4 py-3">
              <p className="text-[14px] text-(--color-text-secondary)">Gelecek {program.name} antrenmanında seni bunlar bekliyor</p>
              <ul className="mt-1">
                {nextWeekTargets.map(target => (
                  <li key={target.id} className="flex items-baseline justify-between gap-3 py-1.5 border-b border-(--color-border) last:border-b-0">
                    <span className="text-[16px] truncate">{target.name}</span>
                    <span className="lb-figure shrink-0 text-[22px] font-semibold">{target.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={handleSave} className="mt-8 h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">Kaydet</button>
          {moreFor !== null && exerciseLogs[moreFor] && (
            <button onClick={() => oneMoreSet(moreFor)} className="mt-2 h-14 rounded-[16px] bg-(--color-bg-card) text-[16px] font-medium truncate px-4">
              {exerciseLogs[moreFor].exerciseName}: bir set daha
            </button>
          )}
          <button onClick={() => setAddOpen(true)} className="mt-2 h-14 rounded-[16px] bg-(--color-bg-card) text-[16px] font-medium">Hareket ekle</button>
          <button onClick={() => setScreen('list')} className="mt-2 h-14 rounded-[16px] text-[16px] text-(--color-text-secondary)">Hareketlere dön</button>
        </div>
        </div>
      ) : (
        <>
          <div className="px-5 pt-2">
            <div className="flex items-start gap-2">
              <h1 className="a-display flex-1 min-w-0 text-[40px] [@media(max-height:700px)]:text-[32px]">{exercise.exerciseName}</h1>
              <button onClick={() => setExerciseSheetOpen(true)} aria-label={`${exercise.exerciseName} seçenekleri: bölge, sabit not, kural, set ekle ya da sil, sıra`}
                className="-mr-2.5 shrink-0 w-11 h-11 flex items-center justify-center text-(--color-text-secondary)">
                <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </button>
            </div>
            {/* Notes sit in plain sight beside the region: the ⋯ menu alone
                was not found when one was wanted mid-workout. */}
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <button onClick={() => setExerciseSheetOpen(true)} className="flex-1 min-w-0 min-h-8 text-left text-[14px] text-(--color-text-secondary) truncate">
                {regions.length ? (
                  <><span className="font-semibold text-(--color-text-primary)">{regions[0]}</span>{regions.length > 1 && ` · ${regions.slice(1).join(', ').toLocaleLowerCase('tr-TR')}`}</>
                ) : <span className="underline underline-offset-2">Çalıştırdığı bölgeyi seç</span>}
              </button>
              <button onClick={() => setNoteSheetOpen(true)} className="shrink-0 -mr-1 min-h-8 px-1 flex items-center gap-1.5 text-[14px] text-(--color-text-secondary)">
                <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                {exercise.note?.trim() || notes.trim() ? 'Notu düzenle' : 'Not ekle'}
              </button>
            </div>
            {/* Last week's numbers are the ones in the fields below (the week
                starts from them), and the line under them says how this set
                compares; they are not repeated up here. */}
            <p className="mt-1 [@media(max-height:700px)]:mt-0 text-[15px] text-(--color-text-secondary)">Set {current.set + 1} / {exercise.sets.length}</p>
            {/* One card for both: how to pick a weight never done before, and
                (until dismissed) how a set is entered at all. */}
            {(firstTimeMovement || showFirstHint) && (
              <div className="mt-2 flex items-center gap-2 rounded-2xl pl-4 pr-1 py-2" style={{ background: 'var(--lb-ref-fill)' }}>
                <div className="flex-1 text-[14px] leading-snug">
                  {firstTimeMovement && <p><span className="font-semibold" style={{ color: 'var(--lb-ref)' }}>Ağırlığını bul:</span> 8–12 tekrar yapabileceğin, tükenişe yakın çalışabileceğin bir ağırlık seç.</p>}
                  {showFirstHint && <p className={firstTimeMovement ? 'mt-1' : ''}>Rakama dokunup yaz ya da − + kullan; set bitince “Seti bitir”.</p>}
                </div>
                {showFirstHint && <button onClick={dismissFirstHint} className="shrink-0 h-11 px-3 rounded-xl text-[14px] font-semibold" style={{ color: 'var(--lb-ref)' }}>Anladım</button>}
              </div>
            )}
            {(weightUp || pinned || info?.lastNote || coachComment || (doneCount === 0 && (previousNoteLog?.notes?.trim() || coachDayNotes.length > 0))) && (
              <div className="mt-1.5 space-y-0.5 text-[14px] text-(--color-text-secondary)">
                {/* "One more rep" goes without saying; time to add weight is
                    the one target shown nowhere else. */}
                {weightUp && (
                  <p>Hedef <span className="lb-figure text-[17px] font-semibold text-(--color-text-primary)">{weightUp.weight} kg</span>
                    {' · '}{weightUp.from.reps} tekrara ulaştın</p>
                )}
                {pinned && <p className="truncate">Sabit: <span className="text-(--color-text-primary)">{pinned}</span></p>}
                {doneCount === 0 && coachDayNotes.map(note => (
                  <p key={note.id} className="line-clamp-3">Antrenörün notu ({note.author.split(' ')[0]}): <span className="text-(--color-text-primary)">{note.text}</span></p>
                ))}
                {coachComment && <p className="line-clamp-2">Antrenör ({coachComment.author.split(' ')[0]}): <span className="text-(--color-text-primary)">{coachComment.text}</span></p>}
                {info?.lastNote && <p className="truncate">Geçen sefer ({[programName(info.lastNote.log.programId), nameOfWeek(info.lastNote.log.weekNumber)].filter(Boolean).join(' · ')}): <span className="text-(--color-text-primary)">{info.lastNote.exercise.note!.trim()}</span></p>}
                {doneCount === 0 && previousNoteLog?.notes?.trim() && <p className="truncate">Geçen gün notu: <span className="text-(--color-text-primary)">{previousNoteLog.notes.trim()}</span></p>}
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-center gap-2.5 [@media(max-height:700px)]:gap-1.5 px-5 py-2 [@media(max-height:700px)]:py-1">
            <div className="flex flex-col items-center">
              <span className="text-[14px] text-(--color-text-secondary)">kg</span>
              <div className="w-full flex items-center justify-between gap-2">
                {roundButton('Kiloyu azalt', () => handleSetFieldChange(current.ex, current.set, 'weight', String(roundWeight(Math.max(0, set.weight - step)))), false)}
                <input type="text" inputMode="decimal" aria-label="Kilo"
                  value={blankIfZero(getSetFieldDisplayValue(current.ex, current.set, 'weight', set.weight))} placeholder="0"
                  onChange={e => handleSetFieldChange(current.ex, current.set, 'weight', e.target.value)}
                  onFocus={() => handleSetFieldFocus(current.ex, current.set, 'weight', set.weight)}
                  onBlur={() => handleSetFieldBlur(current.ex, current.set, 'weight', set.weight)}
                  className={`lb-figure flex-1 min-w-0 bg-transparent text-center ${guidanceShown ? 'text-[68px]! [@media(max-height:700px)]:text-[48px]!' : 'text-[84px]! [@media(max-height:700px)]:text-[52px]!'} leading-none font-bold focus:outline-none placeholder:text-(--color-border)`} />
                {roundButton('Kiloyu artır', () => handleSetFieldChange(current.ex, current.set, 'weight', String(roundWeight(set.weight + step))), true)}
              </div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[14px] text-(--color-text-secondary)">tekrar</span>
              <div className="w-full flex items-center justify-between gap-2">
                {roundButton('Tekrarı azalt', () => handleSetFieldChange(current.ex, current.set, 'reps', String(Math.max(0, set.reps - 1))), false)}
                <input type="text" inputMode="numeric" aria-label="Tekrar"
                  value={blankIfZero(getSetFieldDisplayValue(current.ex, current.set, 'reps', set.reps))} placeholder="0"
                  onChange={e => handleSetFieldChange(current.ex, current.set, 'reps', e.target.value)}
                  onFocus={() => handleSetFieldFocus(current.ex, current.set, 'reps', set.reps)}
                  onBlur={() => handleSetFieldBlur(current.ex, current.set, 'reps', set.reps)}
                  className={`lb-figure flex-1 min-w-0 bg-transparent text-center ${guidanceShown ? 'text-[68px]! [@media(max-height:700px)]:text-[48px]!' : 'text-[84px]! [@media(max-height:700px)]:text-[52px]!'} leading-none font-bold focus:outline-none placeholder:text-(--color-border)`} />
                {roundButton('Tekrarı artır', () => handleSetFieldChange(current.ex, current.set, 'reps', String(set.reps + 1)), true)}
              </div>
              {comparison && (
                <span role="status" className="mt-2 rounded-full px-3 py-1.5 text-[15px] font-semibold"
                  style={{ color: TONE[comparison.tone].color, background: TONE[comparison.tone].fill }}>{comparison.text}</span>
              )}
            </div>
            {/* RIR with the same marks the History grid and the Sheet write
                (75 x 7 +1, F); the question it answers is behind the "?". */}
            <div className="flex items-center gap-2">
              <div role="group" aria-label="Sette kaç tekrar daha yapabilirdin?" className="flex-1 min-w-0 grid grid-cols-4 gap-1 p-1 rounded-2xl bg-(--color-bg-card)">
                {INTENSITY_OPTIONS.map(opt => {
                  const failure = opt.value === 'failure';
                  const picked = set.intensity === opt.value;
                  return (
                    <button key={opt.value} onClick={() => updateSet(current.ex, current.set, 'intensity', opt.value)}
                      aria-pressed={picked} aria-label={failure ? 'Hiç, tükendim' : `${opt.label} tekrar daha`}
                      className={`h-[52px] [@media(max-height:700px)]:h-11 rounded-xl flex flex-col items-center justify-center gap-1 ${picked ? 'bg-(--color-text-primary) text-(--color-bg-primary)' : 'text-(--color-text-secondary)'}`}>
                      <span className="lb-figure text-[22px] font-bold leading-none">{failure ? 'F' : `+${opt.label}`}</span>
                      <span className="text-[12px] leading-none">{failure ? 'tükendim' : `${opt.label} daha`}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setRirHelpOpen(true)} aria-label="F, +1, +2, +3 ne demek?"
                className="shrink-0 w-11 h-11 rounded-full bg-(--color-bg-card) text-[18px] font-semibold text-(--color-text-secondary)">?</button>
            </div>
          </div>

          {/* Pinned to the bottom: on a short screen (or Safari with its bars)
              the set scrolls behind it, and "Seti bitir" stays under the thumb. */}
          <div className="sticky bottom-0 z-10 bg-(--color-bg-primary) px-4 pt-2 [@media(max-height:700px)]:pt-1 pb-[calc(20px+env(safe-area-inset-bottom))] [@media(max-height:700px)]:pb-[calc(12px+env(safe-area-inset-bottom))] flex flex-col gap-2.5 [@media(max-height:700px)]:gap-1.5">
            {exercise.sets.some((_, i) => completedSets[`${exercise.exerciseId}:${i}`]) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-1.5">
                {exercise.sets.map((s, i) => completedSets[`${exercise.exerciseId}:${i}`] && (
                  <button key={i} onClick={() => setFocus({ ex: current.ex, set: i })} aria-label={`Set ${i + 1} düzelt`}
                    className="min-h-11 flex items-center gap-1.5 text-[14px] text-(--color-text-secondary)">
                    <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--lb-gain)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    Set {i + 1} <span className="lb-figure text-[18px] font-semibold text-(--color-text-primary)">{formatSetLine(s)}</span>
                  </button>
                ))}
              </div>
            )}
            {currentDone ? (
              <button onClick={() => setFocus(null)} className="h-16 [@media(max-height:700px)]:h-14 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">Düzeltmeyi bitir</button>
            ) : (
              <button onClick={finishSet} disabled={!(set && set.reps > 0)}
                className="h-16 [@media(max-height:700px)]:h-14 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) flex flex-col items-center justify-center disabled:opacity-40">
                <span className="text-[19px] font-semibold leading-tight">{set && set.reps > 0 ? 'Seti bitir' : 'Önce tekrarı gir'}</span>
                <span className="text-[12px] opacity-70">sonra {formatDurationLabel(restDurationSec)} dinlenme</span>
              </button>
            )}
            {/* Under the button, like a player bar: the next movement, and a tap
                opens them all (the only way to the list from a set). */}
            <button onClick={() => setScreen('list')} aria-label="Bütün hareketleri göster"
              className="min-h-12 [@media(max-height:700px)]:min-h-11 px-4 py-1 [@media(max-height:700px)]:py-0.5 rounded-2xl bg-(--color-bg-card) flex items-center gap-3 text-left">
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[12px] text-(--color-text-secondary)">{nextUp ? 'Sonra' : 'Başka hareket yok · eklemek için dokun'}</span>
                {nextUp && (
                  <span className="text-[15px] font-semibold truncate">
                    {nextUp.exercise.exerciseName} <span className="font-normal text-(--color-text-secondary)">· {nextUp.done}/{nextUp.exercise.sets.length} set</span>
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[14px] text-(--color-text-secondary)">Tümü ({exerciseLogs.length})</span>
              <svg aria-hidden="true" className="w-4 h-4 shrink-0 text-(--color-text-secondary)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
            </button>
            {draftStatus === 'error' && <span role="alert" className="text-center text-[13px]" style={{ color: 'var(--lb-drop)' }}>Taslak bu telefona kaydedilemedi</span>}
          </div>
        </>
      )}

      {staleAge !== null && !staleAnswered && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" />
          <div role="dialog" aria-modal="true" aria-labelledby="stale-title"
            className="relative w-full max-w-xl mx-auto bg-(--color-bg-card) rounded-t-[22px] px-5 pt-5 pb-[calc(24px+env(safe-area-inset-bottom))]">
            <h2 id="stale-title" className="a-display text-[34px]">Yeni bir antrenman mı?</h2>
            <p className="mt-2 text-[16px] leading-snug text-(--color-text-secondary)">
              {program.name} bu hafta {staleAge} gün önce kaydedildi. Bugün yeniden çalışıyorsan önce yeni haftaya geç; yoksa o kaydın üstüne yazarsın.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button onClick={startNewWeek} className="h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold">Yeni haftaya geç ve başla</button>
              <button onClick={() => setStaleAnswered(true)} className="h-12 rounded-2xl text-[16px] text-(--color-text-secondary)">Hayır, o kaydı düzenliyorum</button>
            </div>
          </div>
        </div>
      )}

      {/* Rest: the whole screen, a clock to read from across the room. */}
      {restShown && (
        <div role="dialog" aria-modal="true" aria-label="Dinlenme" className="fixed inset-0 z-50 bg-(--color-bg-primary) flex flex-col pt-[env(safe-area-inset-top)]">
          <div className="max-w-xl w-full mx-auto flex-1 flex flex-col">
            <div className="px-4 pt-3">
              {segments}
              <p className="h-11 mt-1.5 flex items-center justify-center text-[15px] font-semibold">{program.name}</p>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-3.5">
              <span className="text-[16px] text-(--color-text-secondary)">{timerActive ? 'Dinlenme' : 'Dinlenme bitti'}</span>
              <span className="lb-figure text-[min(42vw,168px)] leading-[0.9] font-bold">{timerActive ? formatTimer(timerRemainingSec) : '0:00'}</span>
              <span className="block w-64 h-1.5 rounded-full bg-(--color-bg-input) overflow-hidden">
                <span className="block h-1.5 bg-(--color-text-primary) transition-all duration-500" style={{ width: `${restFraction * 100}%` }} />
              </span>
              {timerActive && (
                <div className="flex gap-2.5 mt-2">
                  <button onClick={() => adjustRestTimer(-15)} className="h-[52px] px-6 rounded-full bg-(--color-bg-card) text-[17px] font-semibold">−15 sn</button>
                  <button onClick={() => adjustRestTimer(30)} className="h-[52px] px-6 rounded-full bg-(--color-bg-card) text-[17px] font-semibold">+30 sn</button>
                </div>
              )}
              <span className="text-[13px] text-(--color-text-secondary)">Süre bitince ses çalar, telefon titrer</span>
            </div>
            <div className="px-4 pb-[calc(24px+env(safe-area-inset-bottom))] flex flex-col gap-3">
              {exercise && set && current && (
                <section className="a-card rounded-[22px] px-5 py-4">
                  <span className="text-[13px] text-(--color-text-secondary)">Sıradaki</span>
                  <p className="text-[20px] font-semibold truncate">{exercise.exerciseName} · Set {current.set + 1}</p>
                  {prevSet && (
                    <div className="mt-2.5 flex items-baseline justify-between gap-3">
                      <span className="text-[14px] text-(--color-text-secondary)">Geçmen gereken</span>
                      <span className="lb-figure text-[44px] leading-none font-bold">{formatSetLine(prevSet)}</span>
                    </div>
                  )}
                </section>
              )}
              {lastFinished !== null && exerciseLogs[lastFinished] && (
                <button onClick={() => oneMoreSet(lastFinished)} className="h-12 px-4 rounded-2xl bg-(--color-bg-card) text-[16px] font-medium truncate">
                  {exerciseLogs[lastFinished].exerciseName}: bir set daha
                </button>
              )}
              <button onClick={() => { if (timerActive) stopRestTimer(); else setTimerJustFinished(false); }}
                className="h-16 rounded-[18px] bg-(--color-text-primary) text-(--color-bg-primary) text-[19px] font-semibold">Hazırım</button>
            </div>
          </div>
        </div>
      )}

      {/* Every movement, in a sheet over the set: to see the whole workout, or
          jump to another movement when a machine is taken. */}
      {screen === 'list' && (
        <Sheet title="Hareketler" onClose={() => setScreen('set')}>
          <p className="-mt-1 mb-3 text-[14px] text-(--color-text-secondary)">Makine doluysa başka bir harekete geç; sıra seni bağlamaz.</p>
          {coachDayNotes.map(note => (
            <div key={note.id} className="rounded-2xl bg-(--color-bg-input) px-4 py-3 mb-2">
              <p className="text-[13px] text-(--color-text-secondary)">Antrenörün notu · {note.author}</p>
              <p className="mt-0.5 text-[15px] whitespace-pre-line">{note.text}</p>
            </div>
          ))}
          {previousNoteLog?.notes?.trim() && (
            <div className="rounded-2xl bg-(--color-bg-input) px-4 py-3 mb-2">
              <p className="text-[13px] text-(--color-text-secondary)">Geçen {program.name} notu · {nameOfWeek(previousNoteLog.weekNumber)}</p>
              <p className="mt-0.5 text-[15px] whitespace-pre-line">{previousNoteLog.notes.trim()}</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {exerciseLogs.map((e, index) => {
              const done = e.sets.filter((_, i) => completedSets[`${e.exerciseId}:${i}`]).length;
              const isCurrent = current?.ex === index;
              return (
                <button key={e.exerciseId}
                  onClick={() => { const open = e.sets.findIndex((_, i) => !completedSets[`${e.exerciseId}:${i}`]); setFocus({ ex: index, set: open < 0 ? 0 : open }); setScreen('set'); }}
                  className="px-4 py-3 rounded-2xl bg-(--color-bg-input) flex flex-col gap-1.5 text-left"
                  style={isCurrent ? { boxShadow: 'inset 0 0 0 1.5px var(--color-text-primary)' } : undefined}>
                  <span className="w-full flex items-baseline gap-3">
                    <span className="flex-1 min-w-0 text-[17px] font-semibold truncate">{e.exerciseName}</span>
                    <span className="lb-figure shrink-0 text-[17px] font-semibold" style={{ color: done === e.sets.length ? 'var(--lb-gain)' : undefined }}>
                      {done === e.sets.length ? 'Tamam' : isCurrent ? 'Şimdi' : `${done} / ${e.sets.length}`}
                    </span>
                  </span>
                  {/* Each set as it stands: ticked ones with what was done, the rest with last week's number. */}
                  <span className="flex flex-wrap gap-1.5">
                    {e.sets.map((s, i) => {
                      const ticked = !!completedSets[`${e.exerciseId}:${i}`];
                      const before = getPreviousSetRef(e.exerciseId, i);
                      return (
                        <span key={i} className="lb-figure rounded-lg px-2 py-0.5 text-[15px]"
                          style={ticked ? { background: 'var(--lb-gain-fill)', color: 'var(--color-text-primary)' } : { background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)' }}>
                          {ticked ? formatSetLine(s) : before ? `geçen ${formatSetLine(before)}` : 'ilk kayıt'}
                        </span>
                      );
                    })}
                  </span>
                </button>
              );
            })}
          </div>
          {orderDiffersFromProgram && <p className="mt-3 text-[13px] text-(--color-text-secondary)">Yeni hareket sırası Kaydet ile programa ve sonraki haftalara uygulanır.</p>}
          <div className="mt-4 flex flex-col gap-2">
            <button onClick={() => { setScreen('set'); setAddOpen(true); }} className="h-[52px] rounded-2xl bg-(--color-bg-input) text-[16px] font-medium">Hareket ekle</button>
            <button onClick={() => setDaySettingsOpen(true)} className="h-[52px] rounded-2xl bg-(--color-bg-input) text-[16px] font-medium">Gün ayarları ve antrenman notu</button>
            <button onClick={handleSave} className="h-14 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-[17px] font-semibold">Antrenmanı kaydet ve çık</button>
          </div>
        </Sheet>
      )}

      {/* Add a movement: own ones first, then common ones, or any name typed. */}
      {addOpen && (
        <Sheet title="Hareket ekle" onClose={() => { setAddOpen(false); setAddQuery(''); }}>
          <input autoFocus value={addQuery} onChange={e => setAddQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addMovement(addQuery); }}
            placeholder="Ara: bench, göğüs, yan omuz…" aria-label="Hareket adı" enterKeyHint="done"
            className="w-full h-14 px-4 rounded-2xl bg-(--color-bg-input) text-[18px]! focus:outline-none placeholder:text-(--color-text-secondary)" />
          {/* The typed name as it is: the main choice only when nothing matches. */}
          {addQuery.trim() && !addExact && addResults.own.length + addResults.library.length === 0 && (
            <button onClick={() => addMovement(addQuery)}
              className="mt-2 w-full min-h-12 px-4 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) text-left text-[16px] font-semibold">
              “{addQuery.trim().replace(/\s+/g, ' ')}” ekle
            </button>
          )}
          {addResults.own.length > 0 && (
            <>
              <p className="mt-4 mb-1.5 text-[13px] text-(--color-text-secondary)">Daha önce yaptıkların</p>
              <div className="flex flex-col gap-1.5">
                {addResults.own.map(name => (
                  <button key={name} onClick={() => addMovement(name)} className="min-h-12 px-4 rounded-2xl bg-(--color-bg-input) flex items-center justify-between gap-3 text-left">
                    <span className="text-[16px] truncate">{name}</span>
                    <span className="shrink-0 text-[13px] text-(--color-text-secondary)">{muscleRegions(name, exerciseSettings?.[exerciseKey(name)]?.region)[0] ?? ''}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {addResults.library.length > 0 && (
            <>
              <p className="mt-4 mb-1.5 text-[13px] text-(--color-text-secondary)">Yaygın hareketler</p>
              <div className="flex flex-col gap-1.5">
                {addResults.library.map(name => (
                  <button key={name} onClick={() => addMovement(name)} className="min-h-12 px-4 rounded-2xl bg-(--color-bg-input) flex items-center justify-between gap-3 text-left">
                    <span className="text-[16px] truncate">{name}</span>
                    <span className="shrink-0 text-[13px] text-(--color-text-secondary)">{muscleRegions(name)[0] ?? ''}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {addQuery.trim() && !addExact && addResults.own.length + addResults.library.length > 0 && (
            <button onClick={() => addMovement(addQuery)} className="mt-3 w-full min-h-12 px-4 rounded-2xl text-left text-[16px] text-(--color-text-secondary)">
              Listede yok mu? “{addQuery.trim().replace(/\s+/g, ' ')}” adıyla ekle
            </button>
          )}
        </Sheet>
      )}

      {/* What belongs to the movement rather than the set. */}
      {exerciseSheetOpen && exercise && current && (
        <Sheet title={exercise.exerciseName} onClose={() => { setExerciseSheetOpen(false); setPinnedEdit(null); setRuleEdit(null); }}>
          <div>
            <span className="text-[14px] text-(--color-text-secondary)">Çalıştırdığı bölge{regions.length && !chosenRegion ? ' · adından anlaşıldı, değiştirebilirsin' : ''}</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {REGIONS.map(region => {
                const on = regions[0] === region;
                return (
                  <button key={region} onClick={() => ctx?.dispatch({ type: 'SET_EXERCISE_SETTINGS', payload: { key, settings: { region: on && chosenRegion ? '' : region } } })}
                    aria-pressed={on} title={REGION_HINTS[region]}
                    className={`h-11 px-3.5 rounded-full text-[15px] ${on ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-input)'}`}>
                    {region}
                  </button>
                );
              })}
            </div>
            {regions[0] && REGION_HINTS[regions[0]] && <p className="mt-1 text-[13px] text-(--color-text-secondary)">{regions[0]}: {REGION_HINTS[regions[0]]}</p>}
          </div>

          <div className="mt-4">
            <span className="text-[14px] text-(--color-text-secondary)">Sabit not · her antrenmanda görünür</span>
            {pinnedEdit?.key === key ? (
              <div className="mt-1 flex items-center gap-2">
                <input autoFocus value={pinnedEdit.text} onChange={e => setPinnedEdit({ key, text: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') savePinned(); }} placeholder="Koltuk 3, 6. delik…" aria-label="Sabit not"
                  className="flex-1 min-w-0 px-4 h-12 rounded-2xl bg-(--color-bg-input) text-[16px] focus:outline-none placeholder:text-(--color-text-secondary)" />
                <button onClick={savePinned} className="h-12 px-4 rounded-2xl bg-(--color-text-primary) text-(--color-bg-primary) font-semibold">Kaydet</button>
              </div>
            ) : (
              <button onClick={() => setPinnedEdit({ key, text: pinned ?? '' })} className="mt-1 w-full min-h-12 px-4 rounded-2xl bg-(--color-bg-input) text-left text-[16px]">
                {pinned || <span className="text-(--color-text-secondary)">Ekle</span>}
              </button>
            )}
          </div>

          {info?.rule && (
            <div className="mt-4">
              <span className="text-[14px] text-(--color-text-secondary)">Kilo artış kuralı</span>
              {ruleEdit?.key === key ? (
                <div className="mt-1 flex flex-wrap items-end gap-2">
                  <label className="text-[13px] text-(--color-text-secondary)">Kaç tekrarda
                    <input inputMode="numeric" value={ruleEdit.repTop} onChange={e => setRuleEdit({ ...ruleEdit, repTop: e.target.value })}
                      className="lb-figure block mt-1 w-20 px-3 h-12 rounded-xl bg-(--color-bg-input) text-[20px] text-(--color-text-primary) focus:outline-none" />
                  </label>
                  <label className="text-[13px] text-(--color-text-secondary)">Kaç kg
                    <input inputMode="decimal" value={ruleEdit.step} onChange={e => setRuleEdit({ ...ruleEdit, step: e.target.value })}
                      className="lb-figure block mt-1 w-20 px-3 h-12 rounded-xl bg-(--color-bg-input) text-[20px] text-(--color-text-primary) focus:outline-none" />
                  </label>
                  <button onClick={() => saveRule()} className="h-12 px-4 rounded-xl bg-(--color-text-primary) text-(--color-bg-primary) font-semibold">Kaydet</button>
                  {info.rule.source === 'manual' && <button onClick={() => saveRule(true)} className="h-12 px-2 text-[15px]">Geçmişten öğren</button>}
                </div>
              ) : (
                <button onClick={() => setRuleEdit({ key, repTop: String(info.rule.repTop), step: String(info.rule.step) })}
                  className="mt-1 w-full min-h-12 px-4 rounded-2xl bg-(--color-bg-input) text-left text-[16px]">
                  {info.rule.repTop} tekrarda +{info.rule.step} kg <span className="text-(--color-text-secondary)">· {{ manual: 'senin ayarın', log: 'geçmişinden', step: 'tekrar varsayılan, artış geçmişinden', default: 'varsayılan' }[info.rule.source]}</span>
                </button>
              )}
              {info.stall && info.stall.weeks >= STALL_WEEKS && (
                <p className="mt-1 text-[14px] text-(--color-text-secondary)">{info.stall.weeks} haftadır yerinde · en iyi {formatSet(info.stall.best)}, {nameOfWeek(info.stall.since)}</p>
              )}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button onClick={() => { addSet(current.ex); setFocus({ ex: current.ex, set: exercise.sets.length }); setExerciseSheetOpen(false); }}
              className="h-[52px] rounded-2xl bg-(--color-bg-input) text-[16px] font-medium">Set ekle</button>
            <button disabled={exercise.sets.length <= 1} onClick={() => { removeSet(current.ex, current.set); setFocus(null); setExerciseSheetOpen(false); }}
              className="h-[52px] rounded-2xl bg-(--color-bg-input) text-[16px] font-medium disabled:opacity-30" style={{ color: 'var(--lb-drop)' }}>Bu seti sil</button>
            <button disabled={current.ex === 0} onClick={() => { moveExercise(current.ex, -1); setFocus({ ex: current.ex - 1, set: current.set }); }}
              className="h-[52px] rounded-2xl bg-(--color-bg-input) text-[16px] font-medium disabled:opacity-30">Sırada yukarı al</button>
            <button disabled={current.ex === exerciseLogs.length - 1} onClick={() => { moveExercise(current.ex, 1); setFocus({ ex: current.ex + 1, set: current.set }); }}
              className="h-[52px] rounded-2xl bg-(--color-bg-input) text-[16px] font-medium disabled:opacity-30">Sırada aşağı al</button>
          </div>
        </Sheet>
      )}

      {/* What F, +1, +2 and +3 mean, with this set's own numbers. */}
      {rirHelpOpen && (
        <Sheet title="Kaç tekrar daha?" onClose={() => setRirHelpOpen(false)}>
          <p className="text-[16px] leading-snug">Seti bitirince kendine sor: bu sette kaç tekrar daha yapabilirdim?</p>
          <div className="mt-3 flex flex-col gap-1.5">
            {[['F', 'tükendim', 'Bir tekrar daha yapamazdın.'], ['+1', '1 daha', 'Bir tekrar daha yapabilirdin.'], ['+2', '2 daha', 'İki tekrar daha yapabilirdin.'], ['+3', '3 daha', 'Üç tekrar daha yapabilirdin.']].map(([mark, label, text]) => (
              <div key={mark} className="flex items-center gap-3 rounded-2xl bg-(--color-bg-input) px-4 py-2.5">
                <span className="w-14 shrink-0 flex flex-col items-center gap-0.5">
                  <span className="lb-figure text-[20px] font-bold leading-none">{mark}</span>
                  <span className="text-[12px] leading-none text-(--color-text-secondary)">{label}</span>
                </span>
                <span className="text-[15px]">{text}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[15px] leading-snug text-(--color-text-secondary)">
            Kayıtta <span className="lb-figure font-semibold text-(--color-text-primary)">{set ? formatSetLine({ ...set, intensity: 'rir1' }) : '75 x 8 +1'}</span> diye görünür.
            Kilo ve tekrar geçen haftayla aynıyken daha çok tekrar payı bırakmak Geçmiş'te ilerleme sayılır.
          </p>
        </Sheet>
      )}

      {/* Both notes a workout can leave, in one place: for this movement and
          for the day. Each shows up the next time that movement or day is trained. */}
      {noteSheetOpen && exercise && current && (
        <Sheet title="Not" onClose={() => setNoteSheetOpen(false)}>
          <label className="block">
            <span className="text-[14px] text-(--color-text-secondary)">{exercise.exerciseName} · bir sonraki {exercise.exerciseName} antrenmanında görünür</span>
            <textarea value={exercise.note ?? ''} onChange={e => updateExerciseNote(current.ex, e.target.value)} rows={2} placeholder="Haftaya 50 kilo gir…"
              className="mt-1 w-full px-4 py-3 rounded-2xl bg-(--color-bg-input) text-[16px] resize-none focus:outline-none placeholder:text-(--color-text-secondary)" />
          </label>
          <label className="mt-4 block">
            <span className="text-[14px] text-(--color-text-secondary)">Antrenman notu · bir sonraki {program.name} antrenmanında görünür</span>
            <textarea value={notes} onChange={e => { setNotes(e.target.value); setIsDirty(true); }} rows={3} placeholder="Bugün uykusuzdum…"
              className="mt-1 w-full px-4 py-3 rounded-2xl bg-(--color-bg-input) text-[16px] resize-none focus:outline-none placeholder:text-(--color-text-secondary)" />
          </label>
        </Sheet>
      )}

      {/* Everything about the day itself, out of the way of the sets. */}
      {daySettingsOpen && (
        <Sheet title="Gün ayarları" onClose={() => setDaySettingsOpen(false)}>
          <label className="flex items-center justify-between gap-3 min-h-14">
            <span className="text-[17px]">Tarih</span>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setIsDirty(true); }}
              className="lb-figure h-11 px-3 rounded-xl bg-(--color-bg-input) text-[20px]! focus:outline-none" />
          </label>
          <ToggleRow label="Tatil" checked={isHoliday} onChange={value => { setIsHoliday(value); setIsDirty(true); }} />
          {!isHoliday && (
            <>
              <ToggleRow label="Zor gün" checked={offDay} onChange={value => { setOffDay(value); setIsDirty(true); }} />
              <p className="text-[14px] leading-snug text-(--color-text-secondary)">Hasta, uykusuz, ağrılı ya da aceleyle geldiysen aç. Bu günün rengi yine hesaplanır; sonraki hafta ondan önceki normal günle kıyaslanır.</p>
            </>
          )}

          <div className="mt-5 a-card !bg-(--color-bg-input) px-4 py-3.5">
            <span className="text-[14px] text-(--color-text-secondary)">Set arası dinlenme</span>
            <div className="mt-1 flex items-center justify-between">
              <button aria-label="15 sn kısalt" onClick={() => setRestDurationSec(sec => Math.max(15, sec - 15))} className="w-14 h-14 rounded-full bg-(--color-bg-card) text-[24px]">−</button>
              <span className="lb-figure text-[56px] leading-none font-bold">{formatTimer(restDurationSec)}</span>
              <button aria-label="15 sn uzat" onClick={() => setRestDurationSec(sec => Math.min(7200, sec + 15))} className="w-14 h-14 rounded-full bg-(--color-bg-card) text-[24px]">+</button>
            </div>
            {recentDurations.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {recentDurations.map(sec => (
                  <button key={sec} onClick={() => setRestDurationSec(sec)}
                    className={`lb-figure h-11 rounded-xl text-[17px] ${restDurationSec === sec ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'bg-(--color-bg-card)'}`}>
                    {formatTimer(sec)}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <input type="number" min={1} step={1} inputMode="numeric" value={customDurationInput}
                onChange={e => setCustomDurationInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void handleStartCustomTimer(); }}
                placeholder="Başka süre" aria-label="Başka dinlenme süresi"
                className="lb-figure flex-1 min-w-0 h-11 px-3 rounded-xl bg-(--color-bg-card) text-[18px]! focus:outline-none placeholder:text-(--color-text-secondary)" />
              <div className="flex p-1 rounded-xl bg-(--color-bg-card)">
                {(['sec', 'min'] as const).map(unit => (
                  <button key={unit} onClick={() => setCustomDurationUnit(unit)} aria-pressed={customDurationUnit === unit}
                    className={`h-9 px-3 rounded-lg text-[15px] ${customDurationUnit === unit ? 'bg-(--color-text-primary) text-(--color-bg-primary) font-semibold' : 'text-(--color-text-secondary)'}`}>
                    {unit === 'sec' ? 'sn' : 'dk'}
                  </button>
                ))}
              </div>
              <button onClick={() => void handleStartCustomTimer()} disabled={!customDurationInput || Number(customDurationInput) <= 0}
                className="h-11 px-3 text-[16px] font-semibold disabled:opacity-30">Başlat</button>
            </div>
            <p className="mt-2 text-[13px] text-(--color-text-secondary)">
              {recentDurations.length > 0 ? 'Son kullandığın süreler. ' : ''}
              {notificationPermission === 'granted' ? 'Süre bitince ses, titreşim ve bildirim.' : 'Süre bitince ses çalar ve telefon titrer.'}
              {notificationPermission === 'default' && <> <button onClick={handleEnableNotifications} className="underline underline-offset-2">Bildirim izni ver</button></>}
            </p>
          </div>

          <label className="mt-5 block">
            <span className="text-[14px] text-(--color-text-secondary)">Antrenman notu</span>
            <textarea value={notes} onChange={e => { setNotes(e.target.value); setIsDirty(true); }} rows={3} placeholder="Bu antrenman hakkında not…"
              className="mt-1 w-full px-4 py-3 rounded-2xl bg-(--color-bg-input) text-[16px] resize-none focus:outline-none placeholder:text-(--color-text-secondary)" />
          </label>
          <p className="text-[13px] text-(--color-text-secondary)">Bir hareketle ilgiliyse o hareketin ekranında “Not ekle”ye dokun.</p>

          {(existingLog || isDirty) && (
            <button onClick={() => { setDaySettingsOpen(false); setConfirmClear(true); }}
              className="mt-5 w-full h-[52px] rounded-2xl bg-(--color-bg-input) text-[16px] font-medium" style={{ color: 'var(--lb-drop)' }}>Bu haftanın kaydını sil</button>
          )}
        </Sheet>
      )}

      <Modal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={handleClearWeek}
        title="Bu haftanın kaydı silinsin mi?"
        message={`${program.name} · ${nameOfWeek(weekNumber)}: setler, not ve tatil işareti silinir. Diğer haftalar ve program değişmez.`}
        confirmText="Sil"
        confirmVariant="danger"
      />
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <button aria-label="Kapat" className="absolute inset-0 bg-black/50 cursor-default" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="relative w-full max-w-xl mx-auto max-h-[90vh] overflow-y-auto bg-(--color-bg-card) rounded-t-[22px] px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="a-display text-[30px] truncate">{title}</h2>
          <button onClick={onClose} className="shrink-0 h-11 px-4 rounded-full bg-(--color-bg-input) text-[15px] font-semibold">Tamam</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-14">
      <span className="text-[17px]">{label}</span>
      <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className="relative w-[52px] h-8 rounded-full" style={{ background: checked ? 'var(--color-text-primary)' : 'var(--color-bg-input)' }}>
        <span className="absolute top-[3px] w-[26px] h-[26px] rounded-full transition-all"
          style={{ left: checked ? 23 : 3, background: checked ? 'var(--color-bg-card)' : 'var(--color-text-secondary)' }} />
      </button>
    </div>
  );
}
