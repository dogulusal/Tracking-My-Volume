import type { BodyMeasurement, MeasureKey } from '@/types';

/** Weight is the one asked every time; the rest are the person's choice. */
export const MEASURES: { key: MeasureKey; label: string; unit: string }[] = [
  { key: 'weight', label: 'Kilo', unit: 'kg' },
  { key: 'waist', label: 'Bel', unit: 'cm' },
  { key: 'chest', label: 'Göğüs', unit: 'cm' },
  { key: 'arm', label: 'Kol', unit: 'cm' },
  { key: 'hips', label: 'Kalça', unit: 'cm' },
  { key: 'bodyFat', label: 'Yağ oranı', unit: '%' },
];

const round1 = (value: number) => Math.round(value * 10) / 10;
const pad2 = (value: number) => String(value).padStart(2, '0');

/** Today on the person's own calendar: a weigh-in at 01:00 belongs to today, not to UTC's yesterday. */
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Monday of the date's calendar week, YYYY-MM-DD. */
export function weekStart(date: string): string {
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/**
 * A measurement week by week, oldest first: the mean of the week's entries,
 * because a daily weigh-in swings by a kilo for no reason.
 */
export function weeklySeries(measurements: BodyMeasurement[], key: MeasureKey): { week: string; value: number }[] {
  const weeks = new Map<string, number[]>();
  for (const entry of measurements) {
    const value = entry[key];
    if (typeof value !== 'number') continue;
    const week = weekStart(entry.date);
    weeks.set(week, [...(weeks.get(week) ?? []), value]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, values]) => ({ week, value: round1(values.reduce((sum, value) => sum + value, 0) / values.length) }));
}

/** Where a measurement started, where it is now and how far the target is; null before the first entry. */
export function measureStatus(measurements: BodyMeasurement[], key: MeasureKey, goal?: number) {
  const taken = measurements.filter(entry => typeof entry[key] === 'number');
  if (!taken.length) return null;
  const first = taken[0][key]!;
  const latest = taken[taken.length - 1][key]!;
  return {
    first,
    latest,
    latestDate: taken[taken.length - 1].date,
    change: round1(latest - first),
    toGoal: goal === undefined ? null : round1(goal - latest),
  };
}

/**
 * The Bugün reminder: only for someone who has measured before (it is never
 * pushed on a person who does not use it) and not in the last seven days.
 */
export function measurementDue(measurements: BodyMeasurement[] | undefined, today: string): boolean {
  if (!measurements?.length) return false;
  const last = measurements[measurements.length - 1].date;
  return Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`) >= 7 * 86_400_000;
}
