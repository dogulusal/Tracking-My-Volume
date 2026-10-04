import type { AppState, ExerciseDefinition, Program } from '@/types';
import { programVersionAt } from '@/utils/programVersions';

const activeDays = (state: AppState): Program[] => {
  const scope = programVersionAt(state, state.currentWeek);
  const plan = scope.plans.find(p => p.id === scope.activePlanId) ?? scope.plans[0];
  if (!plan) return [];
  return plan.programIds.flatMap(id => scope.programs.filter(program => program.id === id));
};

const active = (exercises: ExerciseDefinition[]) => exercises.filter(exercise => exercise.isActive);

function changedTarget(before: ExerciseDefinition, after: ExerciseDefinition): string[] {
  const parts: string[] = [];
  if (before.defaultSets !== after.defaultSets) parts.push(`${before.defaultSets} → ${after.defaultSets} set`);
  if (before.defaultReps !== after.defaultReps) parts.push(`${before.defaultReps} → ${after.defaultReps} tekrar`);
  if (before.defaultWeight !== after.defaultWeight) parts.push(`${before.defaultWeight} → ${after.defaultWeight} kg`);
  return parts;
}

/**
 * The program changes between two copies of someone's record, in words, for
 * the person whose program it is: "Üst A: + Incline Press",
 * "Üst A · Bench Press: 3 → 4 set". Only the plan in use this week counts.
 */
export function describeProgramChanges(before: AppState, after: AppState): string[] {
  const lines: string[] = [];
  const old = activeDays(before);
  const now = activeDays(after);

  for (const day of now) {
    const previous = old.find(item => item.id === day.id);
    if (!previous) {
      const count = active(day.exercises).length;
      lines.push(`Yeni gün: ${day.name}${count ? ` (${count} hareket)` : ''}`);
      continue;
    }
    if (previous.name !== day.name) lines.push(`${previous.name} → ${day.name}`);
    const was = active(previous.exercises);
    const is = active(day.exercises);
    for (const exercise of is) {
      const match = was.find(item => item.id === exercise.id);
      if (!match) { lines.push(`${day.name}: + ${exercise.name}`); continue; }
      const parts = changedTarget(match, exercise);
      if (match.name !== exercise.name) parts.unshift(`adı ${match.name} oldu`);
      if (parts.length) lines.push(`${day.name} · ${exercise.name}: ${parts.join(', ')}`);
    }
    for (const exercise of was) {
      if (!is.some(item => item.id === exercise.id)) lines.push(`${day.name}: − ${exercise.name}`);
    }
    const kept = is.filter(exercise => was.some(item => item.id === exercise.id)).map(exercise => exercise.id);
    const keptBefore = was.filter(exercise => kept.includes(exercise.id)).map(exercise => exercise.id);
    if (kept.join() !== keptBefore.join()) lines.push(`${day.name}: hareketlerin sırası değişti`);
  }
  for (const day of old) {
    if (!now.some(item => item.id === day.id)) lines.push(`Plandan çıktı: ${day.name}`);
  }
  return lines;
}
