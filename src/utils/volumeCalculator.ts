import type { WeekLog, ExerciseLog } from '@/types';

/**
 * Calculate total volume for a single exercise log
 * Volume = Σ(weight × reps) for all sets
 */
export function calculateExerciseVolume(exercise: ExerciseLog): number {
  return exercise.sets.reduce((total, set) => total + set.weight * set.reps, 0);
}

/**
 * Calculate total volume for a week log (all exercises combined)
 */
export function calculateWeeklyVolume(weekLog: WeekLog): number {
  if (weekLog.isHoliday) return 0;
  return weekLog.exercises.reduce(
    (total, exercise) => total + calculateExerciseVolume(exercise),
    0
  );
}

/**
 * Calculate total volume for a specific program across all week logs in a given week
 */
export function calculateProgramVolume(weekLogs: WeekLog[], weekNumber: number): number {
  return weekLogs
    .filter(w => w.weekNumber === weekNumber && !w.isHoliday)
    .reduce((total, log) => total + calculateWeeklyVolume(log), 0);
}

/**
 * Calculate total volume for all programs in a given week
 */
export function calculateTotalWeekVolume(weekLogs: WeekLog[], weekNumber: number): number {
  return weekLogs
    .filter(w => w.weekNumber === weekNumber && !w.isHoliday)
    .reduce((total, log) => total + calculateWeeklyVolume(log), 0);
}
