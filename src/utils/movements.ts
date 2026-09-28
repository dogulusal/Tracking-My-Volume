import type { ExerciseLog, WeekLog } from '@/types';
import { exerciseKey } from '@/utils/muscleGroups';

/** One workout's record of a movement. */
export type MovementSession = { log: WeekLog; exercise: ExerciseLog };

type SessionPoint = Pick<WeekLog, 'weekNumber' | 'date'>;

// Week first; inside a week the dates order the days. History saves full ISO
// timestamps and the workout page plain dates, so only the day is compared.
const sessionOrder = (a: SessionPoint, b: SessionPoint) =>
  a.weekNumber - b.weekNumber || (a.date ?? '').slice(0, 10).localeCompare((b.date ?? '').slice(0, 10));

/**
 * Every session of a movement, oldest first. Matched by name, so the same
 * exercise on different training days is one history; holidays are left out.
 */
export function movementSessions(weekLogs: WeekLog[], key: string): MovementSession[] {
  const sessions: MovementSession[] = [];
  for (const log of weekLogs) {
    if (log.isHoliday) continue;
    const exercise = log.exercises.find(item => exerciseKey(item.exerciseName) === key);
    if (exercise && (exercise.sets.some(set => set.reps > 0) || exercise.note?.trim())) sessions.push({ log, exercise });
  }
  return sessions.sort((a, b) => sessionOrder(a.log, b.log));
}

/**
 * The sessions trained before this workout: earlier weeks, and days earlier in
 * the same week. The workout itself is never its own history.
 */
export function sessionsBefore(
  sessions: MovementSession[],
  current: { programId: string; weekNumber: number; date: string },
): MovementSession[] {
  return sessions.filter(({ log }) =>
    !(log.programId === current.programId && log.weekNumber === current.weekNumber) && sessionOrder(log, current) < 0);
}
