import type { ExerciseDefinition, ExerciseLog, Program, WeekLog } from '@/types';

/** Keep entered sets attached to exercise IDs while applying the program layout. */
export function syncExerciseLogs(
  program: Program,
  logs: ExerciseLog[],
  createMissing: (exercise: ExerciseDefinition) => ExerciseLog,
): ExerciseLog[] {
  const byId = new Map(logs.map(log => [log.exerciseId, log]));
  const active = program.exercises.filter(exercise => exercise.isActive).map(exercise => {
    const logged = byId.get(exercise.id);
    return logged ? { ...logged, exerciseName: exercise.name } : createMissing(exercise);
  });
  const activeIds = new Set(active.map(log => log.exerciseId));
  // A removed exercise may still carry recorded sets for this week.
  return [...active, ...logs.filter(log => !activeIds.has(log.exerciseId))];
}

/** Apply only fields the user actually changed during this workout. */
export function syncProgramFromWorkout(
  program: Program,
  logs: ExerciseLog[],
  editedExerciseIds: ReadonlySet<string>,
  syncOrder: boolean,
): Program {
  const byId = new Map(logs.map(log => [log.exerciseId, log]));
  let exercises = program.exercises.map(exercise => {
    if (!editedExerciseIds.has(exercise.id)) return exercise;
    const sets = byId.get(exercise.id)?.sets;
    if (!sets?.length) return exercise;
    const changed = exercise.defaultSets !== sets.length
      || exercise.defaultWeight !== sets[0].weight
      || exercise.defaultReps !== sets[0].reps;
    return changed ? { ...exercise, defaultSets: sets.length, defaultWeight: sets[0].weight, defaultReps: sets[0].reps } : exercise;
  });
  if (syncOrder) {
    const positions = new Map(logs.map((log, index) => [log.exerciseId, index]));
    exercises = [...exercises].sort((a, b) =>
      (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  return exercises.some((exercise, index) => exercise !== program.exercises[index])
    ? { ...program, exercises }
    : program;
}

/** Apply an explicit program edit to the selected week's matching log values. */
export function syncWeekLogFromProgramEdit(before: Program, after: Program, log: WeekLog): WeekLog {
  if (log.isHoliday) return log;
  const oldDefinitions = new Map(before.exercises.map(exercise => [exercise.id, exercise]));
  const newDefinitions = new Map(after.exercises.map(exercise => [exercise.id, exercise]));
  const positions = new Map(after.exercises.map((exercise, index) => [exercise.id, index]));
  const exercises = log.exercises.map(record => {
    const oldDef = oldDefinitions.get(record.exerciseId);
    const newDef = newDefinitions.get(record.exerciseId);
    if (!oldDef || !newDef) return record;
    let sets = record.sets.map(set => ({
      ...set,
      weight: oldDef.defaultWeight !== newDef.defaultWeight && set.weight === oldDef.defaultWeight ? newDef.defaultWeight : set.weight,
      reps: oldDef.defaultReps !== newDef.defaultReps && set.reps === oldDef.defaultReps ? newDef.defaultReps : set.reps,
    }));
    if (oldDef.defaultSets !== newDef.defaultSets && record.sets.length === oldDef.defaultSets) {
      sets = sets.slice(0, newDef.defaultSets);
      while (sets.length < newDef.defaultSets) {
        sets.push({ weight: newDef.defaultWeight, reps: newDef.defaultReps, intensity: 'failure' });
      }
    }
    return { ...record, exerciseName: newDef.name, sets };
  }).sort((a, b) =>
    (positions.get(a.exerciseId) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.exerciseId) ?? Number.MAX_SAFE_INTEGER));
  return JSON.stringify(exercises) === JSON.stringify(log.exercises)
    ? log
    : { ...log, exercises, updatedAt: new Date().toISOString() };
}
