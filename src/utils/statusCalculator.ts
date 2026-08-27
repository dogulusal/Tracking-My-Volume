import type { SetLog, ExerciseStatus } from '@/types';

const INTENSITY_SCORE: Record<SetLog['intensity'], number> = {
  failure: 0,
  rir1: 1,
  rir2: 2,
  rir3: 3,
};

function getIntensityScore(intensity: SetLog['intensity'] | string): number {
  if (intensity in INTENSITY_SCORE) {
    return INTENSITY_SCORE[intensity as SetLog['intensity']];
  }

  switch (intensity) {
    case 'F': return 0;
    case '+1': return 1;
    case '+2': return 2;
    case '+3': return 3;
    default: return 0;
  }
}

function compareSets(curr: SetLog, prev: SetLog): { improved: boolean; decreased: boolean } {
  const intensityDelta = getIntensityScore(curr.intensity) - getIntensityScore(prev.intensity);

  return {
    improved: curr.weight > prev.weight || curr.reps > prev.reps || intensityDelta > 0,
    decreased: curr.weight < prev.weight || curr.reps < prev.reps || intensityDelta < 0,
  };
}

function findRepresentativeSetByWeight(sets: SetLog[] | undefined, weight: number): SetLog | undefined {
  return sets?.find(set => set.weight === weight);
}

export function calculateExerciseStatus(
  currentSets: SetLog[] | undefined,
  previousSets: SetLog[] | undefined
): ExerciseStatus {
  if (!previousSets || previousSets.length === 0) return 'new';
  if (!currentSets || currentSets.length === 0) return 'removed';

  let hasImprovement = false;
  let hasDecline = false;

  const maxLen = Math.max(currentSets.length, previousSets.length);
  for (let i = 0; i < maxLen; i++) {
    const curr = currentSets[i];
    const prev = previousSets[i];
    if (curr && prev) {
      const result = compareSets(curr, prev);
      if (result.improved) hasImprovement = true;
      if (result.decreased) hasDecline = true;
      continue;
    }

    if (!curr && prev) {
      const inferredCurr = findRepresentativeSetByWeight(currentSets, prev.weight);
      if (!inferredCurr) continue;
      const result = compareSets(inferredCurr, prev);
      if (result.improved) hasImprovement = true;
      if (result.decreased) hasDecline = true;
      continue;
    }

    if (curr && !prev) {
      const inferredPrev = findRepresentativeSetByWeight(previousSets, curr.weight);
      if (!inferredPrev) continue;
      const result = compareSets(curr, inferredPrev);
      if (result.improved) hasImprovement = true;
      if (result.decreased) hasDecline = true;
    }
  }

  if (hasImprovement) return 'improved';
  if (hasDecline) return 'decreased';
  return 'same';
}

export function getStatusColor(status: ExerciseStatus): string {
  switch (status) {
    case 'improved': return 'bg-status-improved-bg border-status-improved';
    case 'decreased': return 'bg-status-decreased-bg border-status-decreased';
    case 'same': return 'bg-status-same-bg border-status-same';
    case 'holiday': return 'bg-status-holiday-bg border-status-holiday';
    case 'removed': return 'bg-status-removed-bg border-status-removed';
    case 'new': return 'bg-status-new-bg border-status-new';
  }
}

export function getStatusLabel(status: ExerciseStatus): string {
  switch (status) {
    case 'improved': return 'İlerleme';
    case 'decreased': return 'Düşüş';
    case 'same': return 'Aynı';
    case 'holiday': return 'Tatil';
    case 'removed': return 'Kaldırıldı';
    case 'new': return 'Yeni';
  }
}
