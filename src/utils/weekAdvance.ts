import type { WeekLog } from '@/types';

const DAY_MS = 86400000;

/** Whole days from a log's date (YYYY-MM-DD or ISO) to today; null when unreadable. */
export function daysSince(date: string, today: Date): number | null {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date(date);
  if (Number.isNaN(day.getTime())) return null;
  const startOf = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.round((startOf(today) - startOf(day)) / DAY_MS);
}

// The week only moves on when the person says so. Someone who forgets would
// open next week's workout on top of this week's record and overwrite it.
export const STALE_DAY_DAYS = 5;
export const STALE_WEEK_DAYS = 6;

/**
 * Opening a day that already has a record this week, made this many days
 * ago or more: probably a new week's workout, not an edit. Null when the
 * record is recent, a holiday, or of an earlier week.
 */
export function staleRecordAge(log: WeekLog | undefined, currentWeek: number, today: Date): number | null {
  if (!log || log.isHoliday || log.weekNumber !== currentWeek || log.exercises.length === 0) return null;
  const age = daysSince(log.date, today);
  return age !== null && age >= STALE_DAY_DAYS ? age : null;
}

/**
 * Days since the current week's first workout, when that is long enough to
 * ask whether a new week has started; null otherwise.
 */
export function staleWeekAge(logs: WeekLog[], currentWeek: number, today: Date): number | null {
  const ages = logs
    .filter(log => log.weekNumber === currentWeek && !log.isHoliday && log.exercises.length > 0)
    .map(log => daysSince(log.date, today))
    .filter((age): age is number => age !== null);
  if (!ages.length) return null;
  const oldest = Math.max(...ages);
  return oldest >= STALE_WEEK_DAYS ? oldest : null;
}

/** Consecutive weeks before this one with at least one logged workout. */
export function trainingStreak(weekLogs: WeekLog[], currentWeek: number): number {
  let count = 0;
  for (let week = currentWeek - 1; week >= 0; week--) {
    if (!weekLogs.some(log => log.weekNumber === week && !log.isHoliday && log.exercises.length > 0)) break;
    count++;
  }
  return count;
}
