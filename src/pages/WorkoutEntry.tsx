import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePrograms } from '@/hooks/usePrograms';
import { useWeekLogs } from '@/hooks/useWeekLogs';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { PageContainer } from '@/components/layout/PageContainer';
import { formatSet } from '@/utils/formatters';
import type { SetLog, Intensity, ExerciseLog } from '@/types';

const INTENSITY_OPTIONS: { value: Intensity; label: string }[] = [
  { value: 'failure', label: 'F' },
  { value: 'rir1', label: '1' },
  { value: 'rir2', label: '2' },
  { value: 'rir3', label: '3' },
];
const REST_TIMER_KEY = 'rest-timer-default-sec';
const REST_TIMER_RECENTS_KEY = 'rest-timer-recent-sec';
const MAX_RECENT_DURATIONS = 5;

export function WorkoutEntry() {
  const { programId, weekNumber: weekParam } = useParams();
  const navigate = useNavigate();
  const { getProgramById } = usePrograms();
  const { getLogForWeek, getPreviousLog, saveWorkout, setHoliday } = useWeekLogs();
  const isMobile = useIsMobileDevice();

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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerTotalRef = useRef(restDurationSec);

  // Initialize exercise logs
  useEffect(() => {
    if (!program) return;

    const activeExercises = program.exercises.filter(e => e.isActive);

    if (existingLog && existingLog.exercises.length > 0) {
      setExerciseLogs(existingLog.exercises);
    } else {
      const initial: ExerciseLog[] = activeExercises.map(ex => {
        const previousExercise = previousLog?.exercises.find(prev => prev.exerciseId === ex.id);
        const previousSets = previousExercise?.sets ?? [];

        if (previousSets.length > 0) {
          return {
            exerciseId: ex.id,
            exerciseName: ex.name,
            sets: previousSets.map(set => ({ ...set })),
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
    }
  }, [program, existingLog, previousLog]);

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
    };
  }, []);

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

  const addRecentDuration = useCallback((seconds: number) => {
    setRecentDurations(prev => {
      const next = [seconds, ...prev.filter(v => v !== seconds)].slice(0, MAX_RECENT_DURATIONS);
      return next;
    });
  }, []);

  const playAlarmTone = useCallback(() => {
    try {
      const audioContext = new AudioContext();
      const now = audioContext.currentTime;

      [880, 660, 880].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;

        const startAt = now + index * 0.22;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.2);
      });

      setTimeout(() => {
        void audioContext.close();
      }, 900);
    } catch {
      // Browsers may block audio if there was no user interaction.
    }
  }, []);

  const fireTimerFinishedAlerts = useCallback(() => {
    playAlarmTone();
    if ('vibrate' in navigator) {
      navigator.vibrate([180, 100, 220]);
    }

    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Dinlenme bitti', {
        body: 'Sonraki sete hazırsın.',
        tag: 'rest-timer-finished',
      });
    }
  }, [playAlarmTone]);

  const startRestTimer = (seconds: number = restDurationSec) => {
    const safeSeconds = Math.max(5, Math.round(seconds));
    if (timerRef.current !== null) clearInterval(timerRef.current);
    timerTotalRef.current = safeSeconds;
    setTimerRemainingSec(safeSeconds);
    setTimerActive(true);
    addRecentDuration(safeSeconds);
    timerRef.current = setInterval(() => {
      setTimerRemainingSec(prev => {
        if (prev <= 1) {
          if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
          setTimerActive(false);
          fireTimerFinishedAlerts();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopRestTimer = () => {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    setTimerActive(false);
    setTimerRemainingSec(0);
  };

  const formatTimer = (totalSec: number) => {
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
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

      {/* Rest timer control */}
      {!isHoliday && (
        <div className="mb-6 rounded-xl border border-(--color-border) bg-(--color-bg-card) p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-(--color-text-muted)">Dinlenme sayacı</p>
              <h2 className="text-lg font-black text-(--color-text-primary)">Set arası süreyi buradan başlat</h2>
              <p className="text-sm text-(--color-text-secondary)">Her set sonrasında aşağıdaki sürelerden birini seçip sayacı çalıştırabilirsin.</p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${timerActive ? 'bg-(--color-accent)/20 text-(--color-accent)' : 'bg-(--color-btn-bg) text-(--color-text-secondary)'}`}>
                {timerActive ? `Aktif · ${formatTimer(timerRemainingSec)}` : `Varsayılan · ${formatTimer(restDurationSec)}`}
              </span>
              {timerActive && (
                <button
                  onClick={stopRestTimer}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-900 text-rose-100 hover:bg-rose-800"
                >
                  Durdur
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[60, 90, 120, 180].map(sec => (
              <button
                key={sec}
                onClick={() => {
                  setRestDurationSec(sec);
                  startRestTimer(sec);
                }}
                className={`px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                  restDurationSec === sec
                    ? 'bg-(--color-accent) text-white'
                    : 'bg-(--color-btn-bg) text-(--color-text-secondary) hover:bg-(--color-btn-hover)'
                }`}
              >
                {sec >= 60 ? `${sec / 60} dk` : `${sec} sn`}
              </button>
            ))}
            {recentDurations
              .filter(sec => ![60, 90, 120, 180].includes(sec))
              .map(sec => (
                <button
                  key={`recent-${sec}`}
                  onClick={() => {
                    setRestDurationSec(sec);
                    startRestTimer(sec);
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-bold bg-(--color-bg-input) text-(--color-text-secondary) border border-(--color-border) hover:border-(--color-accent)/50"
                  title="Son kullanılan süre"
                >
                  {formatDurationLabel(sec)}
                </button>
              ))}
            <button
              onClick={() => startRestTimer()}
              className="px-4 py-2 rounded-lg text-sm font-black bg-(--color-accent) text-white hover:bg-(--color-accent-hover)"
            >
              {timerActive ? 'Yeniden Başlat' : 'Başlat'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={customDurationInput}
              onChange={e => setCustomDurationInput(e.target.value)}
              placeholder="Özel süre"
              className="w-28 px-3 py-2 bg-(--color-bg-input) border border-(--color-border) rounded-lg text-sm font-semibold focus:outline-none focus:border-(--color-accent)"
            />
            <select
              value={customDurationUnit}
              onChange={e => setCustomDurationUnit(e.target.value as 'sec' | 'min')}
              className="px-3 py-2 bg-(--color-bg-input) border border-(--color-border) rounded-lg text-sm font-semibold focus:outline-none focus:border-(--color-accent)"
            >
              <option value="sec">sn</option>
              <option value="min">dk</option>
            </select>
            <button
              onClick={handleStartCustomTimer}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-(--color-btn-bg) text-(--color-text-primary) hover:bg-(--color-btn-hover)"
            >
              Özel süreyi başlat
            </button>
            {notificationPermission !== 'unsupported' && notificationPermission !== 'granted' && (
              <button
                onClick={handleEnableNotifications}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-(--color-bg-input) border border-(--color-border) text-(--color-text-secondary) hover:border-(--color-accent)/50"
              >
                Bildirimi aç
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-(--color-text-muted)">
            Süre bitince ses + titreşim çalışır. Bildirim izni açıksa uygulama arka plandayken de bildirim gönderilir.
          </p>
        </div>
      )}



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
              <div className="space-y-2.5 md:space-y-2.5">
                {exercise.sets.map((set, setIdx) => {
                  const prevSet = getPreviousSetRef(exercise.exerciseId, setIdx);
                  return isMobile ? (
                    /* ── Mobile: Card layout ── */
                    <div key={setIdx} className="bg-(--color-bg-input) rounded-xl p-4 border border-(--color-border) relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-extrabold text-(--color-accent)">Set {setIdx + 1}</span>
                        {prevSet && (
                          <span className="text-xs text-(--color-text-muted) font-set">
                            Geçen: {formatSet(prevSet)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="text-[10px] font-bold text-(--color-text-muted) uppercase tracking-wider mb-1 block">Ağırlık</label>
                          <div className="relative">
                            <input
                              type="number"
                              inputMode="decimal"
                              value={set.weight}
                              onChange={e => updateSet(exIdx, setIdx, 'weight', Number(e.target.value))}
                              step={0.5}
                              min={0}
                              className="w-full px-3 py-3 bg-(--color-bg-card) border border-(--color-border) rounded-xl text-lg font-set font-bold focus:outline-none focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-(--color-text-muted)">kg</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-(--color-text-muted) uppercase tracking-wider mb-1 block">Tekrar</label>
                          <div className="relative">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={set.reps}
                              onChange={e => updateSet(exIdx, setIdx, 'reps', Number(e.target.value))}
                              min={0}
                              className="w-full px-3 py-3 bg-(--color-bg-card) border border-(--color-border) rounded-xl text-lg font-set font-bold focus:outline-none focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent)"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-(--color-text-muted)">rep</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-(--color-text-muted) uppercase mr-1">RIR</span>
                        {INTENSITY_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => updateSet(exIdx, setIdx, 'intensity', opt.value)}
                            className={`w-11 h-11 rounded-xl text-sm font-black transition-all ${
                              set.intensity === opt.value
                                ? 'bg-(--color-accent) text-white scale-110 shadow-md shadow-(--color-accent-glow)'
                                : 'bg-(--color-btn-bg) text-(--color-text-secondary) hover:bg-(--color-btn-hover)'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        <button
                          onClick={() => startRestTimer()}
                          className={`w-11 h-11 rounded-xl text-sm font-black transition-all ${
                            timerActive ? 'bg-(--color-accent) text-white' : 'bg-(--color-btn-bg) text-(--color-text-secondary) hover:bg-(--color-btn-hover)'
                          }`}
                          title="Set bitti — dinlenme sayacını başlat"
                        >
                          ✓
                        </button>
                        {exercise.sets.length > 1 && (
                          <button
                            onClick={() => removeSet(exIdx, setIdx)}
                            className="ml-auto w-9 h-9 rounded-full bg-red-500/10 text-red-400 text-sm flex items-center justify-center"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── Desktop: Inline layout (unchanged) ── */
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
                        <button
                          onClick={() => startRestTimer()}
                          className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                            timerActive ? 'bg-(--color-accent) text-white' : 'bg-(--color-btn-bg) text-(--color-text-secondary) hover:bg-(--color-btn-hover)'
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

      {/* Floating rest timer */}
      <div
        className={`fixed z-50 transition-all duration-300 ${
          timerActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'
        } ${
          isMobile ? 'bottom-20 left-4 right-4' : 'bottom-6 right-6 w-72'
        }`}
      >
        <div className="bg-(--color-bg-card) border-2 border-(--color-accent) rounded-2xl p-4 shadow-2xl">
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-(--color-border) rounded-full mb-3 overflow-hidden">
            <div
              className="h-full bg-(--color-accent) rounded-full transition-all duration-1000"
              style={{ width: `${timerTotalRef.current > 0 ? (timerRemainingSec / timerTotalRef.current) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-muted) mb-0.5">Dinlenme süresi</p>
              <p className="text-3xl font-black text-(--color-accent) font-set leading-none">{formatTimer(timerRemainingSec)}</p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <button
                onClick={stopRestTimer}
                className="w-8 h-8 rounded-full bg-rose-900 text-rose-100 text-xs font-bold flex items-center justify-center"
                title="Sayacı durdur"
              >
                ✕
              </button>
              <div className="flex gap-1">
                {[60, 90, 120, 180].map(sec => (
                  <button
                    key={sec}
                    onClick={() => { setRestDurationSec(sec); startRestTimer(sec); }}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                      restDurationSec === sec
                        ? 'bg-(--color-accent) text-white'
                        : 'bg-(--color-btn-bg) text-(--color-text-secondary)'
                    }`}
                  >
                    {sec < 60 ? `${sec}s` : `${sec / 60}dk`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
