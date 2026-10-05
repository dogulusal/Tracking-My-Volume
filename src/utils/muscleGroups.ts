import type { AppState, PhaseDefinition } from '@/types';

export const MUSCLE_GROUPS = ['Göğüs', 'Sırt', 'Omuz', 'Biceps', 'Triceps', 'Bacak', 'Baldır', 'Karın'] as const;
export type MuscleGroup = typeof MUSCLE_GROUPS[number];
export const UNASSIGNED = 'Atanmamış';
export type GroupOrUnassigned = MuscleGroup | typeof UNASSIGNED;

/**
 * An exercise is grouped by its name, so the same movement in several days
 * (or typed with different case) shares one group. Dotless and dotted i are
 * folded together because the names mix Turkish and English spelling.
 */
export function exerciseKey(name: string): string {
  return name.replace(/[İIı]/g, 'i').toLowerCase().replace(/\s+/g, ' ').trim();
}

// First match wins, so the specific movements come before the words they
// contain: "leg curl" is legs, not biceps; "shoulder press" is not chest.
const RULES: [RegExp, MuscleGroup][] = [
  [/kalf|calf|baldir/, 'Baldır'],
  [/crunch|karin|\babs?\b|plank|leg raise|sit ?up/, 'Karın'],
  [/leg (curl|ext|press)|squat|hack|\brdl\b|deadlift|lunge|adduct|abduct|hip thrust|glute|bacak|quad|hamstring|step ?up/, 'Bacak'],
  [/tricep|pushdown|push down|skull|french|kickback/, 'Triceps'],
  [/bicep|curl|hammer|preacher/, 'Biceps'],
  [/lateral|shoulder|omuz|delt|\bohp\b|military|face ?pull|upright|arnold/, 'Omuz'],
  [/pec|chest|göğüs|bench|incline|decline|\bfly\b|flye|push ?up|\bdips?\b|press/, 'Göğüs'],
  // \bchin: "machine" contains "chin".
  [/row|pulldown|pull ?up|\bchin|\blatt?\b|shrug|kelso|pullover|sirt|back|trap/, 'Sırt'],
];

/** The group the name suggests, or null when it says nothing (e.g. "Smith Machine"). */
export function suggestedGroup(name: string): MuscleGroup | null {
  const key = exerciseKey(name);
  return RULES.find(([pattern]) => pattern.test(key))?.[1] ?? null;
}

export function groupOf(name: string, overrides: Record<string, string> | undefined): GroupOrUnassigned {
  const chosen = overrides?.[exerciseKey(name)];
  if (chosen && (MUSCLE_GROUPS as readonly string[]).includes(chosen)) return chosen as MuscleGroup;
  return suggestedGroup(name) ?? UNASSIGNED;
}

/** `title` names the period on its own ("Faz 3 · H4", "Faz 2 H19 – Faz 3 H2"). */
export type VolumePeriod = { key: string; phaseName: string; label: string; title: string; weeks: number[] };

/** One period per week from week 0 to the current one, labelled within its phase. */
export function weeklyPeriods(phases: PhaseDefinition[], currentWeek: number): VolumePeriod[] {
  return blockPeriods(phases, currentWeek, 1);
}

/**
 * Blocks of `size` weeks counted from each phase's H0, so a block never
 * straddles two phases; the last block of a phase may be shorter. Old logs
 * carry made-up dates (imported one week apart), so calendar months would
 * not mean anything — four weeks stand in for a month.
 */
export function blockPeriods(phases: PhaseDefinition[], currentWeek: number, size = 4): VolumePeriod[] {
  const periods: VolumePeriod[] = [];
  for (const phase of [...phases].sort((a, b) => a.startWeek - b.startWeek)) {
    const end = Math.min(phase.endWeek ?? currentWeek, currentWeek);
    for (let from = phase.startWeek; from <= end; from += size) {
      const to = Math.min(from + size - 1, end);
      const weeks = Array.from({ length: to - from + 1 }, (_, i) => from + i);
      const label = to === from ? `H${from - phase.startWeek}` : `H${from - phase.startWeek}–H${to - phase.startWeek}`;
      periods.push({ key: `${phase.id}:${from}`, phaseName: phase.name, label, title: `${phase.name} · ${label}`, weeks });
    }
  }
  return periods;
}

/**
 * The last `size` weeks up to the current one, then the `size` before those,
 * and so on back to week 0 (the oldest may be shorter). Unlike phase blocks
 * these may straddle two phases: a phase-aligned block that had just begun
 * held a single week and showed the same numbers as the weekly view, which
 * looked like a bug.
 */
export function recentBlocks(phases: PhaseDefinition[], currentWeek: number, size = 4): VolumePeriod[] {
  const sorted = [...phases].sort((a, b) => a.startWeek - b.startWeek);
  const phaseOf = (week: number) => [...sorted].reverse().find(phase => phase.startWeek <= week);
  const name = (week: number) => { const phase = phaseOf(week); return phase ? `${phase.name} H${week - phase.startWeek}` : `Hafta ${week}`; };
  const periods: VolumePeriod[] = [];
  for (let to = currentWeek; to >= 0; to -= size) {
    const from = Math.max(0, to - size + 1);
    const start = phaseOf(from);
    const end = phaseOf(to);
    const weeks = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const sameStart = start && end && start.id === end.id;
    const label = from === to ? `H${to - (end?.startWeek ?? 0)}` : sameStart ? `H${from - start.startWeek}–H${to - end.startWeek}` : `${name(from)} – ${name(to)}`;
    periods.push({
      key: `son:${to}`, phaseName: end?.name ?? '', label, weeks,
      title: sameStart || from === to ? `${end?.name ?? ''} · ${label}` : label,
    });
  }
  return periods.reverse();
}

export type VolumeCell = { sets: number; tonnage: number };

/**
 * Working sets and tonnage (kg × reps) per muscle group and period. Every
 * logged set with reps counts as one set; holiday weeks count nothing.
 */
export function muscleVolume(state: Pick<AppState, 'weekLogs' | 'muscleGroups'>, periods: VolumePeriod[]) {
  const periodOfWeek = new Map<number, number>();
  periods.forEach((period, index) => period.weeks.forEach(week => periodOfWeek.set(week, index)));
  const table = new Map<GroupOrUnassigned, VolumeCell[]>();
  const cellsFor = (group: GroupOrUnassigned) => {
    let cells = table.get(group);
    if (!cells) table.set(group, cells = periods.map(() => ({ sets: 0, tonnage: 0 })));
    return cells;
  };
  for (const log of state.weekLogs) {
    const index = periodOfWeek.get(log.weekNumber);
    if (index === undefined || log.isHoliday) continue;
    for (const exercise of log.exercises) {
      const worked = exercise.sets.filter(set => set.reps > 0);
      if (!worked.length) continue;
      const cell = cellsFor(groupOf(exercise.exerciseName, state.muscleGroups))[index];
      cell.sets += worked.length;
      cell.tonnage += worked.reduce((sum, set) => sum + set.weight * set.reps, 0);
    }
  }
  const order: GroupOrUnassigned[] = [...MUSCLE_GROUPS, UNASSIGNED];
  return order.filter(group => table.has(group)).map(group => ({ group, cells: table.get(group)! }));
}

/** Every exercise name in the log, one per key, with the spelling used most. */
export function loggedExercises(state: Pick<AppState, 'weekLogs'>): { key: string; name: string; sets: number }[] {
  const byKey = new Map<string, { sets: number; spellings: Map<string, number> }>();
  for (const log of state.weekLogs) {
    for (const exercise of log.exercises) {
      const key = exerciseKey(exercise.exerciseName);
      const entry = byKey.get(key) ?? { sets: 0, spellings: new Map() };
      entry.sets += exercise.sets.length;
      entry.spellings.set(exercise.exerciseName.trim(), (entry.spellings.get(exercise.exerciseName.trim()) ?? 0) + 1);
      byKey.set(key, entry);
    }
  }
  return [...byKey].map(([key, { sets, spellings }]) => ({
    key, sets, name: [...spellings].sort((a, b) => b[1] - a[1])[0][0],
  }));
}
