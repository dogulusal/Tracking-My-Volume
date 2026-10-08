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
// open next week's workout on top of this week's record and overwrite it:
// asked when a day is opened a whole week after its record (it repeats
// after 7), not earlier, which only interrupted. 7, not Bugün's 8: on the
// 7th day Bugün has not asked yet, and this is the last guard.
export const STALE_DAY_DAYS = 7;
// Bugün asks only once a day of the week has gone a whole week without being
// trained again (the 8th day): a weekly plan repeats a day after 7, so asking
// earlier only interrupts a normal week.
export const STALE_WEEK_DAYS = 8;

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
 * The current week's first workout, when it was long enough ago to ask
 * whether a new week has started: its day and how many days ago; null
 * otherwise.
 */
export function staleWeekAge(logs: WeekLog[], currentWeek: number, today: Date): { days: number; programId: string } | null {
  let oldest: { days: number; programId: string } | null = null;
  for (const log of logs) {
    if (log.weekNumber !== currentWeek || log.isHoliday || log.exercises.length === 0) continue;
    const days = daysSince(log.date, today);
    if (days !== null && (!oldest || days > oldest.days)) oldest = { days, programId: log.programId };
  }
  return oldest && oldest.days >= STALE_WEEK_DAYS ? oldest : null;
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
