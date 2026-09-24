import { configurePhaseTransition, excludeProgramFromPhase, initializeProgramVersions, phaseTransitionError, programVersionAt, removeExerciseFromPhase, saveProgramVersion } from '@/utils/programVersions';
import { syncProgramFromWorkout } from '@/utils/exerciseSync';
import type { AppState } from '@/types';

export const CURRENT_DATA_VERSION = 11;

// Apply data migrations when loading old localStorage data
export function applyMigrations(state: AppState): AppState {
  const version = state.dataVersion ?? 1;
  if (version >= CURRENT_DATA_VERSION) return state;

  let s = { ...state, weekLogs: [...state.weekLogs] };

  if (version < 2) {
    // v2: Fix upper1 week 10 → holiday "bayram"; move note to week 11
    s.weekLogs = s.weekLogs.map(log => {
      if (log.programId === 'upper1' && log.weekNumber === 10) {
        return { ...log, exercises: [], isHoliday: true, notes: 'bayram' };
      }
      if (log.programId === 'upper1' && log.weekNumber === 11) {
        return {
          ...log,
          notes: log.notes || 'long ve tricepsleri solla başla önce ve long bicepsi de değiş',
        };
      }
      return log;
    });
  }

  if (version < 3) {
    // v3: Add full Lower1 week 19 data; fix week 18 (H3) hack_squat typo
    const lower1W18 = s.weekLogs.find(log => log.programId === 'lower1' && log.weekNumber === 18);
    if (lower1W18) {
      // Fix week 18 hack_squat to use correct weight prefix in second set
      const fixed18 = lower1W18.exercises.map(ex => ex.exerciseId === 'l1_hack_squat'
        ? { ...ex, sets: ex.sets.map((st, i) => i === 1 ? { ...st, weight: 75 } : st) }
        : ex
      );
      s.weekLogs = s.weekLogs.map(log =>
        log.programId === 'lower1' && log.weekNumber === 18 ? { ...lower1W18, exercises: fixed18 } : log
      );
    }

    const lower1W19 = s.weekLogs.find(log => log.programId === 'lower1' && log.weekNumber === 19);
    const w19Exercises = [
      { exerciseId: 'l1_adduction', exerciseName: 'Adduction Machine', sets: [{ weight: 25, reps: 13, intensity: 'failure' as const }, { weight: 25, reps: 11, intensity: 'failure' as const }] },
      { exerciseId: 'l1_leg_ext',  exerciseName: 'Leg Extension',      sets: [{ weight: 11.25, reps: 10, intensity: 'failure' as const }] },
      { exerciseId: 'l1_leg_curl', exerciseName: 'Leg Curl',           sets: [{ weight: 77.5, reps: 9, intensity: 'failure' as const }, { weight: 77.5, reps: 8, intensity: 'failure' as const }] },
      { exerciseId: 'l1_hack_squat', exerciseName: 'Hack Squat',       sets: [{ weight: 75, reps: 9, intensity: 'failure' as const }, { weight: 75, reps: 10, intensity: 'rir1' as const }] },
      { exerciseId: 'l1_kalf',     exerciseName: 'Kalf',               sets: [{ weight: 110, reps: 15, intensity: 'failure' as const }, { weight: 110, reps: 12, intensity: 'failure' as const }] },
    ];
    if (lower1W19) {
      s.weekLogs = s.weekLogs.map(log =>
        log.programId === 'lower1' && log.weekNumber === 19
          ? { ...lower1W19, exercises: w19Exercises, notes: lower1W19.notes || 'leg extensionda 1.25 daha ekle' }
          : log
      );
    } else {
      s.weekLogs.push({
        id: `lower1_w19`,
        weekNumber: 19,
        programId: 'lower1',
        date: '2025-01-26',
        exercises: w19Exercises,
        notes: 'leg extensionda 1.25 daha ekle',
        isHoliday: false,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (version < 4) {
    // v4: Introduce Plan layer — group all existing programs into a default plan
    if (!s.plans || s.plans.length === 0) {
      const now = new Date().toISOString();
      const defaultPlan: import('@/types').Plan = {
        id: crypto.randomUUID(),
        name: 'Varsayılan Plan',
        programIds: s.programs.map(p => p.id),
        createdAt: now,
        updatedAt: now,
      };
      s = { ...s, plans: [defaultPlan], activePlanId: defaultPlan.id };
    }
  }

  if (version < 5) {
    // v5: Add phases array if missing
    if (!s.phases || s.phases.length === 0) {
      s = {
        ...s,
        phases: [
          { id: 'phase-1', name: 'Faz 1', startWeek: 0, endWeek: 14 },
          { id: 'phase-2', name: 'Faz 2', startWeek: 15, endWeek: null },
        ],
      };
    }
  }

  if (version < 7 && s.phases?.length >= 3) {
    // Apply the requested Faz 2 → Faz 3 record correction once when an older
    // save is first opened. The transition stores a persistent repeat marker.
    const ordered = [...s.phases].sort((a, b) => a.startWeek - b.startWeek);
    const previous = ordered[1];
    const next = ordered[2];
    if (!phaseTransitionError(s, previous.id, 20, next.id)) {
      s = configurePhaseTransition(s, previous.id, 20, next.id);
    }
  }

  if (version < 8 && s.phases?.length >= 3) {
    // Lower 2 belongs to Faz 1–2. Remove the day and the accidental baseline
    // copy only from Faz 3 while retaining all earlier definitions and records.
    const phase3 = [...s.phases].sort((a, b) => a.startWeek - b.startWeek)[2];
    s = excludeProgramFromPhase(s, phase3.id, 'lower2');
  }

  if (version < 9 && s.phases?.length >= 3) {
    // H20 -> H0 copied the retired Triceps Short Head rows into Faz 3.
    // Remove them from Faz 3 only; Faz 1-2 definitions and records stay intact.
    const phase3 = [...s.phases].sort((a, b) => a.startWeek - b.startWeek)[2];
    for (const programName of ['upper1', 'upper2', 'upper3']) {
      s = removeExerciseFromPhase(s, phase3.id, programName, 'Triceps Short Head');
    }
  }

  if (version < 10) {
    // Earlier workout saves could change this week's sets/order without updating
    // the program editor. Adopt only a newer current-week workout; older weeks
    // and a more recently edited program keep their own values.
    s = initializeProgramVersions(s);
    const current = programVersionAt(s, s.currentWeek);
    const programs = current.programs.map(program => {
      const log = s.weekLogs.find(entry => entry.programId === program.id && entry.weekNumber === s.currentWeek && !entry.isHoliday);
      if (!log || !Number.isFinite(Date.parse(log.updatedAt)) || Date.parse(log.updatedAt) <= Date.parse(program.updatedAt)) return program;
      const synced = syncProgramFromWorkout(program, log.exercises, new Set(log.exercises.map(exercise => exercise.exerciseId)), true);
      return synced === program ? program : { ...synced, updatedAt: log.updatedAt };
    });
    if (programs.some((program, index) => program !== current.programs[index])) {
      s = saveProgramVersion(s, s.currentWeek, { ...current, programs });
      s = { ...s, exerciseRowOrder: { ...s.exerciseRowOrder,
        ...Object.fromEntries(programs.filter((program, index) => program !== current.programs[index])
          .map(program => [program.id, program.exercises.map(exercise => exercise.id)])),
      } };
    }
  }

  if (version < 11 && s.phases?.length >= 3) {
    s = initializeProgramVersions(s);
    const currentPrograms = programVersionAt(s, s.currentWeek).programs;
    const phase3 = [...s.phases].sort((a, b) => a.startWeek - b.startWeek)[2];
    for (const name of ['Low Row', 'Single Row', 'Single Arm Row']) {
      s = removeExerciseFromPhase(s, phase3.id, 'upper3', name);
    }
    // Some older archives copied the current definition into earlier phases.
    // Rebuild only a day whose archived exercise list contradicts its own logs.
    const ordered = [...s.phases].sort((a, b) => a.startWeek - b.startWeek);
    for (const phase of ordered.slice(0, 2)) {
      const logs = s.weekLogs.filter(log => log.weekNumber >= phase.startWeek
        && (phase.endWeek === null || log.weekNumber <= phase.endWeek)
        && !log.isHoliday && log.exercises.length);
      for (const id of new Set(logs.map(log => log.programId))) {
        const current = currentPrograms.find(program => program.id === id);
        const archived = programVersionAt(s, phase.endWeek ?? phase.startWeek).programs.find(program => program.id === id);
        const lastLog = [...logs].sort((a, b) => b.weekNumber - a.weekNumber).find(log => log.programId === id);
        if (!current || !archived || !lastLog) continue;
        const archivedShape = archived.exercises.map(ex => [ex.id, ex.name, ex.defaultSets, ex.defaultWeight, ex.defaultReps]);
        const currentShape = current.exercises.map(ex => [ex.id, ex.name, ex.defaultSets, ex.defaultWeight, ex.defaultReps]);
        const loggedShape = lastLog.exercises.map(ex => [ex.exerciseId, ex.exerciseName,
          ex.sets.length || 1, ex.sets[0]?.weight ?? 0, ex.sets[0]?.reps ?? 0]);
        if (JSON.stringify(archivedShape) !== JSON.stringify(currentShape)
          || JSON.stringify(archivedShape) === JSON.stringify(loggedShape)) continue;
        const phaseLogs = logs.filter(log => log.programId === id).sort((a, b) => a.weekNumber - b.weekNumber);
        for (const log of phaseLogs) {
          const scope = programVersionAt(s, log.weekNumber);
          const programs = scope.programs.map(program => program.id !== id ? program : {
            ...program,
            exercises: log.exercises.map(ex => ({ id: ex.exerciseId, name: ex.exerciseName,
              defaultSets: ex.sets.length || 1, defaultWeight: ex.sets[0]?.weight ?? 0,
              defaultReps: ex.sets[0]?.reps ?? 0, isActive: true })),
          });
          s = saveProgramVersion(s, log.weekNumber, { ...scope, programs });
        }
      }
    }
    // Phase 3 remains the editable main program.
    const main = programVersionAt(s, s.currentWeek);
    s = { ...s, programs: main.programs, plans: main.plans, activePlanId: main.activePlanId };
  }

  return { ...initializeProgramVersions(s), dataVersion: CURRENT_DATA_VERSION };
}
