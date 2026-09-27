import type { SetLog, Intensity } from '@/types';

const INTENSITY_LABELS: Record<Intensity, string> = {
  failure: 'F',
  rir1: '+1',
  rir2: '+2',
  rir3: '+3',
};

/**
 * Format a single set for display: "45 x 5 F"
 */
export function formatSet(set: SetLog): string {
  return `${set.weight} x ${set.reps} ${INTENSITY_LABELS[set.intensity]}`;
}

/**
 * Every set on its own line, written in full. The older shorthand (one line for
 * identical sets, "| 8 F" for the same weight) leaned on the Set column and
 * confused people new to the log.
 */
export function formatSets(sets: SetLog[]): string {
  return sets.map(formatSet).join('\n');
}

/**
 * Get intensity label
 */
export function getIntensityLabel(intensity: Intensity): string {
  return INTENSITY_LABELS[intensity];
}

/**
 * Format date for display: "20 May 2026"
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format volume number: "12,450 kg"
 */
export function formatVolume(volume: number): string {
  return `${volume.toLocaleString('tr-TR')} kg`;
}
