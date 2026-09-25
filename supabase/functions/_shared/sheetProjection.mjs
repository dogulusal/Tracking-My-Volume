// This module has no browser dependencies so it can run in the Edge Function
// and in Node's regression tests.
const cleanTitle = (name, startWeek) => `Oto · ${String(name || `Faz ${startWeek}`).replace(/[\[\]:*?/\\]/g, ' ').trim()} · ${startWeek}`.slice(0, 100);
const intensityLabel = { failure: 'F', rir1: '+1', rir2: '+2', rir3: '+3' };
const fullSet = set => `${set.weight} x ${set.reps} ${intensityLabel[set.intensity] ?? ''}`.trim();
const setText = sets => {
  if (!Array.isArray(sets) || !sets.length) return '-';
  const first = sets[0];
  if (sets.every(set => set.weight === first.weight && set.reps === first.reps && set.intensity === first.intensity)) {
    return fullSet(first);
  }
  return sets.map((set, index) => {
    if (!index) return fullSet(set);
    const sameWeight = set.weight === sets[index - 1].weight;
    return sameWeight ? ` | ${set.reps} ${intensityLabel[set.intensity] ?? ''}`.trimEnd() : `\n${fullSet(set)}`;
  }).join('');
};

export function projectSheets(state) {
  const phases = [...(state.phases ?? [])].sort((a, b) => a.startWeek - b.startWeek);
  return phases.map(phase => {
    const end = phase.endWeek ?? Math.max(state.currentWeek ?? phase.startWeek, ...((state.weekLogs ?? []).map(log => log.weekNumber)));
    const logs = (state.weekLogs ?? []).filter(log => log.weekNumber >= phase.startWeek && log.weekNumber <= end);
    const versions = (state.programVersions ?? []).filter(v => v.phaseId === phase.id)
      .sort((a, b) => a.fromWeek - b.fromWeek);
    const programs = new Map();
    for (const version of versions) {
      for (const program of version.programs ?? []) {
        const existing = programs.get(program.id) ?? { ...program, exercises: [] };
        const exercises = new Map(existing.exercises.map(ex => [ex.id, ex]));
        for (const exercise of program.exercises ?? []) {
          if (exercise.isActive) exercises.set(exercise.id, exercise);
        }
        programs.set(program.id, { ...existing, ...program, exercises: [...exercises.values()] });
      }
    }
    if (!versions.length && phase.endWeek == null) {
      for (const program of state.programs ?? []) programs.set(program.id, program);
    }
    for (const log of logs) {
      const existing = programs.get(log.programId) ?? {
        id: log.programId, name: log.programId, order: programs.size, exercises: [],
      };
      const exercises = new Map(existing.exercises.map(ex => [ex.id, ex]));
      for (const exercise of log.exercises ?? []) {
        if (!exercises.has(exercise.exerciseId)) exercises.set(exercise.exerciseId, {
          id: exercise.exerciseId, name: exercise.exerciseName,
          defaultSets: exercise.sets?.length ?? 0, isActive: true,
        });
      }
      programs.set(log.programId, { ...existing, exercises: [...exercises.values()] });
    }
    const weekCount = Math.max(1, end - phase.startWeek + 1);
    const width = weekCount + 2;
    const rows = [];
    for (const program of [...programs.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      rows.push([program.name]);
      rows.push(['Egzersiz', 'Set', ...Array.from({ length: weekCount }, (_, i) => `H${i}`)]);
      for (const exercise of program.exercises ?? []) {
        const values = [exercise.name, String(exercise.defaultSets ?? '')];
        for (let offset = 0; offset < weekCount; offset++) {
          const log = logs.find(item => item.programId === program.id && item.weekNumber === phase.startWeek + offset);
          const recorded = log?.exercises?.find(item => item.exerciseId === exercise.id);
          values.push(log?.isHoliday ? 'TATİL' : recorded ? setText(recorded.sets) : '');
        }
        rows.push(values);
      }
      rows.push(['HAFTALIK NOTLAR', '', ...Array.from({ length: weekCount }, (_, i) =>
        logs.find(item => item.programId === program.id && item.weekNumber === phase.startWeek + i)?.notes ?? '')]);
      rows.push([]);
    }
    return { phaseId: phase.id, title: cleanTitle(phase.name, phase.startWeek), rows,
      rowCount: Math.max(100, rows.length + 1), columnCount: Math.max(26, width) };
  }).filter(sheet => sheet.rows.length > 0);
}
