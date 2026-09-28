import type { ExerciseSettings, SetLog, WeekLog } from '@/types';
import type { MovementSession } from '@/utils/movements';

const RESERVE: Record<string, number> = { failure: 0, rir1: 1, rir2: 2, rir3: 3 };

/** What a set had in it: the reps done plus the ones left in reserve. */
export const capacity = (set: SetLog) => set.reps + (RESERVE[set.intensity] ?? 0);

/** The heaviest worked set; among equal weights, the one with the most in it. */
export function bestSet(sets: SetLog[]): SetLog | null {
  let best: SetLog | null = null;
  for (const set of sets) {
    if (set.reps <= 0) continue;
    if (!best || set.weight > best.weight || (set.weight === best.weight && capacity(set) > capacity(best))) best = set;
  }
  return best;
}

// The lower middle value, so the answer is always one that was really used.
const lowerMedian = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
const round = (weight: number) => Math.round(weight * 100) / 100;

// Where the rule came from: set by hand, read from the log, or the default
// for a movement that never went up in weight.
export type ProgressionRule = { repTop: number; step: number; source: 'manual' | 'log' | 'default' };

/**
 * When and by how much weight goes up on this movement, read from the log:
 * the reps reached before each weight increase and the size of the increase,
 * over the last five increases. Increases are read day by day (Upper 1 after
 * Upper 1), because two days may train the movement at different weights.
 * Steps over 10 kg are typos or machine changes, not progress.
 */
export function progressionRule(sessions: MovementSession[], settings?: ExerciseSettings): ProgressionRule {
  const jumps: { reps: number; step: number }[] = [];
  const lastByDay = new Map<string, SetLog>();
  for (const session of sessions) {
    const top = bestSet(session.exercise.sets);
    if (!top) continue;
    const before = lastByDay.get(session.log.programId);
    lastByDay.set(session.log.programId, top);
    const step = before ? round(top.weight - before.weight) : 0;
    if (before && step > 0 && step <= 10) jumps.push({ reps: before.reps, step });
  }
  const recent = jumps.slice(-5);
  // One increase shows the step, but not yet where the rep range tops out.
  const learned = recent.length >= 2;
  return {
    repTop: settings?.repTop ?? (learned ? lowerMedian(recent.map(jump => jump.reps)) : 10),
    step: settings?.step ?? (recent.length ? lowerMedian(recent.map(jump => jump.step)) : 2.5),
    source: settings?.repTop !== undefined || settings?.step !== undefined ? 'manual' : learned ? 'log' : 'default',
  };
}

export type Target = { weight: number; reps: number | null; from: SetLog };

/**
 * The next step from the set this workout is compared with: one more rep, or
 * the next weight once the top of the rep range was reached (reps then start
 * again, so no rep count is set for the new weight).
 */
export function nextTarget(previousSets: SetLog[], rule: ProgressionRule): Target | null {
  const top = bestSet(previousSets);
  if (!top) return null;
  return top.reps >= rule.repTop
    ? { weight: round(top.weight + rule.step), reps: null, from: top }
    : { weight: top.weight, reps: top.reps + 1, from: top };
}

/**
 * The record this workout will be compared with: the same day's nearest
 * earlier session of the exercise, in any phase.
 */
export function previousRecord(weekLogs: WeekLog[], programId: string, exerciseId: string, week: number): SetLog[] | null {
  const earlier = weekLogs
    .filter(log => log.programId === programId && log.weekNumber < week && !log.isHoliday)
    .sort((a, b) => b.weekNumber - a.weekNumber);
  for (const log of earlier) {
    const sets = log.exercises.find(exercise => exercise.exerciseId === exerciseId)?.sets.filter(set => set.reps > 0);
    if (sets?.length) return sets;
  }
  return null;
}

export type Stall = { weeks: number; since: number; weight: number; best: SetLog };

/**
 * How long the movement has gone without beating its best set at the weight
 * it is on now, across every day that trains it: weeks from the first session
 * that reached that best to the latest session. Moving to another weight
 * (up, or down for a reset) starts the count again.
 */
export function stallOf(sessions: MovementSession[]): Stall | null {
  const tops = sessions
    .map(session => ({ week: session.log.weekNumber, top: bestSet(session.exercise.sets) }))
    .filter((item): item is { week: number; top: SetLog } => item.top !== null);
  if (!tops.length) return null;
  const weight = tops[tops.length - 1].top.weight;
  let start = tops.length - 1;
  while (start > 0 && tops[start - 1].top.weight === weight) start--;
  let best = tops[start];
  for (const item of tops.slice(start + 1)) if (capacity(item.top) > capacity(best.top)) best = item;
  return { weeks: tops[tops.length - 1].week - best.week, since: best.week, weight, best: best.top };
}

/** Weeks without a better set before a movement counts as stuck. */
export const STALL_WEEKS = 4;
