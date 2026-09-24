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

function formatSetShort(set: SetLog): string {
  return `${set.reps} ${INTENSITY_LABELS[set.intensity]}`;
}

/**
 * Keep sets at the same weight on one line. A weight change starts a new line,
 * which makes dense History/Sheets cells easier to scan without losing the
 * user's established pipe separator.
 */
export function formatSets(sets: SetLog[]): string {
  if (sets.length === 0) return '';
  const first = sets[0];
  if (sets.every(set => set.weight === first.weight && set.reps === first.reps && set.intensity === first.intensity)) {
    return formatSet(first);
  }
  return sets.map((set, index) => {
    if (index === 0) return formatSet(set);
    const sameWeight = set.weight === sets[index - 1].weight;
    return `${sameWeight ? ' | ' : '\n'}${sameWeight ? formatSetShort(set) : formatSet(set)}`;
  }).join('');
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
