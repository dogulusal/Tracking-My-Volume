import type { SetLog, ExerciseStatus } from '@/types';
import { calculateExerciseStatus as sharedStatus } from '../../supabase/functions/_shared/historyGrid.mjs';

/**
 * Compares a week's sets with the previous record. The rule lives in the
 * module the automatic Sheet uses too, so the app and the Sheet colour every
 * cell the same way.
 */
export function calculateExerciseStatus(
  currentSets: SetLog[] | undefined,
  previousSets: SetLog[] | undefined,
): ExerciseStatus {
  return sharedStatus(currentSets, previousSets);
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
    case 'new': return 'Referans';
  }
}
