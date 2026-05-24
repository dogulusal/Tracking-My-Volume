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
 * Format multiple sets for display: "45 x 5 F | 50 x 4 F"
 */
export function formatSets(sets: SetLog[]): string {
  const lines: string[] = [];
  const groups = new Map<number, SetLog[]>();

  sets.forEach(set => {
    const weightKey = Number(set.weight.toFixed(2));
    const group = groups.get(weightKey) || [];
    group.push(set);
    groups.set(weightKey, group);
  });

  for (const group of groups.values()) {
    const uniqueSets = group.filter((set, index, array) =>
      index === array.findIndex(other =>
        other.weight === set.weight && other.reps === set.reps && other.intensity === set.intensity
      )
    );
    if (uniqueSets.length === 0) continue;

    const [firstSet, ...restSets] = uniqueSets;
    const lineParts = [formatSet(firstSet), ...restSets.map(formatSetShort)];
    lines.push(lineParts.join(' | '));
  }

  return lines.join('\n');
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
