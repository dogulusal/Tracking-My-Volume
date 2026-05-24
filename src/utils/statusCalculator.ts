import type { SetLog, ExerciseStatus } from '@/types';

function compareSets(curr: SetLog, prev: SetLog): { improved: boolean; decreased: boolean } {
  return {
    improved: curr.weight > prev.weight || curr.reps > prev.reps,
    decreased: curr.weight < prev.weight || curr.reps < prev.reps,
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
