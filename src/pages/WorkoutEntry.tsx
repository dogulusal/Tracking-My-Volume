import { AppContext } from '@/context/AppContext';
import { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { usePrograms } from '@/hooks/usePrograms';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { PageContainer } from '@/components/layout/PageContainer';
import { formatSet } from '@/utils/formatters';
import { moveItem } from '@/utils/reorder';
import { syncExerciseLogs, syncProgramFromWorkout } from '@/utils/exerciseSync';
import type { SetLog, Intensity, ExerciseLog } from '@/types';

const INTENSITY_OPTIONS: { value: Intensity; label: string }[] = [
  { value: 'failure', label: 'F' },
  { value: 'rir1', label: '1' },
  { value: 'rir2', label: '2' },
  { value: 'rir3', label: '3' },
];
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
  const { getLogForWeek, getPreviousLog, saveWorkout } = useWeekLogs();
  const isMobile = useIsMobileDevice();

  const weekNumber = Number(weekParam) || 0;
  const ctx = useContext(AppContext);
  const phase = ctx?.state.phases.find(p => weekNumber >= p.startWeek && (p.endWeek === null || weekNumber <= p.endWeek));
  const displayWeek = weekNumber - (phase?.startWeek ?? 0);
  const program = getProgramById(programId || '');
  const existingLog = getLogForWeek(programId || '', weekNumber);
  const previousCandidate = getPreviousLog(programId || '', weekNumber);
  const previousLog = previousCandidate && previousCandidate.weekNumber >= (phase?.startWeek ?? 0) ? previousCandidate : null;

  const [isHoliday, setIsHoliday] = useState(existingLog?.isHoliday || false);
  const [notes, setNotes] = useState(existingLog?.notes || '');
  const [date, setDate] = useState(
    existingLog?.date || new Date().toISOString().split('T')[0]
  );
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<string | null | undefined>(undefined);
  const [showAllExercises, setShowAllExercises] = useState(false);
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
        JSON.stringify({ exerciseLogs, notes, date, isHoliday, completedSets, savedAt: new Date().toISOString() })
      );
      setDraftStatus('saved');
    } catch { setDraftStatus('error'); }
  }, [exerciseLogs, notes, date, isHoliday, isDirty, draftKey, completedSets]);

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

  const renderRepStepper = (exerciseIdx: number, setIdx: number, reps: number) => (
    <span className="flex shrink-0 gap-1">
      {([-1, 1] as const).map(delta => <button key={delta} type="button"
        aria-label={`Set ${setIdx + 1} Rep ${delta > 0 ? 'artır' : 'azalt'}`}
        onPointerDown={e => e.preventDefault()}
        onClick={() => handleSetFieldChange(exerciseIdx, setIdx, 'reps', String(Math.max(0, reps + delta)))}
        className="lb-press w-10 h-11 rounded-lg border lb-rule text-lg font-semibold">{delta > 0 ? '+' : '−'}</button>)}
    </span>
  );

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
      const updated = syncProgramFromWorkout(program, exerciseLogs, editedExerciseIdsRef.current, orderDiffersFromProgram);
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
      exercises: exerciseLogs,
      notes,
      isHoliday,
      updatedAt: new Date().toISOString(),
    });
    localStorage.removeItem(draftKey);
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

  const startRestTimer = (seconds: number = restDurationSec) => {
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
    addRecentDuration(safeSeconds);
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
            onClick={() => navigate(returnPath)}
            className="lb-press text-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) mb-1"
          >
            ← Geri
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
          <p className="lb-label">{phase?.name} · H{displayWeek}</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => { setDate(e.target.value); setIsDirty(true); }}
          className="lb-figure px-4 py-2.5 bg-(--color-bg-input) border lb-rule rounded-lg text-sm focus:outline-none"
        />
      </div>

      {/* Holiday Toggle */}
      <label className="lb-press flex items-center gap-3 px-3 py-3 -mx-3 rounded-lg border-b lb-rule mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={isHoliday}
          onChange={e => { setIsHoliday(e.target.checked); setIsDirty(true); }}
          className="w-5 h-5 rounded"
        />
        <span className="text-sm font-medium">Bu günü tatil olarak işaretle</span>
      </label>

      {/* Rest timer control */}
      {!isHoliday && (
        <details className="mb-6 rounded-lg border lb-rule overflow-hidden">
          <summary className="lb-press cursor-pointer px-4 py-3 text-sm font-semibold">Set arası dinlenme · {formatDurationLabel(restDurationSec)} <span className="lb-label ml-2">Ayarlar</span></summary>

          {/* Header row */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b lb-rule">
            <p className="text-sm font-semibold">⏱ Set arası dinlenme</p>
            {notificationPermission === 'default' && (
              <button
                onClick={handleEnableNotifications}
                className="text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) hover:underline"
              >
                Bildirim izni ver
              </button>
            )}
            {notificationPermission === 'granted' && (
              <span className="text-xs font-medium" style={{ color: 'var(--lb-gain)' }}>● Bildirimler açık</span>
            )}
            {notificationPermission === 'denied' && (
              <span className="lb-label">Bildirim engellendi</span>
            )}
          </div>

          <div className="p-5 space-y-4">

            {/* Last 3 used durations — big tap targets */}
            {recentDurations.length > 0 ? (
              <div className={`grid gap-3 ${
                recentDurations.length === 1 ? 'grid-cols-1'
                  : recentDurations.length === 2 ? 'grid-cols-2'
                  : 'grid-cols-3'
              }`}>
                {recentDurations.map(sec => (
                  <button
                    key={sec}
                    onClick={() => { setRestDurationSec(sec); startRestTimer(sec); }}
                    className={`lb-press lb-figure py-5 rounded-lg text-2xl font-semibold border ${
                      restDurationSec === sec
                        ? 'lb-rule-strong bg-(--color-bg-input)'
                        : 'lb-rule text-(--color-text-secondary)'
                    }`}
                  >
                    {formatDurationLabel(sec)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="lb-label text-center py-2">
                Henüz kayıtlı süre yok — özel süre girerek başlayabilirsin.
              </p>
            )}

            {/* Custom duration row */}
            <div className="flex gap-2">
              <div className="flex flex-1 items-center bg-(--color-bg-input) border lb-rule rounded-lg overflow-hidden">
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={customDurationInput}
                  onChange={e => setCustomDurationInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleStartCustomTimer(); }}
                  placeholder="Süre gir…"
                  className="lb-figure flex-1 min-w-0 px-4 py-3 bg-transparent text-sm focus:outline-none placeholder:text-(--color-text-secondary)"
                />
              </div>
              {/* Unit choice is a selection, not a signal — stays neutral */}
              <div className="flex items-stretch rounded-lg overflow-hidden border lb-rule shrink-0">
                <button
                  onClick={() => setCustomDurationUnit('sec')}
                  className={`lb-press px-3 text-sm font-semibold ${
                    customDurationUnit === 'sec'
                      ? 'bg-(--color-text-primary) text-(--color-bg-primary)'
                      : 'text-(--color-text-secondary)'
                  }`}
                >sn</button>
                <button
                  onClick={() => setCustomDurationUnit('min')}
                  className={`lb-press px-3 text-sm font-semibold border-l lb-rule ${
                    customDurationUnit === 'min'
                      ? 'bg-(--color-text-primary) text-(--color-bg-primary)'
                      : 'text-(--color-text-secondary)'
                  }`}
                >dk</button>
              </div>
              <button
                onClick={handleStartCustomTimer}
                disabled={!customDurationInput || Number(customDurationInput) <= 0}
                className="lb-press px-5 py-3 border lb-rule-strong font-semibold rounded-lg disabled:opacity-40 whitespace-nowrap"
              >
                Başlat
              </button>
            </div>

            <p className="lb-label">
              {notificationPermission === 'granted'
                ? 'Süre bitince ses + titreşim + bildirim. Uygulama arka plandayken de uyarır.'
                : 'Süre bitince ses çalar ve telefon titreşir.'}
            </p>

          </div>
        </details>
      )}



      {/* Exercise Cards */}
      {!isHoliday && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="lb-label">{exerciseLogs.length} egzersiz · {exerciseLogs.reduce((count, e) => count + e.sets.filter((_, i) => completedSets[`${e.exerciseId}:${i}`]).length, 0)}/{exerciseLogs.reduce((count, e) => count + e.sets.length, 0)} set işaretlendi</p>
            <button onClick={() => setShowAllExercises(!showAllExercises)} className="lb-press text-xs px-3 py-2 border lb-rule rounded-lg">{showAllExercises ? 'Tek egzersiz göster' : 'Tümünü aç'}</button>
          </div>
          {exerciseLogs.map((exercise, exIdx) => (
            <div key={exercise.exerciseId} className="pb-5 border-b lb-rule">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="font-semibold text-base flex-1 min-w-0">
                  <button className="lb-press w-full text-left py-2 rounded-lg" aria-expanded={showAllExercises || (expandedExercise === undefined ? exIdx === 0 : expandedExercise === exercise.exerciseId)} aria-controls={`exercise-${exercise.exerciseId}`} onClick={() => {
                    setShowAllExercises(false);
                    setExpandedExercise((expandedExercise === undefined ? exIdx === 0 : expandedExercise === exercise.exerciseId) ? null : exercise.exerciseId);
                  }}>
                    <span className="lb-label mr-3">{String(exIdx + 1).padStart(2, '0')}</span>{exercise.exerciseName}
                    <span className="lb-label block mt-1">{exercise.sets.length} set · {exercise.sets.filter((_, i) => completedSets[`${exercise.exerciseId}:${i}`]).length} işaretlendi {showAllExercises || (expandedExercise === undefined ? exIdx === 0 : expandedExercise === exercise.exerciseId) ? '−' : '+'}</span>
                  </button>
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveExercise(exIdx, -1)}
                    disabled={exIdx === 0}
                    aria-label={`${exercise.exerciseName} yukarı taşı`}
                    title="Yukarı taşı"
                    className="lb-press px-2 py-1 leading-none text-sm rounded-lg border lb-rule text-(--color-text-secondary) disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveExercise(exIdx, 1)}
                    disabled={exIdx === exerciseLogs.length - 1}
                    aria-label={`${exercise.exerciseName} aşağı taşı`}
                    title="Aşağı taşı"
                    className="lb-press px-2 py-1 leading-none text-sm rounded-lg border lb-rule text-(--color-text-secondary) disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ▼
                  </button>
                </div>
              </div>

              <div id={`exercise-${exercise.exerciseId}`} hidden={!(showAllExercises || (expandedExercise === undefined ? exIdx === 0 : expandedExercise === exercise.exerciseId))}>
              {/* Sets */}
              <div className="space-y-2.5 md:space-y-2.5">
                {exercise.sets.map((set, setIdx) => {
                  const prevSet = getPreviousSetRef(exercise.exerciseId, setIdx);
                  return isMobile ? (
                    /* ── Mobile: Card layout ── */
                    <div key={setIdx} className="rounded-lg p-3 border lb-rule relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold">Set {setIdx + 1}</span>
                        {prevSet && (
                          <span className="lb-figure text-xs text-(--color-text-secondary)">
                            Geçen: {formatSet(prevSet)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="lb-label mb-1 block">Ağırlık</label>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={getSetFieldDisplayValue(exIdx, setIdx, 'weight', set.weight)}
                              onChange={e => handleSetFieldChange(exIdx, setIdx, 'weight', e.target.value)}
                              onFocus={() => handleSetFieldFocus(exIdx, setIdx, 'weight', set.weight)}
                              onBlur={() => handleSetFieldBlur(exIdx, setIdx, 'weight', set.weight)}
                              step={0.5}
                              min={0}
                              className="lb-figure w-full px-3 py-3 bg-(--color-bg-input) border lb-rule rounded-lg text-lg font-semibold focus:outline-none focus:border-(--color-text-primary)"
                            />
                            <span className="lb-label absolute right-3 top-1/2 -translate-y-1/2">kg</span>
                          </div>
                        </div>
                        <div>
                          <label className="lb-label mb-1 block">Tekrar</label>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={getSetFieldDisplayValue(exIdx, setIdx, 'reps', set.reps)}
                              onChange={e => handleSetFieldChange(exIdx, setIdx, 'reps', e.target.value)}
                              onFocus={() => handleSetFieldFocus(exIdx, setIdx, 'reps', set.reps)}
                              onBlur={() => handleSetFieldBlur(exIdx, setIdx, 'reps', set.reps)}
                              min={0}
                              className="lb-figure w-full px-3 py-3 bg-(--color-bg-input) border lb-rule rounded-lg text-lg font-semibold focus:outline-none focus:border-(--color-text-primary)"
                            />
                            <span className="lb-label absolute right-3 top-1/2 -translate-y-1/2">rep</span>
                          </div>
                          <div className="flex justify-end mt-2">{renderRepStepper(exIdx, setIdx, set.reps)}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="lb-label mr-1">RIR</span>
                        {/* Which RIR you picked is a selection, not a gain/drop —
                            neutral fill reads faster mid-set than accent anyway. */}
                        {INTENSITY_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => updateSet(exIdx, setIdx, 'intensity', opt.value)}
                            className={`lb-press w-11 h-11 rounded-lg text-sm font-semibold border ${
                              set.intensity === opt.value
                                ? 'bg-(--color-text-primary) text-(--color-bg-primary) border-transparent'
                                : 'lb-rule text-(--color-text-secondary)'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            const key = `${exercise.exerciseId}:${setIdx}`;
                            setCompletedSets(prev => ({ ...prev, [key]: !prev[key] }));
                            setIsDirty(true);
                            if (!completedSets[key]) startRestTimer();
                          }}
                          aria-pressed={!!completedSets[`${exercise.exerciseId}:${setIdx}`]}
                          aria-label={`Set ${setIdx + 1} ${completedSets[`${exercise.exerciseId}:${setIdx}`] ? 'işaretini kaldır' : 'tamamla ve dinlenmeyi başlat'}`}
                          className={`lb-press w-11 h-11 rounded-lg text-sm font-semibold border ${
                            completedSets[`${exercise.exerciseId}:${setIdx}`] ? 'bg-(--color-text-primary) text-(--color-bg-primary) border-transparent' : 'lb-rule text-(--color-text-secondary)'
                          }`}
                          title="Set bitti — dinlenme sayacını başlat"
                        >
                          ✓
                        </button>
                        {exercise.sets.length > 1 && (
                          <button
                            onClick={() => removeSet(exIdx, setIdx)}
                            aria-label={`Set ${setIdx + 1} sil`}
                            className="lb-press ml-auto w-9 h-9 rounded-full border text-sm flex items-center justify-center"
                            style={{ borderColor: 'var(--lb-drop)', color: 'var(--lb-drop)' }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── Desktop: Inline layout (unchanged) ── */
                    <div key={setIdx} className="flex flex-wrap items-center gap-2">
                      <span className="lb-figure text-xs font-semibold text-(--color-text-secondary) w-8">S{setIdx + 1}</span>

                      {/* Weight */}
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getSetFieldDisplayValue(exIdx, setIdx, 'weight', set.weight)}
                          onChange={e => handleSetFieldChange(exIdx, setIdx, 'weight', e.target.value)}
                          onFocus={() => handleSetFieldFocus(exIdx, setIdx, 'weight', set.weight)}
                          onBlur={() => handleSetFieldBlur(exIdx, setIdx, 'weight', set.weight)}
                          step={0.5}
                          min={0}
                          className="lb-figure w-16 px-2 py-1.5 bg-(--color-bg-input) border lb-rule rounded-lg text-sm font-semibold focus:outline-none focus:border-(--color-text-primary)"
                        />
                        <span className="lb-label">kg</span>
                      </div>

                      {/* Reps */}
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={getSetFieldDisplayValue(exIdx, setIdx, 'reps', set.reps)}
                          onChange={e => handleSetFieldChange(exIdx, setIdx, 'reps', e.target.value)}
                          onFocus={() => handleSetFieldFocus(exIdx, setIdx, 'reps', set.reps)}
                          onBlur={() => handleSetFieldBlur(exIdx, setIdx, 'reps', set.reps)}
                          min={0}
                          className="lb-figure w-14 px-2 py-1.5 bg-(--color-bg-input) border lb-rule rounded-lg text-sm font-semibold focus:outline-none focus:border-(--color-text-primary)"
                        />
                        <span className="lb-label">rep</span>
                        {renderRepStepper(exIdx, setIdx, set.reps)}
                      </div>

                      {/* Intensity */}
                      <div className="flex gap-1">
                        {INTENSITY_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => updateSet(exIdx, setIdx, 'intensity', opt.value)}
                            className={`lb-press w-8 h-8 rounded-lg text-xs font-semibold border ${
                              set.intensity === opt.value
                                ? 'bg-(--color-text-primary) text-(--color-bg-primary) border-transparent'
                                : 'lb-rule text-(--color-text-secondary)'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            const key = `${exercise.exerciseId}:${setIdx}`;
                            setCompletedSets(prev => ({ ...prev, [key]: !prev[key] }));
                            setIsDirty(true);
                            if (!completedSets[key]) startRestTimer();
                          }}
                          aria-pressed={!!completedSets[`${exercise.exerciseId}:${setIdx}`]}
                          aria-label={`Set ${setIdx + 1} ${completedSets[`${exercise.exerciseId}:${setIdx}`] ? 'işaretini kaldır' : 'tamamla ve dinlenmeyi başlat'}`}
                          className={`lb-press w-8 h-8 rounded-lg text-xs font-semibold border ${
                            completedSets[`${exercise.exerciseId}:${setIdx}`] ? 'bg-(--color-text-primary) text-(--color-bg-primary) border-transparent' : 'lb-rule text-(--color-text-secondary)'
                          }`}
                          title="Set bitti — dinlenme sayacını başlat"
                        >
                          ✓
                        </button>
                      </div>

                      {/* Remove set */}
                      {exercise.sets.length > 1 && (
                        <button
                          onClick={() => removeSet(exIdx, setIdx)}
                          aria-label={`Set ${setIdx + 1} sil`}
                          className="lb-press text-xs font-semibold ml-1 px-1.5 py-1 rounded"
                          style={{ color: 'var(--lb-drop)' }}
                        >
                          ✕
                        </button>
                      )}

                      {/* Previous reference */}
                      {prevSet && (
                        <span className="lb-figure text-xs text-(--color-text-secondary) ml-auto">
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
                className="lb-press mt-3 text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)"
              >
                + Set ekle
              </button>
              {exIdx < exerciseLogs.length - 1 && <button onClick={() => { setShowAllExercises(false); setExpandedExercise(exerciseLogs[exIdx + 1].exerciseId); }} className="lb-press mt-3 ml-4 text-xs font-semibold px-3 py-2 border lb-rule rounded-lg">Sonraki egzersiz →</button>}
              </div>
            </div>
          ))}

          {orderDiffersFromProgram && (
            <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg bg-(--color-bg-input) border lb-rule">
              <span className="lb-label flex-1 min-w-[200px]">
                Yeni hareket sırası Kaydet ile programa ve sonraki haftalara uygulanacak.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="mt-6">
        <label className="block text-sm font-semibold mb-2">
          Antrenman notu
        </label>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); setIsDirty(true); }}
          placeholder="Bu antrenman hakkında not..."
          rows={3}
          className="w-full px-4 py-3 bg-(--color-bg-input) border lb-rule rounded-lg text-sm resize-none focus:outline-none focus:border-(--color-text-primary) placeholder:text-(--color-text-secondary)"
        />
      </div>

      {/* Save Button — the page's one primary action, so it gets the solid
          fill. Neutral, because saving isn't a gain or a drop. */}
      <div className="h-28" />
      <div className={`fixed left-0 right-0 z-40 bg-(--color-bg-card) border-t lb-rule p-3 ${isMobile ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))]' : 'bottom-0'}`}>
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0"><p className="text-sm font-semibold truncate">{program.name} · H{displayWeek}</p>
            <p role="status" className="lb-label mt-1">{draftStatus === 'error' ? 'Taslak kaydedilemedi' : isDirty && draftStatus === 'saved' ? 'Taslak bu cihazda saklandı' : existingLog ? 'Kayıt düzenleniyor' : 'Kaydet ile antrenmanı tamamla'}</p>
          </div>
          <button onClick={handleSave} className="lb-press shrink-0 px-6 py-3 bg-(--color-text-primary) text-(--color-bg-primary) font-semibold rounded-lg">Kaydet</button>
        </div>
      </div>

      {/* Floating rest timer */}
      <div
        className={`fixed z-50 transition-all duration-300 ${
          (timerActive || timerJustFinished) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'
        } ${
          isMobile ? 'bottom-[calc(10rem+env(safe-area-inset-bottom))] left-4 right-4' : 'bottom-24 right-6 w-72'
        }`}
      >
        {timerJustFinished && !timerActive ? (
          /* Finished state — reliable visual alert for iOS where audio may be
             blocked. Green here is the same "completed" meaning the Dashboard
             uses for a logged workout, not decoration. */
          <div
            className="bg-(--color-bg-card) border rounded-lg p-5 shadow-2xl text-center"
            style={{ borderColor: 'var(--lb-gain)' }}
          >
            <p className="text-xl font-semibold" style={{ color: 'var(--lb-gain)' }}>✓ Dinlenme bitti</p>
            <p className="lb-label mt-1">Sonraki sete hazırsın.</p>
            <button
              onClick={() => setTimerJustFinished(false)}
              className="lb-press mt-3 px-5 py-1.5 text-sm font-semibold border lb-rule-strong rounded-lg"
            >Tamam</button>
          </div>
        ) : (
          <div className="bg-(--color-bg-card) border lb-rule-strong rounded-lg p-4 shadow-2xl">
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-(--color-bg-input) rounded-full mb-3 overflow-hidden">
              <div
                className="h-full bg-(--color-text-primary) rounded-full transition-all duration-1000"
                style={{ width: `${timerTotalRef.current > 0 ? (timerRemainingSec / timerTotalRef.current) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="lb-label mb-0.5">Dinlenme süresi</p>
                <p className="lb-figure text-3xl font-semibold leading-none">{formatTimer(timerRemainingSec)}</p>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <button
                  onClick={stopRestTimer}
                  className="lb-press w-8 h-8 rounded-full border text-xs font-semibold flex items-center justify-center"
                  style={{ borderColor: 'var(--lb-drop)', color: 'var(--lb-drop)' }}
                  title="Sayacı durdur"
                >
                  ✕
                </button>
                <div className="flex gap-1">
                  {[60, 90, 120, 180].map(sec => (
                    <button
                      key={sec}
                      onClick={() => { setRestDurationSec(sec); startRestTimer(sec); }}
                      className={`lb-press lb-figure px-2 py-1 rounded text-[10px] font-semibold border ${
                        restDurationSec === sec
                          ? 'bg-(--color-text-primary) text-(--color-bg-primary) border-transparent'
                          : 'lb-rule text-(--color-text-secondary)'
                      }`}
                    >
                      {sec < 60 ? `${sec}s` : `${sec / 60}dk`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
