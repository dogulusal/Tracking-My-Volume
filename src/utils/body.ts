import type { BodyMeasurement, BodyProfile, MeasureKey } from '@/types';

/** Every measurement the app keeps; weight is the one asked every time. */
export const MEASURES: { key: MeasureKey; label: string; unit: string }[] = [
  { key: 'weight', label: 'Kilo', unit: 'kg' },
  { key: 'waist', label: 'Bel', unit: 'cm' },
  { key: 'neck', label: 'Boyun', unit: 'cm' },
  { key: 'chest', label: 'Göğüs', unit: 'cm' },
  { key: 'shoulders', label: 'Omuz', unit: 'cm' },
  { key: 'arm', label: 'Kol', unit: 'cm' },
  { key: 'hips', label: 'Kalça', unit: 'cm' },
  { key: 'thigh', label: 'Uyluk', unit: 'cm' },
  { key: 'calf', label: 'Baldır', unit: 'cm' },
  { key: 'bodyFat', label: 'Yağ oranı', unit: '%' },
];

// Offered first, after weight: the waist and the neck for everyone (the
// neck for the body fat estimate), then what men and women mostly follow.
// Nothing is withheld; the rest sit under "Diğer ölçüler".
const FIRST: Record<'male' | 'female' | 'none', MeasureKey[]> = {
  male: ['waist', 'neck', 'chest', 'arm', 'shoulders'],
  female: ['waist', 'hips', 'neck', 'thigh', 'arm'],
  none: ['waist', 'neck', 'chest', 'arm', 'hips'],
};

/** The form's measurements besides weight: shown first, and the others. */
export function formMeasures(sex?: BodyProfile['sex']): { first: MeasureKey[]; other: MeasureKey[] } {
  const first = FIRST[sex ?? 'none'];
  return { first, other: MEASURES.map(measure => measure.key).filter(key => key !== 'weight' && !first.includes(key)) };
}

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

export type Point = { date: string; value: number };

/** A measurement's entries, oldest first; a day it was not taken is left out. */
export function pointsOf(measurements: BodyMeasurement[], key: MeasureKey): Point[] {
  return measurements.flatMap(entry => typeof entry[key] === 'number' ? [{ date: entry.date, value: entry[key]! }] : []);
}

/**
 * Body fat by the US Navy method (Naval Health Research Center), metric:
 * men from waist, neck and height; women also need the hips. Null when a
 * measurement is missing or the sex was not given.
 */
export function navyBodyFat(entry: BodyMeasurement, profile: BodyProfile | undefined): number | null {
  const height = profile?.heightCm;
  const { waist, neck, hips } = entry;
  if (!height || !waist || !neck) return null;
  let fat: number;
  if (profile?.sex === 'male') {
    if (waist <= neck) return null;
    fat = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  } else if (profile?.sex === 'female') {
    if (!hips || waist + hips <= neck) return null;
    fat = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(height)) - 450;
  } else {
    return null;
  }
  return fat > 0 && fat < 75 ? round1(fat) : null;
}

/** The estimate for every day it can be made. */
export function estimatedBodyFat(measurements: BodyMeasurement[], profile: BodyProfile | undefined): Point[] {
  return measurements.flatMap(entry => {
    const value = navyBodyFat(entry, profile);
    return value === null ? [] : [{ date: entry.date, value }];
  });
}

/**
 * A measurement week by week, oldest first: the mean of the week's entries,
 * because a daily weigh-in swings by a kilo for no reason.
 */
export function weeklySeries(points: Point[]): { week: string; value: number }[] {
  const weeks = new Map<string, number[]>();
  for (const point of points) {
    const week = weekStart(point.date);
    weeks.set(week, [...(weeks.get(week) ?? []), point.value]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, values]) => ({ week, value: round1(values.reduce((sum, value) => sum + value, 0) / values.length) }));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const weeksBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (7 * DAY_MS));

/** The week's distance from the series' first week, in weeks, for a chart that keeps a missed week as a gap. */
export function weekOffsets(series: { week: string }[]): number[] {
  return series.map(point => weeksBetween(series[0].week, point.week));
}

/**
 * How a weekly series moved from its first week to its last: in all, over
 * how many weeks and per week on average (null within a single week).
 */
export function seriesChange(series: { week: string; value: number }[]) {
  if (!series.length) return null;
  const change = round1(series[series.length - 1].value - series[0].value);
  const weeks = weeksBetween(series[0].week, series[series.length - 1].week);
  return { change, weeks, perWeek: weeks ? round1(change / weeks) : null };
}

/** The narrowest span a body chart shows, in the measurement's unit. */
export const MIN_SPAN = 2;
const STEPS = [1, 2, 5, 10, 20, 50];

/**
 * A body chart's scale: whole-unit gridlines, at most six spaces between
 * them, and never narrower than MIN_SPAN, so half a centimetre does not fill
 * the chart the way four do.
 */
export function chartScale(values: number[]): { lo: number; hi: number; ticks: number[] } {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < MIN_SPAN) {
    const mid = (min + max) / 2;
    min = mid - MIN_SPAN / 2;
    max = mid + MIN_SPAN / 2;
  }
  const step = STEPS.find(candidate => (max - min) / candidate <= 6) ?? STEPS[STEPS.length - 1];
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  return { lo, hi, ticks: Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step) };
}

/** Where a measurement started, where it is now and how far the target is; null before the first entry. */
export function measureStatus(points: Point[], goal?: number) {
  if (!points.length) return null;
  const first = points[0].value;
  const latest = points[points.length - 1].value;
  return {
    first,
    latest,
    latestDate: points[points.length - 1].date,
    change: round1(latest - first),
    toGoal: goal === undefined ? null : round1(goal - latest),
  };
}

/**
 * The Bugün reminder: only for someone who has measured before (it is never
 * pushed on a person who does not use it), once a calendar week — the weeks
 * the charts average — or once a day if they chose daily.
 */
export function measurementDue(measurements: BodyMeasurement[] | undefined, today: string, daily = false): boolean {
  if (!measurements?.length) return false;
  const last = measurements[measurements.length - 1].date;
  return daily ? last < today : weekStart(last) < weekStart(today);
}
