import type { AppState, ExerciseStatus, SetLog, WeekLog } from '@/types';
import { calculateExerciseStatus } from '@/utils/statusCalculator';
import { STALL_WEEKS, bestSet, capacity, stallOf } from '@/utils/progression';
import { movementSessions, sessionsBefore } from '@/utils/movements';
import { estimate1RM } from '@/utils/oneRMCalculator';
import { MUSCLE_GROUPS, UNASSIGNED, exerciseKey, groupOf } from '@/utils/muscleGroups';

export interface SummaryLine {
  name: string;
  best: SetLog | null;
  /** Against the same day last time, as History colours the cell. */
  status: ExerciseStatus;
  /** Estimated 1RM above every earlier session of the movement, on any day. */
  record: { oneRM: number; previous: number } | null;
  /** Weeks the best set has not been beaten, once it counts as stuck. */
  stallWeeks: number | null;
}

export interface WorkoutSummary {
  /** First finished set to the last; null when there is no span to show. */
  minutes: number | null;
  sets: number;
  lines: SummaryLine[];
  /** Worked sets per muscle group, counted as the Grafikler page counts them. */
  groups: { group: string; sets: number }[];
  counts: { improved: number; same: number; decreased: number };
}

// The estimate counts the reps left in reserve: 8 reps with two in the tank
// is a stronger set than 8 to failure, as everywhere else in the app.
const oneRMOf = (set: SetLog) => estimate1RM(set.weight, capacity(set));
const topOneRM = (sets: SetLog[]) => sets.reduce((top, set) => set.reps > 0 ? Math.max(top, oneRMOf(set)) : top, 0);

/**
 * What the workout just saved did, for the screen shown after Kaydet. Sets are
 * the only amount shown: the app dropped kg × reps "volume" on purpose.
 */
export function summarizeWorkout(
  log: WeekLog,
  previousLog: WeekLog | null,
  state: Pick<AppState, 'weekLogs' | 'muscleGroups'>,
): WorkoutSummary {
  // The record as it stands after this save, for the stuck count.
  const logsAfter = [
    ...state.weekLogs.filter(item => !(item.programId === log.programId && item.weekNumber === log.weekNumber)),
    log,
  ];
  const lines: SummaryLine[] = [];
  const groupSets = new Map<string, number>();
  for (const exercise of log.exercises) {
    const worked = exercise.sets.filter(set => set.reps > 0);
    if (!worked.length) continue;
    const key = exerciseKey(exercise.exerciseName);
    const previousSets = previousLog?.exercises.find(item => item.exerciseId === exercise.exerciseId)?.sets;
    const earlier = sessionsBefore(movementSessions(state.weekLogs, key), log);
    const previousTop = Math.max(0, ...earlier.map(session => topOneRM(session.exercise.sets)));
    const oneRM = topOneRM(worked);
    const stall = stallOf(movementSessions(logsAfter, key));
    lines.push({
      name: exercise.exerciseName,
      best: bestSet(worked),
      status: calculateExerciseStatus(exercise.sets, previousSets),
      record: previousTop > 0 && oneRM > previousTop ? { oneRM, previous: previousTop } : null,
      stallWeeks: stall && stall.weeks >= STALL_WEEKS ? stall.weeks : null,
    });
    const group = groupOf(exercise.exerciseName, state.muscleGroups);
    groupSets.set(group, (groupSets.get(group) ?? 0) + worked.length);
  }

  const span = log.startedAt && log.finishedAt ? Date.parse(log.finishedAt) - Date.parse(log.startedAt) : NaN;
  const minutes = Number.isFinite(span) && span >= 60_000 ? Math.round(span / 60_000) : null;
  const order: string[] = [...MUSCLE_GROUPS, UNASSIGNED];
  return {
    minutes,
    sets: [...groupSets.values()].reduce((sum, sets) => sum + sets, 0),
    lines,
    groups: order.filter(group => groupSets.has(group)).map(group => ({ group, sets: groupSets.get(group)! })),
    counts: {
      improved: lines.filter(line => line.status === 'improved').length,
      same: lines.filter(line => line.status === 'same').length,
      decreased: lines.filter(line => line.status === 'decreased').length,
    },
  };
}
