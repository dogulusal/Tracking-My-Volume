import type { AppState, ExerciseDefinition, Program } from '@/types';
import { programVersionAt } from '@/utils/programVersions';
import { exerciseKey } from '@/utils/muscleGroups';

/** The plan's days this week; the plan in use when no id is given. */
const planDays = (state: AppState, planId?: string): Program[] => {
  const scope = programVersionAt(state, state.currentWeek);
  const plan = planId ? scope.plans.find(p => p.id === planId) : scope.plans.find(p => p.id === scope.activePlanId) ?? scope.plans[0];
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
 * "Üst A · Bench Press: 3 → 4 set". One plan counts: the given one, or the
 * plan in use this week.
 */
export function describeProgramChanges(before: AppState, after: AppState, planId?: string): string[] {
  const lines: string[] = [];
  const old = planDays(before, planId);
  const now = planDays(after, planId);

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
  // A video belongs to the movement, not the day: said once per movement.
  const seen = new Set<string>();
  for (const exercise of now.flatMap(day => active(day.exercises))) {
    const key = exerciseKey(exercise.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const was = before.exerciseSettings?.[key]?.videoUrl;
    const is = after.exerciseSettings?.[key]?.videoUrl;
    if (was !== is) lines.push(`${exercise.name}: ${!was ? 'video eklendi' : !is ? 'video kaldırıldı' : 'video değişti'}`);
  }
  return lines;
}
