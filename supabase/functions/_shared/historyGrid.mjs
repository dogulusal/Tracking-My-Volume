// One phase of the training log laid out as a grid: exercise rows, week
// columns, every set on its own line, a comparison status per cell and the
// week notes. The History page, the Charts page and the automatic Sheet tab
// all draw from this module, so a row, its text and its colour are the same
// in every place.
// No browser or Deno dependencies: it runs in the app, the Edge Function and
// Node's regression tests.

const INTENSITY_SCORE = { failure: 0, rir1: 1, rir2: 2, rir3: 3, F: 0, '+1': 1, '+2': 2, '+3': 3 };
const INTENSITY_LABEL = { failure: 'F', rir1: '+1', rir2: '+2', rir3: '+3', F: 'F', '+1': '+1', '+2': '+2', '+3': '+3' };

export const GRID_LEGEND = 'Mavi: referans  ·  Yeşil: ilerleme  ·  Gri: aynı  ·  Kırmızı: düşüş';

// Light is the Sheet's own palette; dark keeps the same hues for the app's
// dark theme so the grid does not turn into a white slab at night.
export const GRID_PALETTE = {
  light: {
    title: '#29323a', titleText: '#ffffff', legend: '#d8dde1',
    header: '#424d57', headerText: '#ffffff',
    label: '#f6f7f8', canvas: '#ffffff', ink: '#24312b', muted: '#6b7680', rule: '#e1e4e8',
    note: '#fff4d6', noteText: '#5f5130',
    new: '#cfe2f3', improved: '#dcebd7', decreased: '#f6d3d4', same: '#e8edf0',
  },
  dark: {
    title: '#1d252c', titleText: '#f3f5f6', legend: '#9aa6b0',
    header: '#2b353e', headerText: '#f3f5f6',
    label: '#15191d', canvas: '#101316', ink: '#e4e8eb', muted: '#8a949c', rule: '#252c32',
    note: '#302a1a', noteText: '#e6d7ad',
    new: '#1b3148', improved: '#1b3a26', decreased: '#472125', same: '#262d33',
  },
};

/** Background for a cell status; holiday, removed and empty cells stay on the canvas. */
export function statusFill(palette, status) {
  return status === 'new' || status === 'improved' || status === 'decreased' || status === 'same'
    ? palette[status] : palette.canvas;
}

export function formatSetLine(set) {
  return `${set.weight} x ${set.reps} ${INTENSITY_LABEL[set.intensity] ?? ''}`.trim();
}

const intensityScore = intensity => INTENSITY_SCORE[intensity] ?? 0;

function compareSets(curr, prev) {
  const intensityDelta = intensityScore(curr.intensity) - intensityScore(prev.intensity);
  return {
    improved: curr.weight > prev.weight || curr.reps > prev.reps || intensityDelta > 0,
    decreased: curr.weight < prev.weight || curr.reps < prev.reps || intensityDelta < 0,
  };
}

/**
 * The app's comparison of a week's sets with the previous record: any set
 * that is heavier, has more reps or more reserve counts as progress, and
 * progress wins over a drop elsewhere. Sets are paired by position; a set
 * without a partner is paired with one of the same weight.
 */
export function calculateExerciseStatus(currentSets, previousSets) {
  if (!previousSets || previousSets.length === 0) return 'new';
  if (!currentSets || currentSets.length === 0) return 'removed';

  let hasImprovement = false;
  let hasDecline = false;
  const maxLen = Math.max(currentSets.length, previousSets.length);
  for (let i = 0; i < maxLen; i++) {
    const curr = currentSets[i] ?? currentSets.find(set => set.weight === previousSets[i]?.weight);
    const prev = previousSets[i] ?? previousSets.find(set => set.weight === currentSets[i]?.weight);
    if (!curr || !prev) continue;
    const result = compareSets(curr, prev);
    if (result.improved) hasImprovement = true;
    if (result.decreased) hasDecline = true;
  }
  if (hasImprovement) return 'improved';
  if (hasDecline) return 'decreased';
  return 'same';
}

function applySavedOrder(ids, savedOrder) {
  if (!savedOrder || savedOrder.length === 0) return ids;
  const present = new Set(ids);
  const ordered = savedOrder.filter(id => present.has(id));
  const seen = new Set(ordered);
  return [...ordered, ...ids.filter(id => !seen.has(id))];
}

const byStart = (a, b) => a.startWeek - b.startWeek;

// The program definitions in force at `week`, as programVersionAt resolves
// them in the app: the phase's latest version so far, else the previous
// phase's, else the top-level programs.
function versionAt(state, phases, phase, week) {
  const version = (state.programVersions ?? [])
    .filter(v => v.phaseId === phase.id && v.fromWeek <= week - phase.startWeek)
    .sort((a, b) => b.fromWeek - a.fromWeek)[0];
  if (version) return version;
  if (phase.startWeek > 0) {
    const previous = phases.find(p => p !== phase && p.startWeek <= phase.startWeek - 1
      && (p.endWeek == null || p.endWeek >= phase.startWeek - 1));
    if (previous) return versionAt(state, phases, previous, phase.startWeek - 1);
  }
  return { programs: state.programs ?? [], plans: state.plans ?? [], activePlanId: state.activePlanId ?? null };
}

// Programs of the phase, as the History tabs list them: every program of the
// active plan in any of the phase's versions, then programs that only have
// workouts in the phase.
function phasePrograms(state, phases, phase, weeks, logs) {
  const own = (state.programVersions ?? [])
    .filter(v => v.phaseId === phase.id && (phase.endWeek == null || v.fromWeek <= phase.endWeek - phase.startWeek))
    .sort((a, b) => a.fromWeek - b.fromWeek);
  const versions = own.length ? own : [versionAt(state, phases, phase, weeks[weeks.length - 1] ?? phase.startWeek)];
  const programs = new Map();
  for (const version of versions) {
    const plans = version.plans ?? [];
    const active = plans.find(plan => plan.id === version.activePlanId) ?? plans[0];
    for (const program of (version.programs ?? []).filter(p => !active || active.programIds.includes(p.id))) {
      programs.set(program.id, { id: program.id, name: program.name, order: program.order ?? 0 });
    }
  }
  for (const log of logs.filter(l => !l.isHoliday && l.exercises?.length)) {
    if (programs.has(log.programId)) continue;
    const known = (state.programs ?? []).find(p => p.id === log.programId);
    programs.set(log.programId, { id: log.programId, name: known?.name ?? log.programId, order: known?.order ?? programs.size });
  }
  return [...programs.values()].sort((a, b) => a.order - b.order);
}

/**
 * Build the grid for one phase: weeks from its H0 up to the current week (or
 * its last week, once finished), one block per program.
 */
export function buildPhaseGrid(state, phaseId) {
  const phases = [...(state.phases ?? [])].sort(byStart);
  const phase = phases.find(p => p.id === phaseId);
  if (!phase) return null;
  const currentWeek = state.currentWeek ?? phase.startWeek;
  const end = Math.min(phase.endWeek ?? currentWeek, currentWeek);
  const weeks = [];
  for (let week = phase.startWeek; week <= end; week++) weeks.push(week);
  const logs = (state.weekLogs ?? []).filter(log => weeks.includes(log.weekNumber))
    .sort((a, b) => a.weekNumber - b.weekNumber);
  const lastWeek = weeks[weeks.length - 1] ?? phase.startWeek;
  const definitions = versionAt(state, phases, phase, lastWeek).programs ?? [];
  // A manual row order is kept per program, not per phase; it describes the
  // current arrangement, so only the latest phase follows it.
  const isLatestPhase = phases[phases.length - 1] === phase;

  const programs = phasePrograms(state, phases, phase, weeks, logs).map(program => {
    const programLogs = logs.filter(log => log.programId === program.id);
    const definition = definitions.find(p => p.id === program.id);
    const ids = [];
    const loggedName = new Map();
    for (const log of programLogs) {
      for (const exercise of log.exercises ?? []) {
        if (!ids.includes(exercise.exerciseId)) ids.push(exercise.exerciseId);
        if (!loggedName.has(exercise.exerciseId)) loggedName.set(exercise.exerciseId, exercise.exerciseName);
      }
    }
    for (const exercise of definition?.exercises ?? []) {
      if (exercise.isActive && !ids.includes(exercise.id)) ids.push(exercise.id);
    }
    const ordered = isLatestPhase ? applySavedOrder(ids, state.exerciseRowOrder?.[program.id]) : ids;
    // A row whose movement the program no longer has keeps its records; it
    // carries the week it left (the one after it was last in the program),
    // so the page can mark it or leave it out.
    const activeByWeek = weeks.map(week => new Set((versionAt(state, phases, phase, week).programs ?? [])
      .find(p => p.id === program.id)?.exercises?.filter(exercise => exercise.isActive).map(exercise => exercise.id)));
    const removedAt = exerciseId => {
      if (definition?.exercises?.some(exercise => exercise.id === exerciseId && exercise.isActive)) return null;
      const last = activeByWeek.findLastIndex(ids => ids.has(exerciseId));
      return weeks[last + 1] ?? phase.startWeek;
    };
    const logAt = week => programLogs.find(log => log.weekNumber === week);
    const recordAt = (week, exerciseId) => logAt(week)?.exercises?.find(exercise => exercise.exerciseId === exerciseId);

    const rows = ordered.map(exerciseId => {
      const defined = definition?.exercises?.find(exercise => exercise.id === exerciseId);
      const cells = weeks.map(week => {
        const log = programLogs.find(item => item.weekNumber === week);
        if (log?.isHoliday) return { week, text: 'TATİL', status: 'holiday' };
        const record = recordAt(week, exerciseId);
        if (!record) return { week, text: '', status: null };
        if (!record.sets?.length) return { week, text: '-', status: null };
        // The nearest earlier record, passing over days marked hard (ill, no
        // sleep, in a rush): the next week is measured against the last
        // normal one. With only hard days before it, the nearest still counts.
        let compareWeek = null;
        let fallbackWeek = null;
        for (let earlier = week - 1; earlier >= phase.startWeek && compareWeek === null; earlier--) {
          if (!recordAt(earlier, exerciseId)) continue;
          fallbackWeek ??= earlier;
          if (!logAt(earlier).offDay) compareWeek = earlier;
        }
        compareWeek ??= fallbackWeek;
        const previous = compareWeek === null ? null : recordAt(compareWeek, exerciseId);
        return { week, text: record.sets.map(formatSetLine).join('\n'), sets: record.sets,
          status: previous ? calculateExerciseStatus(record.sets, previous.sets) : 'new',
          ...(compareWeek !== null && { compareWeek }) };
      });
      return { exerciseId, name: defined?.name || loggedName.get(exerciseId) || exerciseId,
        defaultSets: defined?.defaultSets ?? null, removedAt: removedAt(exerciseId), cells };
    });
    // A movement's own note follows the week note, named, so the row still
    // holds everything written about that workout.
    const notes = weeks.map(week => {
      const log = programLogs.find(item => item.weekNumber === week);
      const exerciseNotes = (log?.exercises ?? []).filter(exercise => exercise.note?.trim())
        .map(exercise => `${exercise.exerciseName}: ${exercise.note.trim()}`);
      return [log?.offDay ? 'Zor gün' : '', log?.notes ?? '', ...exerciseNotes].filter(Boolean).join('\n');
    });
    return { ...program, rows, notes };
  });

  return { phaseId: phase.id, name: phase.name, startWeek: phase.startWeek, weeks, programs };
}
